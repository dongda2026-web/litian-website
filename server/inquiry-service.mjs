import { createServer } from 'node:http';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { AdminSessions, equalSecret } from './admin-sessions.mjs';
import { PrivateUploads, UPLOAD_LIMITS } from './private-uploads.mjs';
import { UploadError } from './upload-scanner.mjs';
import { serveAdminUi } from './admin-ui.mjs';
import { crmConfiguration, readAcknowledgement } from './crm-delivery.mjs';
import { backupBeforeMonitoring, initializeMonitoring, recordIntakeRequest, recordWorkerCheck, finishDelivery, readMonitoring } from './inquiry-monitoring.mjs';
import '../assets/js/catalog-core.js';
import '../assets/js/procurement-core.js';
import '../assets/js/customization-core.js';
import '../assets/js/rfq-list-core.js';
import '../assets/js/sample-request-core.js';

const schema = JSON.parse(readFileSync(new URL('../content/inquiry-schema.json', import.meta.url), 'utf8'));
const catalog = globalThis.DongDaCatalog.create(JSON.parse(readFileSync(new URL('../content/products.json', import.meta.url), 'utf8')));
const statuses = new Set(['new', 'contacted', 'qualified', 'quoted', 'closed']);
const hash = value => createHash('sha256').update(value).digest('hex');

export class RequestError extends Error {
  constructor(status, code, fields = []) { super(code); this.status = status; this.code = code; this.fields = fields; }
}

export function validateLead(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RequestError(422, 'invalid_payload');
  if (input.attachments !== undefined) throw new RequestError(422, 'attachments_require_upload');
  const fields = [], lead = {};
  if (input.honeypot) throw new RequestError(422, 'spam_detected');
  if (!schema.leadTypes.includes(input.type)) fields.push('type');
  lead.type = input.type;
  for (const [key, limit] of Object.entries(schema.limits)) {
    const value = input[key] ?? '';
    if (key === 'specifications' && value && typeof value === 'object' && !Array.isArray(value)) {
      if (Object.keys(value).length > 30 || Object.entries(value).some(([id, item]) => !/^[a-zA-Z0-9_-]{1,40}$/.test(id) || typeof item !== 'string' || item.length > 120)) fields.push(key);
      else lead[key] = value;
      if (JSON.stringify(value).length > limit) fields.push(key);
    } else if ((key === 'quantity' && typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 1000000000) || typeof value === 'string') {
      const text = String(value).trim();
      if (text.length > limit) fields.push(key);
      lead[key] = text;
    } else fields.push(key);
  }
  for (const key of schema.required) if (!lead[key]) fields.push(key);
  if (lead.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lead.email)) fields.push('email');
  for (const [key, limit] of [['language', 20], ['quantityUnit', 16]]) {
    if (input[key] != null && (typeof input[key] !== 'string' || input[key].length > limit)) fields.push(key);
    lead[key] = typeof input[key] === 'string' ? input[key] : '';
  }
  if (lead.type === 'quote-calculator') {
    if (!/^\d+$/.test(lead.quantity) || Number(lead.quantity) < 1 || Number(lead.quantity) > 1000000000) fields.push('quantity');
    if (lead.quantityUnit !== 'pcs') fields.push('quantityUnit');
    if (!lead.productId || typeof lead.specifications !== 'object') fields.push('specifications');
    const product = catalog.resolve(lead.productId);
    if (!product || product.kind !== 'product') fields.push('productId');
    else {
      if (Object.keys(globalThis.DongDaProcurement.validateConfiguration(product, lead.specifications)).length) fields.push('specifications');
      if (Number(lead.specifications?.qty) !== Number(lead.quantity)) fields.push('quantity');
    }
  }
  if (lead.type === 'multi-product-rfq') {
    try { lead.items = globalThis.DongDaRfqList.validateItems(input.items, catalog); } catch { fields.push('items'); }
    for (const key of ['destination', 'deliveryWindow']) {
      if (typeof input[key] !== 'string' || input[key].length > 160 || (key === 'destination' && !input[key].trim())) fields.push(key);
      else lead[key] = input[key].trim();
    }
    if (lead.productId || lead.quantity || lead.quantityUnit || lead.specifications) fields.push('items');
  } else if (input.items !== undefined || input.destination !== undefined || input.deliveryWindow !== undefined) fields.push('type');
  if (lead.type === 'sample-request') {
    const product = catalog.resolve(lead.productId);
    if (!product || product.kind !== 'product' || product.id !== lead.productId) fields.push('productId');
    if (lead.quantity || lead.quantityUnit || lead.specifications) fields.push('sampleRequest');
    try { lead.sampleRequest = globalThis.DongDaSampleRequest.validate(input.sampleRequest); } catch { fields.push('sampleRequest'); }
  } else if (input.sampleRequest !== undefined) fields.push('type');
  if(input.customization !== undefined) {
    if(lead.type !== 'quote-calculator')fields.push('type');
    else try { lead.customization=globalThis.DongDaCustomization.validate(input.customization);if(lead.specifications?.qty !== lead.quantity)fields.push('quantity'); } catch { fields.push('customization'); }
  }
  if (fields.length) throw new RequestError(422, 'validation_failed', [...new Set(fields)]);
  return lead;
}

export class InquiryStore {
  constructor(path) {
    if (!isAbsolute(path)) throw new Error('INQUIRY_DB_PATH must be an absolute persistent file path');
    this.path = path;
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path, { timeout: 5000 });
    chmodSync(path, 0o600);
    try { this.monitoringBackupPath = backupBeforeMonitoring(this.db, path); }
    catch (error) { this.db.close(); throw error; }
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS inquiries (
        id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, digest TEXT NOT NULL,
        payload TEXT NOT NULL, received_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new', owner TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 0
      ) STRICT;
      CREATE TABLE IF NOT EXISTS notifications (
        inquiry_id TEXT PRIMARY KEY REFERENCES inquiries(id), status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0,
        lease_until INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT ''
      ) STRICT;
      CREATE TABLE IF NOT EXISTS followups (
        id INTEGER PRIMARY KEY, inquiry_id TEXT NOT NULL REFERENCES inquiries(id),
        created_at TEXT NOT NULL, status TEXT NOT NULL, owner TEXT NOT NULL, note TEXT NOT NULL, actor TEXT NOT NULL DEFAULT ''
      ) STRICT;
      CREATE TABLE IF NOT EXISTS crm_deliveries (
        inquiry_id TEXT PRIMARY KEY REFERENCES inquiries(id), status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0,
        lease_token TEXT NOT NULL DEFAULT '', site_id TEXT NOT NULL DEFAULT '', target_url TEXT NOT NULL DEFAULT '',
        main_lead_id TEXT NOT NULL DEFAULT '', synced_at TEXT NOT NULL DEFAULT '', last_error TEXT NOT NULL DEFAULT ''
      ) STRICT;
      CREATE TABLE IF NOT EXISTS rate_limits (
        bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
      ) STRICT;
    `);
    if (!this.db.prepare('PRAGMA table_info(inquiries)').all().some(row => row.name === 'revision')) this.db.exec('ALTER TABLE inquiries ADD COLUMN revision INTEGER NOT NULL DEFAULT 0');
    if (!this.db.prepare('PRAGMA table_info(followups)').all().some(row => row.name === 'actor')) this.db.exec("ALTER TABLE followups ADD COLUMN actor TEXT NOT NULL DEFAULT ''");
    this.db.exec('INSERT OR IGNORE INTO crm_deliveries (inquiry_id) SELECT id FROM inquiries');
    this.db.exec('CREATE INDEX IF NOT EXISTS inquiries_received_idx ON inquiries(received_at DESC, id DESC); CREATE INDEX IF NOT EXISTS inquiries_status_idx ON inquiries(status, received_at DESC, id DESC); CREATE INDEX IF NOT EXISTS rate_limits_expiry_idx ON rate_limits(expires_at);');
    initializeMonitoring(this);
  }

  receive(lead, requestKey, uploadSessionId = '') {
    const digest = hash(JSON.stringify(lead));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.db.prepare('SELECT id, digest FROM inquiries WHERE request_key = ?').get(requestKey);
      if (existing) {
        if (existing.digest !== digest) throw new RequestError(409, 'idempotency_conflict');
        this.db.exec('COMMIT');
        return { id: existing.id, duplicate: true };
      }
      const id = 'DD-' + randomUUID().toUpperCase();
      this.db.prepare('INSERT INTO inquiries (id, request_key, digest, payload, received_at) VALUES (?, ?, ?, ?, ?)').run(id, requestKey, digest, JSON.stringify(lead), new Date().toISOString());
      if (lead.attachments?.length) {
        if (!this.uploads) throw new UploadError(409, 'attachments_not_configured');
        this.uploads.bind(lead.attachments, uploadSessionId, id);
      }
      this.db.prepare('INSERT INTO notifications (inquiry_id) VALUES (?)').run(id);
      this.db.prepare('INSERT INTO crm_deliveries (inquiry_id) VALUES (?)').run(id);
      this.db.exec('COMMIT');
      return { id, duplicate: false };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  consumeRate(bucket, limit = 10, windowMs = 60000) {
    const now = Date.now();
    this.db.prepare('DELETE FROM rate_limits WHERE expires_at < ?').run(now);
    this.db.prepare('INSERT INTO rate_limits (bucket, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count = count + 1').run(bucket, now + windowMs);
    return this.db.prepare('SELECT count FROM rate_limits WHERE bucket = ?').get(bucket).count <= limit;
  }

  list(limit = 50, before = '') {
    const rows = this.db.prepare(`SELECT i.id, i.payload, i.received_at, i.status, i.owner, n.status AS notification_status, n.attempts
      FROM inquiries i JOIN notifications n ON n.inquiry_id = i.id
      WHERE (? = '' OR i.received_at < ?) ORDER BY i.received_at DESC, i.id DESC LIMIT ?`).all(before, before, limit);
    return rows.map(row => {
      const lead = JSON.parse(row.payload);
      return { id: row.id, company: lead.company, product: lead.product, receivedAt: row.received_at, status: row.status, owner: row.owner, notificationStatus: row.notification_status, attempts: row.attempts };
    });
  }

  listPage(limit, filters = {}) {
    const clauses = [], values = [];
    if (filters.status) { if (!statuses.has(filters.status)) throw new RequestError(422, 'invalid_status'); clauses.push('i.status = ?'); values.push(filters.status); }
    if (filters.notification) {
      if (!['pending', 'sending', 'failed', 'accepted'].includes(filters.notification)) throw new RequestError(422, 'invalid_notification');
      clauses.push('n.status = ?'); values.push(filters.notification);
    }
    if (filters.q) {
      if (filters.q.length > 120) throw new RequestError(422, 'invalid_search');
      clauses.push("(instr(lower(json_extract(i.payload, '$.company')), lower(?)) > 0 OR instr(lower(json_extract(i.payload, '$.email')), lower(?)) > 0 OR instr(lower(json_extract(i.payload, '$.product')), lower(?)) > 0 OR instr(lower(i.id), lower(?)) > 0 OR instr(lower(i.owner), lower(?)) > 0)");
      values.push(...Array(5).fill(filters.q.trim()));
    }
    const from = 'FROM inquiries i JOIN notifications n ON n.inquiry_id = i.id';
    const total = this.db.prepare(`SELECT COUNT(*) AS count ${from} ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''}`).get(...values).count;
    if (filters.cursor) {
      try {
        if (filters.cursor.length > 250 || !/^[A-Za-z0-9_-]+$/.test(filters.cursor)) throw new Error();
        const cursor = JSON.parse(Buffer.from(filters.cursor, 'base64url').toString());
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cursor.at) || !/^DD-[A-F0-9-]{36}$/.test(cursor.id)) throw new Error();
        clauses.push('(i.received_at < ? OR (i.received_at = ? AND i.id < ?))'); values.push(cursor.at, cursor.at, cursor.id);
      } catch { throw new RequestError(422, 'invalid_cursor'); }
    } else if (filters.before) { clauses.push('i.received_at < ?'); values.push(filters.before); }
    const rows = this.db.prepare(`SELECT i.id, i.payload, i.received_at, i.status, i.owner, n.status AS notification_status, n.attempts ${from}
      ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''} ORDER BY i.received_at DESC, i.id DESC LIMIT ?`).all(...values, limit + 1);
    const hasNext = rows.length > limit, page = rows.slice(0, limit), last = page.at(-1);
    const summary = this.db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(i.status = 'new'), 0) AS new,
      COALESCE(SUM(n.status = 'pending'), 0) AS pending, COALESCE(SUM(n.status = 'failed'), 0) AS failed ${from}`).get();
    return { inquiries: page.map(row => { const lead = JSON.parse(row.payload); return { id: row.id, company: lead.company, product: lead.product, receivedAt: row.received_at, status: row.status, owner: row.owner, notificationStatus: row.notification_status, attempts: row.attempts }; }),
      total, summary, nextCursor: hasNext ? Buffer.from(JSON.stringify({ at: last.received_at, id: last.id })).toString('base64url') : null };
  }

  get(id) {
    const row = this.db.prepare(`SELECT i.*, n.status AS notification_status, n.attempts, n.last_error
      FROM inquiries i JOIN notifications n ON n.inquiry_id = i.id WHERE i.id = ?`).get(id);
    if (!row) throw new RequestError(404, 'not_found');
    const crm = this.db.prepare('SELECT status, attempts, main_lead_id, synced_at, last_error FROM crm_deliveries WHERE inquiry_id = ?').get(id);
    return { id: row.id, lead: JSON.parse(row.payload), receivedAt: row.received_at, status: row.status, owner: row.owner, revision: row.revision,
      crm: { status: crm.status, attempts: crm.attempts, mainLeadId: crm.main_lead_id, syncedAt: crm.synced_at, lastError: crm.last_error },
      notification: { status: row.notification_status, attempts: row.attempts, lastError: row.last_error },
      followups: this.db.prepare('SELECT created_at AS createdAt, status, owner, note, actor FROM followups WHERE inquiry_id = ? ORDER BY id DESC').all(id) };
  }

  followUp(id, input, actor = 'server-api') {
    if (!input || !statuses.has(input.status) || typeof input.owner !== 'string' || input.owner.length > 120 || typeof input.note !== 'string' || input.note.length > 2000) throw new RequestError(422, 'invalid_followup');
    if (input.expectedRevision != null && (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0)) throw new RequestError(422, 'invalid_revision');
    if (this.get(id).crm.status === 'synced') throw new RequestError(409, 'followup_in_main_system');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const updated = this.db.prepare('UPDATE inquiries SET status = ?, owner = ?, revision = revision + 1 WHERE id = ? AND (? IS NULL OR revision = ?)').run(input.status, input.owner.trim(), id, input.expectedRevision ?? null, input.expectedRevision ?? null);
      if (!updated.changes) throw new RequestError(409, 'followup_conflict');
      this.db.prepare('INSERT INTO followups (inquiry_id, created_at, status, owner, note, actor) VALUES (?, ?, ?, ?, ?, ?)').run(id, new Date().toISOString(), input.status, input.owner.trim(), input.note.trim(), actor);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return this.get(id);
  }

  retry(id) {
    this.get(id);
    const result = this.db.prepare("UPDATE notifications SET status = 'pending', next_at = 0, lease_until = 0, lease_token = '' WHERE inquiry_id = ? AND status != 'accepted' AND lease_until < ?").run(id, Date.now());
    if (!result.changes) throw new RequestError(409, 'notification_accepted_or_busy');
  }

  retryCrm(id) {
    this.get(id);
    const result = this.db.prepare("UPDATE crm_deliveries SET status = 'pending', next_at = 0, lease_until = 0, lease_token = '' WHERE inquiry_id = ? AND status != 'synced' AND lease_until < ?").run(id, Date.now());
    if (!result.changes) throw new RequestError(409, 'crm_synced_or_busy');
  }

  close() { this.db.close(); }
}

export async function deliverNotification(store, config, fetchImpl = fetch) {
  if (!config.notificationUrl || !config.salesRecipient) { recordWorkerCheck(store, 'notification', 'disabled'); return { skipped: true, reason: 'not_configured' }; }
  const now = Date.now(), lease = randomUUID();
  recordWorkerCheck(store, 'notification', 'polling');
  const row = store.db.prepare("UPDATE notifications SET status = 'sending', lease_until = ?, lease_token = ?, attempts = attempts + 1 WHERE inquiry_id = (SELECT inquiry_id FROM notifications WHERE status != 'accepted' AND next_at <= ? AND lease_until < ? ORDER BY next_at, inquiry_id LIMIT 1) RETURNING *").get(now + 30000, lease, now, now);
  if (!row) { recordWorkerCheck(store, 'notification', 'idle'); return { skipped: true, reason: 'no_pending_notification' }; }
  try {
    const inquiry = store.get(row.inquiry_id);
    const response = await fetchImpl(config.notificationUrl, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': row.inquiry_id, ...(config.notificationToken ? { Authorization: `Bearer ${config.notificationToken}` } : {}) },
      body: JSON.stringify({ recipient: config.salesRecipient, inquiry })
    });
    const acknowledgement = JSON.parse(await readAcknowledgement(response));
    if (!response.ok || !acknowledgement || acknowledgement.accepted !== true) throw new Error('notification_not_acknowledged');
    const updated = finishDelivery(store, 'notification', row.inquiry_id, lease, 'accepted');
    return updated.changes ? { ok: true, id: row.inquiry_id } : { skipped: true, reason: 'lease_expired' };
  } catch {
    const updated = finishDelivery(store, 'notification', row.inquiry_id, lease, 'failed', 'delivery_not_confirmed', Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(row.attempts, 7)));
    return updated.changes ? { ok: false, id: row.inquiry_id } : { skipped: true, reason: 'lease_expired' };
  }
}

async function readBody(request) {
  if (!/^application\/json\b/i.test(request.headers['content-type'] || '')) throw new RequestError(415, 'json_required');
  const chunks = []; let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 65536) throw new RequestError(413, 'request_too_large');
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new RequestError(400, 'invalid_json'); }
  if (bytes > 16384 && value?.type !== 'multi-product-rfq') throw new RequestError(413, 'request_too_large');
  return value;
}

function authorized(request, token) {
  const received = Buffer.from(request.headers.authorization || '');
  const expected = Buffer.from('Bearer ' + token);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function createInquiryServer(store, config) {
  const crmConfigured = Boolean(crmConfiguration(config));
  if (!config.adminToken || config.adminToken.length < 32) throw new Error('A server-side admin token of at least 32 characters is required');
  if (!config.rateSalt || config.rateSalt.length < 32) throw new Error('A server-side rate-limit salt of at least 32 characters is required');
  if (!config.allowedOrigins?.length) throw new Error('Explicit allowed origins are required');
  const sessions = new AdminSessions(config);
  const uploads = config.uploads ? new PrivateUploads(store, config.uploads, config) : null;
  store.uploads = uploads;
  return createServer(async (request, response) => {
    const started = performance.now();
    const origin = request.headers.origin || '';
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow', Vary: 'Origin' };
    if (config.allowedOrigins.includes(origin)) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key, X-Upload-CSRF' });
    let intake = false;
    const send = (status, data) => {
      if (intake) recordIntakeRequest(store, status, data?.error, performance.now() - started);
      response.writeHead(status, headers); response.end(status === 204 ? undefined : JSON.stringify(data));
    };
    try {
      const url = new URL(request.url, 'http://localhost');
      intake = url.pathname === '/api/inquiries' && request.method === 'POST';
      if (await serveAdminUi(request, response, url.pathname)) return;
      if (origin && !config.allowedOrigins.includes(origin)) throw new RequestError(403, 'origin_not_allowed');
      if (request.method === 'OPTIONS') { if (!origin) throw new RequestError(403, 'origin_required'); send(204); return; }
      if (url.pathname === '/api/health' && request.method === 'GET') { store.db.prepare('SELECT 1').get(); send(200, { ok: true, version: '2026.10.08-a12-pre', catalogVersion: globalThis.DongDaCatalog.version, crmConfigured, notificationConfigured: Boolean(config.notificationUrl && config.salesRecipient), uploadsConfigured: Boolean(uploads) }); return; }
      if (url.pathname === '/api/upload-session' || url.pathname.startsWith('/api/uploads')) {
        if (!uploads) throw new UploadError(503, 'attachments_not_configured');
        if (!origin || !config.allowedOrigins.includes(origin)) throw new RequestError(403, 'origin_required');
        if (url.search) throw new UploadError(422, 'invalid_upload');
        const bucket = hash(config.rateSalt + ':uploads:' + request.socket.remoteAddress);
        if (!store.consumeRate(bucket, 60)) throw new RequestError(429, 'rate_limited');
        if (url.pathname === '/api/upload-session' && request.method === 'POST') {
          if (!store.consumeRate(bucket + ':sessions', 5, 600000)) throw new RequestError(429, 'rate_limited');
          const body = await readBody(request);
          if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) throw new UploadError(422, 'invalid_upload');
          const issued = await uploads.issue(); headers['Set-Cookie'] = issued.cookie;
          send(201, { ok: true, csrfToken: issued.csrfToken, expiresAt: issued.expiresAt, limits: UPLOAD_LIMITS }); return;
        }
        if (url.pathname === '/api/uploads' && request.method === 'POST') {
          if (!store.consumeRate(bucket + ':files', 15, 600000)) throw new RequestError(429, 'rate_limited');
          const result = await uploads.upload(request, request.headers['idempotency-key']);
          send(result.duplicate ? 200 : 201, { ok: true, scanned: true, ...result }); return;
        }
        const match = url.pathname.match(/^\/api\/uploads\/(UP-[a-f0-9-]{36})$/);
        if (match && request.method === 'GET') { send(200, { ok: true, ...uploads.status(request, match[1]) }); return; }
        if (match && request.method === 'DELETE') { uploads.retire(request, match[1]); send(200, { ok: true, removed: true }); return; }
        throw new UploadError(404, 'upload_not_found');
      }
      if (url.pathname.startsWith('/api/admin/')) {
        const session = sessions.find(request), bearer = authorized(request, config.adminToken);
        if (!store.consumeRate(hash(config.rateSalt + ':admin:' + request.socket.remoteAddress), session || bearer ? 120 : 30)) throw new RequestError(429, 'rate_limited');
        if (url.pathname === '/api/admin/session') {
          if (request.method === 'GET') { send(200, { ok: true, authenticated: Boolean(session), localPreview: sessions.preview, ...(session ? { csrfToken: session.csrfToken, expiresAt: session.expiresAt, crmConfigured, notificationConfigured: Boolean(config.notificationUrl && config.salesRecipient) } : {}) }); return; }
          if (request.method === 'POST') {
            if (!origin || !config.allowedOrigins.includes(origin) || (!sessions.preview && new URL(origin).protocol !== 'https:')) throw new RequestError(403, 'origin_required');
            if (!store.consumeRate(hash(config.rateSalt + ':login:' + request.socket.remoteAddress), 5)) throw new RequestError(429, 'rate_limited');
            const body = await readBody(request);
            const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress);
            if (!body || typeof body !== 'object' || !(sessions.preview && local && body.preview === true) && !equalSecret(body.token, config.adminToken)) throw new RequestError(401, 'unauthorized');
            headers['Set-Cookie'] = sessions.revoke(request);
            const issued = sessions.issue(); headers['Set-Cookie'] = issued.cookie;
            send(200, { ok: true, authenticated: true, csrfToken: issued.session.csrfToken, expiresAt: issued.session.expiresAt, localPreview: sessions.preview, crmConfigured, notificationConfigured: Boolean(config.notificationUrl && config.salesRecipient) }); return;
          }
        }
        if (!bearer && !session) throw new RequestError(401, 'unauthorized');
        if (!bearer && !['GET', 'HEAD'].includes(request.method) && (!origin || !config.allowedOrigins.includes(origin) || !equalSecret(request.headers['x-csrf-token'], session.csrfToken))) throw new RequestError(403, 'csrf_required');
        if (url.pathname === '/api/admin/session' && request.method === 'DELETE') { headers['Set-Cookie'] = sessions.revoke(request); send(200, { ok: true }); return; }
        if (url.pathname === '/api/admin/monitoring' && request.method === 'GET') {
          const days = url.searchParams.get('days') || '7';
          if (!['7', '30', '90'].includes(days) || [...url.searchParams.keys()].some(key => key !== 'days') || url.searchParams.getAll('days').length > 1) throw new RequestError(422, 'invalid_monitoring_range');
          send(200, { ok: true, monitoring: readMonitoring(store, Number(days), { crmConfigured, notificationConfigured: Boolean(config.notificationUrl && config.salesRecipient) }) }); return;
        }
        const attachment = url.pathname.match(/^\/api\/admin\/inquiries\/(DD-[A-Z0-9-]{8,80})\/attachments\/(UP-[a-f0-9-]{36})$/);
        if (attachment && request.method === 'GET') {
          if (!uploads || url.search) throw new UploadError(404, 'upload_not_found');
          const file = uploads.content(attachment[1], attachment[2]);
          response.writeHead(200, { ...headers, 'Content-Type': file.mimeType, 'Content-Length': file.bytes.length, 'Content-Disposition': file.disposition, 'Content-Security-Policy': "sandbox; default-src 'none'", 'Cross-Origin-Resource-Policy': 'same-origin' });
          response.end(file.bytes); return;
        }
        if (url.pathname === '/api/admin/inquiries' && request.method === 'GET') {
          const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
          if (!Number.isInteger(limit)) throw new RequestError(422, 'invalid_limit');
          send(200, { ok: true, ...store.listPage(limit, Object.fromEntries(['cursor', 'before', 'q', 'status', 'notification'].map(key => [key, url.searchParams.get(key) || '']))) }); return;
        }
        const match = url.pathname.match(/^\/api\/admin\/inquiries\/(DD-[A-Z0-9-]{8,80})(?:\/(followups|retry|crm-retry))?$/);
        if (match) {
          if (!match[2] && request.method === 'GET') { send(200, { ok: true, inquiry: store.get(match[1]) }); return; }
          if (match[2] === 'followups' && request.method === 'POST') {
            if (crmConfigured) throw new RequestError(409, 'followup_in_main_system');
            const input = await readBody(request);
            if (!bearer && !Number.isSafeInteger(input?.expectedRevision)) throw new RequestError(422, 'revision_required');
            send(200, { ok: true, inquiry: store.followUp(match[1], input, bearer ? 'server-api' : session.actor) }); return;
          }
          if (match[2] === 'retry' && request.method === 'POST') { store.retry(match[1]); send(202, { ok: true, queued: true }); return; }
          if (match[2] === 'crm-retry' && request.method === 'POST') {
            if (!crmConfigured) throw new RequestError(409, 'crm_not_configured');
            store.retryCrm(match[1]); send(202, { ok: true, queued: true }); return;
          }
        }
      } else if (url.pathname === '/api/inquiries' && request.method === 'POST') {
        if (!origin || !config.allowedOrigins.includes(origin)) throw new RequestError(403, 'origin_required');
        if (!store.consumeRate(hash(config.rateSalt + ':public:' + request.socket.remoteAddress), config.rateLimit || 10)) throw new RequestError(429, 'rate_limited');
        const key = request.headers['idempotency-key'];
        if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(key)) throw new RequestError(422, 'idempotency_key_required');
        const input = await readBody(request), references = input?.attachments;
        if (references !== undefined && !uploads) throw new UploadError(503, 'attachments_not_configured');
        const original = input && typeof input === 'object' && !Array.isArray(input) ? { ...input } : input;
        if (original && typeof original === 'object') delete original.attachments;
        const lead = validateLead(original);
        let uploadSessionId = '';
        if (references !== undefined) {
          const existing = store.db.prepare('SELECT id FROM inquiries WHERE request_key=?').get(key);
          const prepared = uploads.prepare(request, references, lead, existing?.id || '');
          lead.attachments = prepared.files; uploadSessionId = prepared.sessionId;
        }
        const result = store.receive(lead, key, uploadSessionId);
        send(result.duplicate ? 200 : 201, { ok: true, persisted: true, leadId: result.id, duplicate: result.duplicate }); return;
      }
      throw new RequestError(404, 'not_found');
    } catch (error) {
      if (error instanceof RequestError || error instanceof UploadError) { if (error.status === 429) headers['Retry-After'] = '60'; send(error.status, { ok: false, error: error.code, fields: error.fields }); }
      else { send(503, { ok: false, error: 'service_unavailable' }); }
    }
  });
}
