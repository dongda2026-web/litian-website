import { mkdirSync, chmodSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const DAY = 86400000;
const pipelines = new Set(['notification', 'crm']);
const errorCodes = new Set(['origin_required', 'origin_not_allowed', 'rate_limited', 'idempotency_key_required', 'idempotency_conflict',
  'invalid_payload', 'spam_detected', 'validation_failed', 'json_required', 'request_too_large', 'invalid_json', 'service_unavailable']);
const iso = now => new Date(now).toISOString();

export function backupBeforeMonitoring(db, path) {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'inquiries'").get()) return null;
  const installed = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'monitor_meta'").get();
  if (installed && db.prepare('PRAGMA table_info(notifications)').all().some(row => row.name === 'accepted_at')) return null;
  return backupPrivateDatabase(db, path, 'pre-a9');
}

export function backupPrivateDatabase(db, path, prefix) {
  if (!['pre-a9', 'pre-a12'].includes(prefix)) throw new TypeError('Invalid private backup identity');
  const directory = join(dirname(path), 'backups'); mkdirSync(directory, { recursive: true, mode: 0o700 }); chmodSync(directory, 0o700);
  const target = join(directory, prefix + '-' + Date.now() + '-' + randomUUID() + '.sqlite');
  db.prepare('VACUUM INTO ?').run(target); chmodSync(target, 0o600);
  const copy = new DatabaseSync(target, { readOnly: true });
  try { if (copy.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Pre-migration backup failed integrity validation'); }
  finally { copy.close(); }
  for (const file of [target, directory]) { const descriptor = openSync(file, 'r'); try { fsyncSync(descriptor); } finally { closeSync(descriptor); } }
  return target;
}

export function initializeMonitoring(store) {
  const db = store.db;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const [column, definition] of [['lease_token', "TEXT NOT NULL DEFAULT ''"], ['accepted_at', "TEXT NOT NULL DEFAULT ''"]]) {
      if (!db.prepare('PRAGMA table_info(notifications)').all().some(row => row.name === column)) db.exec(`ALTER TABLE notifications ADD COLUMN ${column} ${definition}`);
    }
    db.exec(`CREATE TABLE IF NOT EXISTS monitor_meta (id INTEGER PRIMARY KEY CHECK(id = 1), started_at TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS monitor_requests (
        day TEXT NOT NULL, status INTEGER NOT NULL, code TEXT NOT NULL, count INTEGER NOT NULL, total_ms INTEGER NOT NULL,
        PRIMARY KEY(day,status,code)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS monitor_deliveries (
        day TEXT NOT NULL, pipeline TEXT NOT NULL, outcome TEXT NOT NULL, code TEXT NOT NULL, count INTEGER NOT NULL,
        PRIMARY KEY(day,pipeline,outcome,code)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS monitor_workers (
        pipeline TEXT PRIMARY KEY CHECK(pipeline IN ('crm','notification')), checked_at TEXT NOT NULL, outcome TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS notifications_accepted_idx ON notifications(accepted_at);
      CREATE INDEX IF NOT EXISTS crm_synced_idx ON crm_deliveries(synced_at);
      CREATE INDEX IF NOT EXISTS followups_response_idx ON followups(inquiry_id,created_at,status);`);
    db.prepare('INSERT OR IGNORE INTO monitor_meta (id,started_at) VALUES (1,?)').run(iso(Date.now()));
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  store.monitoringWriteError = false;
  store.monitoringPrunedAt = 0;
}

function prune(store, now) {
  if (now - store.monitoringPrunedAt < 3600000) return;
  const before = iso(now - 89 * DAY).slice(0, 10);
  for (const table of ['monitor_requests', 'monitor_deliveries']) store.db.prepare(`DELETE FROM ${table} WHERE day < ?`).run(before);
  store.monitoringPrunedAt = now;
}

// Bounded daily counters only. No URL, query, body, address, identity or provider message is retained.
export function recordIntakeRequest(store, status, code, milliseconds, now = Date.now()) {
  if (![200, 201, 400, 403, 409, 413, 415, 422, 429, 503].includes(status)) return;
  const safeCode = status === 201 ? 'created' : status === 200 ? 'duplicate' : errorCodes.has(code) ? code : 'service_unavailable';
  try {
    prune(store, now);
    store.db.prepare(`INSERT INTO monitor_requests (day,status,code,count,total_ms) VALUES (?,?,?,1,?)
      ON CONFLICT(day,status,code) DO UPDATE SET count = count + 1, total_ms = total_ms + excluded.total_ms`)
      .run(iso(now).slice(0, 10), status, safeCode, Math.max(0, Math.min(60000, Math.round(milliseconds))));
  } catch { store.monitoringWriteError = true; }
}

export function recordWorkerCheck(store, pipeline, outcome, now = Date.now()) {
  if (!pipelines.has(pipeline) || !['polling', 'idle', 'disabled', 'accepted', 'synced', 'failed', 'blocked', 'lease_expired'].includes(outcome)) throw new TypeError('Invalid worker observation');
  try {
    prune(store, now);
    store.db.prepare(`INSERT INTO monitor_workers (pipeline,checked_at,outcome) VALUES (?,?,?)
      ON CONFLICT(pipeline) DO UPDATE SET checked_at = excluded.checked_at, outcome = excluded.outcome`).run(pipeline, iso(now), outcome);
  } catch { store.monitoringWriteError = true; }
}

export function finishDelivery(store, pipeline, id, lease, outcome, code = '', nextAt = 0, mainLeadId = '', now = Date.now()) {
  if (!pipelines.has(pipeline) || !(pipeline === 'crm' ? ['synced', 'failed', 'blocked'] : ['accepted', 'failed']).includes(outcome)) throw new TypeError('Invalid delivery transition');
  const safeCode = code === '' || ['delivery_not_confirmed', 'configuration_changed', 'attachment_transport_pending'].includes(code) || /^http_[1-5]\d{2}$/.test(code) ? code : 'delivery_not_confirmed';
  const db = store.db;
  db.exec('BEGIN IMMEDIATE');
  try {
    const updated = pipeline === 'crm'
      ? db.prepare(`UPDATE crm_deliveries SET status = ?, last_error = ?, next_at = ?, main_lead_id = ?, lease_until = 0,
          lease_token = '', synced_at = ? WHERE inquiry_id = ? AND lease_token = ?`)
        .run(outcome, safeCode, nextAt, mainLeadId, outcome === 'synced' ? iso(now) : '', id, lease)
      : db.prepare(`UPDATE notifications SET status = ?, last_error = ?, next_at = ?, lease_until = 0,
          lease_token = '', accepted_at = ? WHERE inquiry_id = ? AND lease_token = ?`)
        .run(outcome, safeCode, nextAt, outcome === 'accepted' ? iso(now) : '', id, lease);
    if (updated.changes) {
      db.prepare(`INSERT INTO monitor_deliveries (day,pipeline,outcome,code,count) VALUES (?,?,?,?,1)
        ON CONFLICT(day,pipeline,outcome,code) DO UPDATE SET count = count + 1`).run(iso(now).slice(0, 10), pipeline, outcome, safeCode);
    }
    db.exec('COMMIT');
    recordWorkerCheck(store, pipeline, updated.changes ? outcome : 'lease_expired', now);
    return updated;
  } catch (error) { db.exec('ROLLBACK'); store.monitoringWriteError = true; throw error; }
}

function queue(store, pipeline, configured, now) {
  const crm = pipeline === 'crm', table = crm ? 'crm_deliveries' : 'notifications', success = crm ? 'synced' : 'accepted';
  const rows = store.db.prepare(`SELECT d.status, COUNT(*) AS count, MIN(i.received_at) AS oldest
    FROM ${table} d JOIN inquiries i ON i.id = d.inquiry_id GROUP BY d.status`).all();
  const counts = Object.fromEntries((crm ? ['pending', 'sending', 'failed', 'blocked', 'synced'] : ['pending', 'sending', 'failed', 'accepted']).map(status => [status, 0]));
  let oldest = null;
  for (const row of rows) {
    if (Object.hasOwn(counts, row.status)) counts[row.status] = row.count;
    if (row.status !== success && (!oldest || row.oldest < oldest)) oldest = row.oldest;
  }
  const worker = store.db.prepare('SELECT checked_at AS checkedAt, outcome FROM monitor_workers WHERE pipeline = ?').get(pipeline);
  const observedAge = worker ? now - Date.parse(worker.checkedAt) : null;
  return { configured, counts, oldestPendingAt: oldest, oldestPendingMinutes: oldest ? Math.max(0, Math.floor((now - Date.parse(oldest)) / 60000)) : null,
    worker: { state: !configured ? 'not_configured' : !worker || worker.outcome === 'disabled' ? 'not_observed' : observedAge > 60000 || observedAge < 0 ? 'stale' : 'recently_observed',
      checkedAt: worker?.checkedAt || null, outcome: worker?.outcome || null } };
}

export function readMonitoring(store, days = 7, config = {}, now = Date.now()) {
  if (![7, 30, 90].includes(days) || !Number.isFinite(now)) throw new RangeError('Invalid monitoring range');
  const end = iso(now), start = iso(Date.parse(end.slice(0, 10) + 'T00:00:00.000Z') - (days - 1) * DAY);
  const startDay = start.slice(0, 10), endDay = end.slice(0, 10), db = store.db;
  const daily = new Map(Array.from({ length: days }, (_, index) => [iso(Date.parse(start) + index * DAY).slice(0, 10), { day: iso(Date.parse(start) + index * DAY).slice(0, 10), received: 0, crmSaved: 0, gatewayAccepted: 0 }]));
  for (const [table, column, key] of [['inquiries', 'received_at', 'received'], ['crm_deliveries', 'synced_at', 'crmSaved'], ['notifications', 'accepted_at', 'gatewayAccepted']]) {
    for (const row of db.prepare(`SELECT substr(${column},1,10) AS day, COUNT(*) AS count FROM ${table} WHERE ${column} >= ? AND ${column} <= ? GROUP BY day`).all(start, end)) daily.get(row.day)[key] = row.count;
  }
  const byType = db.prepare(`SELECT CASE WHEN json_extract(payload,'$.type') IN ('inquiry','quote-calculator','multi-product-rfq','sample-request','ai-customer-service')
    THEN json_extract(payload,'$.type') ELSE 'other' END AS type, COUNT(*) AS count FROM inquiries WHERE received_at >= ? AND received_at <= ? GROUP BY type`).all(start, end);
  const requests = db.prepare(`SELECT status, code, SUM(count) AS count, SUM(total_ms) AS totalMs FROM monitor_requests WHERE day >= ? AND day <= ? GROUP BY status,code ORDER BY status,code`).all(startDay, endDay);
  const deliveries = db.prepare(`SELECT pipeline,outcome,code,SUM(count) AS count FROM monitor_deliveries WHERE day >= ? AND day <= ? GROUP BY pipeline,outcome,code ORDER BY pipeline,outcome,code`).all(startDay, endDay);
  const local = db.prepare(`WITH first_progress AS (SELECT f.inquiry_id, MIN(f.created_at) AS at FROM followups f
    JOIN inquiries cohort ON cohort.id = f.inquiry_id WHERE f.status != 'new' AND cohort.received_at >= ? AND cohort.received_at <= ? GROUP BY f.inquiry_id)
    SELECT COUNT(f.at) AS sampled, AVG((julianday(f.at) - julianday(i.received_at)) * 1440) AS averageMinutes,
      COALESCE(SUM(f.at IS NULL AND c.status != 'synced'),0) AS unrecordedLocal, COALESCE(SUM(f.at IS NULL AND c.status = 'synced'),0) AS erpUnobserved
    FROM inquiries i JOIN crm_deliveries c ON c.inquiry_id = i.id LEFT JOIN first_progress f ON f.inquiry_id = i.id AND f.at >= i.received_at AND f.at <= ?
    WHERE i.received_at >= ? AND i.received_at <= ?`).get(start, end, end, start, end);
  const dailyRows = [...daily.values()], requestCount = requests.reduce((total, row) => total + row.count, 0);
  return { version: '2026.10.08-a9', period: { days, start, end, timeZone: 'UTC' }, observationStartedAt: db.prepare('SELECT started_at FROM monitor_meta WHERE id = 1').get().started_at,
    captureHealthy: !store.monitoringWriteError, totals: { received: dailyRows.reduce((sum, row) => sum + row.received, 0), crmSaved: dailyRows.reduce((sum, row) => sum + row.crmSaved, 0),
      gatewayAccepted: dailyRows.reduce((sum, row) => sum + row.gatewayAccepted, 0), failedAttempts: deliveries.filter(row => ['failed','blocked'].includes(row.outcome)).reduce((sum, row) => sum + row.count, 0) },
    daily: dailyRows, byType, requests: { count: requestCount, averageMilliseconds: requestCount ? Math.round(requests.reduce((sum, row) => sum + row.totalMs, 0) / requestCount) : null, outcomes: requests.map(({ totalMs, ...row }) => row) },
    deliveryAttempts: deliveries, queues: { crm: queue(store, 'crm', Boolean(config.crmConfigured), now), notification: queue(store, 'notification', Boolean(config.notificationConfigured), now) },
    legacyAcceptedWithoutTime: db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE status = 'accepted' AND accepted_at = ''").get().count,
    localProgress: { sampled: local.sampled, averageMinutes: local.averageMinutes == null ? null : Math.round(local.averageMinutes), unrecordedLocal: config.crmConfigured ? null : local.unrecordedLocal, erpUnobserved: local.erpUnobserved, erpFollowupReadback: false },
    attribution: { enabled: false }, funnel: { enabled: false }, retentionDays: 90 };
}
