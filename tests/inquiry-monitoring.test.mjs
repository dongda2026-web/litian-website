import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { InquiryStore, createInquiryServer, validateLead, deliverNotification } from '../server/inquiry-service.mjs';
import { deliverCrmInquiry } from '../server/crm-delivery.mjs';
import { readMonitoring, recordIntakeRequest, recordWorkerCheck, finishDelivery } from '../server/inquiry-monitoring.mjs';

const key = () => randomBytes(16).toString('hex');
const lead = { type: 'inquiry', company: 'Private Synthetic Buyer', contact: 'Private Person', email: 'private@example.test', product: 'FIBC', quantity: '1000 pcs', page: 'https://cn-dongda.com/?email=private@example.test', language: 'en' };
const notification = { notificationUrl: 'https://gateway.example.test', salesRecipient: 'sales@example.test' };
const crm = () => ({ crmUrl: 'https://erp.cn-dongda.com/api/sales/website-inquiries', crmSiteId: 'dongda-website', crmToken: key() + key() });
const now = Date.parse('2026-10-08T23:59:59.999Z');
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'dongda-monitor-')), path = join(directory, 'inquiries.sqlite'), store = new InquiryStore(path);
  const config = { adminToken: key() + key(), rateSalt: key() + key(), allowedOrigins: ['https://cn-dongda.com'] };
  const server = createInquiryServer(store, config); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); try { store.close(); } catch {} await rm(directory, { recursive: true, force: true }); });
  const post = (payload = lead, requestKey = key()) => fetch(base + '/api/inquiries', { method: 'POST', headers: { Origin: config.allowedOrigins[0], 'Content-Type': 'application/json', 'Idempotency-Key': requestKey }, body: JSON.stringify(payload) });
  const report = async (query = '') => {
    const response = await fetch(base + '/api/admin/monitoring' + query, { headers: { Authorization: 'Bearer ' + config.adminToken } });
    return { response, data: await response.json() };
  };
  return { directory, path, store, config, server, base, post, report };
}

test('monitoring is private, same-origin gated and strict bounded 7/30/90 UTC query', async t => {
  const f = await fixture(t);
  assert.equal((await fetch(f.base + '/api/admin/monitoring')).status, 401);
  assert.equal((await fetch(f.base + '/api/admin/monitoring', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await fetch(f.base + '/api/admin/monitoring', { headers: { Authorization: 'Bearer ' + f.config.adminToken, Origin: 'https://evil.example' } })).status, 403);
  for (const query of ['?days=1', '?days=365', '?days=7.0', '?days=07', '?days=7&days=90', '?days=7&email=secret', '?days=NaN']) assert.equal((await f.report(query)).response.status, 422);
  const { response, data } = await f.report('?days=90');
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(data.monitoring.daily.length, 90); assert.equal(data.monitoring.period.timeZone, 'UTC');
  assert.deepEqual(data.monitoring.totals, { received: 0, crmSaved: 0, gatewayAccepted: 0, failedAttempts: 0 });
  assert.equal(data.monitoring.queues.crm.worker.state, 'not_configured');
  assert.equal(data.monitoring.requests.averageMilliseconds, null); assert.equal(data.monitoring.funnel.enabled, false);
  const login = await fetch(f.base + '/api/admin/session',{method:'POST',headers:{Origin:f.config.allowedOrigins[0],'Content-Type':'application/json'},body:JSON.stringify({token:f.config.adminToken})});
  const session = await login.json(), cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(f.base + '/api/admin/monitoring',{headers:{Cookie:cookie}})).status,200);
  assert.equal((await fetch(f.base + '/api/admin/session',{method:'DELETE',headers:{Cookie:cookie,Origin:f.config.allowedOrigins[0],'X-CSRF-Token':session.csrfToken}})).status,200);
  assert.equal((await fetch(f.base + '/api/admin/monitoring',{headers:{Cookie:cookie}})).status,401);
});

test('server commit counts once; identical retry, conflict and invalid input are independent HTTP observations', async t => {
  const f = await fixture(t), requestKey = key();
  assert.equal((await f.post(lead, requestKey)).status, 201);
  assert.equal((await f.post(lead, requestKey)).status, 200);
  assert.equal((await f.post({ ...lead, company: 'Changed' }, requestKey)).status, 409);
  assert.equal((await f.post({ ...lead, email: 'bad' })).status, 422);
  const data = (await f.report()).data.monitoring;
  assert.equal(data.totals.received, 1); assert.equal(data.requests.count, 4);
  assert.deepEqual(data.requests.outcomes.map(row => [row.status, row.code, row.count]), [[200,'duplicate',1],[201,'created',1],[409,'idempotency_conflict',1],[422,'validation_failed',1]]);
  assert.equal(data.queues.crm.counts.pending, 1); assert.equal(data.queues.notification.counts.pending, 1);
  const text = JSON.stringify(data);
  for (const secret of [lead.company, lead.email, lead.page, lead.contact, requestKey, f.config.adminToken, '127.0.0.1']) assert.equal(text.includes(secret), false);
  for (const name of ['monitor_requests','monitor_deliveries','monitor_workers']) assert.equal(JSON.stringify(f.store.db.prepare('SELECT * FROM ' + name).all()).includes(lead.email), false);
});

test('rejection and storage failure never create conversion; best-effort request stats cannot undo committed inquiry', async t => {
  const f = await fixture(t), receive = f.store.receive.bind(f.store);
  f.store.receive = () => { throw new Error('private-db-path / token'); };
  assert.equal((await f.post()).status, 503); assert.equal((await f.report()).data.monitoring.totals.received, 0);
  f.store.receive = receive; f.store.db.exec('DROP TABLE monitor_requests');
  assert.equal((await f.post()).status, 201); assert.equal(f.store.list().length, 1); assert.equal(f.store.monitoringWriteError, true);
});

test('UTC day boundaries exclude older/future records and separate outcome dates from inquiry cohorts', async t => {
  const f = await fixture(t), ids = [0,1,2,3].map(() => f.store.receive(validateLead(lead), key()).id);
  for (const [index, at] of ['2026-10-01T23:59:59.999Z','2026-10-02T00:00:00.000Z','2026-10-08T23:59:59.999Z','2026-10-09T00:00:00.000Z'].entries()) f.store.db.prepare('UPDATE inquiries SET received_at = ? WHERE id = ?').run(at, ids[index]);
  f.store.db.prepare("UPDATE crm_deliveries SET status = 'synced', synced_at = '2026-10-08T12:00:00.000Z' WHERE inquiry_id = ?").run(ids[0]);
  const data = readMonitoring(f.store, 7, {}, now);
  assert.equal(data.period.start, '2026-10-02T00:00:00.000Z'); assert.equal(data.totals.received, 2); assert.equal(data.totals.crmSaved, 1);
  assert.equal(data.daily[0].received, 1); assert.equal(data.daily[6].received, 1); assert.equal(data.daily[6].crmSaved, 1);
  assert.throws(() => readMonitoring(f.store, 8));
});

test('additive migration creates a consistent private backup, retains history and does not invent legacy acceptance dates', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dongda-monitor-migration-')), path = join(directory, 'legacy.sqlite');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const db = new DatabaseSync(path), id = 'DD-' + randomUUID().toUpperCase();
  db.exec(`CREATE TABLE inquiries (id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, digest TEXT NOT NULL, payload TEXT NOT NULL, received_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', owner TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 0) STRICT;
    CREATE TABLE notifications (inquiry_id TEXT PRIMARY KEY REFERENCES inquiries(id), status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT '') STRICT;
    CREATE TABLE followups (id INTEGER PRIMARY KEY, inquiry_id TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL, owner TEXT NOT NULL, note TEXT NOT NULL, actor TEXT NOT NULL DEFAULT '') STRICT;`);
  db.prepare('INSERT INTO inquiries (id,request_key,digest,payload,received_at) VALUES (?,?,?,?,?)').run(id,key(),'digest',JSON.stringify(validateLead(lead)),'2026-10-08T12:00:00.000Z');
  db.prepare("INSERT INTO notifications (inquiry_id,status,attempts) VALUES (?,'accepted',2)").run(id);
  db.prepare("INSERT INTO followups (inquiry_id,created_at,status,owner,note) VALUES (?,'2026-10-08T12:15:00.000Z','contacted','Sales','Existing note')").run(id); db.close();
  const migrated = new InquiryStore(path), backupPath = migrated.monitoringBackupPath;
  assert.ok(backupPath); assert.equal((await stat(backupPath)).mode & 0o777, 0o600); assert.equal((await stat(join(directory,'backups'))).mode & 0o777, 0o700);
  const copy = new DatabaseSync(backupPath, { readOnly: true }); assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.equal(copy.prepare('SELECT COUNT(*) AS count FROM inquiries').get().count,1); assert.equal(copy.prepare('PRAGMA table_info(notifications)').all().some(row => row.name === 'accepted_at'),false); copy.close();
  assert.equal(migrated.get(id).followups[0].note,'Existing note');
  const metrics = readMonitoring(migrated, 7, {}, now); assert.equal(metrics.legacyAcceptedWithoutTime,1); assert.equal(metrics.totals.gatewayAccepted,0); assert.equal(metrics.localProgress.averageMinutes,15);
  migrated.close(); const reopened = new InquiryStore(path); assert.equal(reopened.monitoringBackupPath,null); assert.equal((await readdir(join(directory,'backups'))).length,1); assert.equal(reopened.get(id).notification.status,'accepted'); reopened.close();
});

test('first local stage progression is not customer response or ERP followup and excludes unconfirmed/future notes', async t => {
  const f = await fixture(t), id = f.store.receive(validateLead(lead), key()).id;
  f.store.db.prepare("UPDATE inquiries SET received_at = '2026-10-08T12:00:00.000Z' WHERE id = ?").run(id);
  const add = (at, status) => f.store.db.prepare('INSERT INTO followups (inquiry_id,created_at,status,owner,note) VALUES (?,?,?,?,?)').run(id,at,status,'Synthetic Owner','Private followup');
  add('2026-10-08T12:01:00.000Z','new'); add('2026-10-08T12:20:00.000Z','contacted'); add('2026-10-08T12:30:00.000Z','qualified');
  const data = readMonitoring(f.store,7,{},now); assert.equal(data.localProgress.sampled,1); assert.equal(data.localProgress.averageMinutes,20); assert.equal(data.localProgress.erpFollowupReadback,false);
  assert.equal(readMonitoring(f.store,7,{crmConfigured:true},now).localProgress.unrecordedLocal,null);
});

test('backup failure stops startup before new schema or business data mutation', async t => {
  const directory = await mkdtemp(join(tmpdir(),'dongda-backup-denied-')), path = join(directory,'legacy.sqlite');
  t.after(() => rm(directory,{recursive:true,force:true}));
  const db = new DatabaseSync(path); db.exec('CREATE TABLE inquiries (id TEXT PRIMARY KEY, payload TEXT NOT NULL) STRICT');
  db.prepare('INSERT INTO inquiries VALUES (?,?)').run('synthetic','existing data'); db.close();
  await writeFile(join(directory,'backups'),'Synthetic blocked backup directory');
  assert.throws(() => new InquiryStore(path));
  const retained = new DatabaseSync(path,{readOnly:true});
  assert.equal(retained.prepare('SELECT payload FROM inquiries').get().payload,'existing data');
  assert.equal(retained.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'monitor_meta'").get().count,0); retained.close();
});

test('bounded 90-day aggregates sanitize provider errors and distinguish configured, unobserved and stale workers', async t => {
  const f = await fixture(t);
  recordIntakeRequest(f.store,503,'private@example.test / SECRET',100,now - 100 * 86400000);
  recordIntakeRequest(f.store,422,'validation_failed',10,now - 90 * 86400000);
  recordIntakeRequest(f.store,422,'validation_failed',10,now - 89 * 86400000);
  recordIntakeRequest(f.store,422,'validation_failed',10,now);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS count FROM monitor_requests').get().count,2);
  assert.equal(readMonitoring(f.store,7,{crmConfigured:true},now).queues.crm.worker.state,'not_observed');
  recordWorkerCheck(f.store,'crm','idle',now - 61000); assert.equal(readMonitoring(f.store,7,{crmConfigured:true},now).queues.crm.worker.state,'stale');
  recordWorkerCheck(f.store,'crm','polling',now); assert.equal(readMonitoring(f.store,7,{crmConfigured:true},now).queues.crm.worker.state,'recently_observed');
  assert.throws(() => recordWorkerCheck(f.store,'arbitrary','idle')); assert.throws(() => recordWorkerCheck(f.store,'crm','private secret'));
});

test('delivery transition and aggregate are atomic, and old lease cannot overwrite or double-count success/failure', async t => {
  const f = await fixture(t), id = f.store.receive(validateLead(lead),key()).id;
  f.store.db.prepare("UPDATE notifications SET lease_token = 'current', status = 'sending' WHERE inquiry_id = ?").run(id);
  assert.equal(finishDelivery(f.store,'notification',id,'old','accepted').changes,0);
  f.store.db.exec("CREATE TRIGGER fail_monitor BEFORE INSERT ON monitor_deliveries BEGIN SELECT RAISE(ABORT,'synthetic_disk_error'); END");
  assert.throws(() => finishDelivery(f.store,'notification',id,'current','accepted'));
  assert.equal(f.store.get(id).notification.status,'sending'); assert.equal(f.store.db.prepare('SELECT COUNT(*) AS count FROM monitor_deliveries').get().count,0);
  f.store.db.exec('DROP TRIGGER fail_monitor');
  assert.equal(finishDelivery(f.store,'notification',id,'current','accepted').changes,1);
  assert.equal(finishDelivery(f.store,'notification',id,'current','failed','private secret').changes,0);
  assert.equal(readMonitoring(f.store).totals.gatewayAccepted,1); assert.equal(f.store.get(id).notification.status,'accepted');
});

test('notification leases, bounded acknowledgements and stale failure cannot invent acceptance', async t => {
  const f = await fixture(t), id = f.store.receive(validateLead(lead),key()).id; let complete;
  const old = deliverNotification(f.store,notification,() => new Promise(resolve => { complete = resolve; }));
  assert.equal((await deliverNotification(f.store,notification)).reason,'no_pending_notification');
  f.store.db.prepare('UPDATE notifications SET lease_until = 0 WHERE inquiry_id = ?').run(id);
  assert.equal((await deliverNotification(f.store,notification,async () => new Response('{"accepted":true}'))).ok,true);
  complete(new Response('private provider message', {status:503})); assert.equal((await old).reason,'lease_expired');
  assert.equal(readMonitoring(f.store).totals.gatewayAccepted,1); assert.equal(readMonitoring(f.store).totals.failedAttempts,0);
  const oversizedId = f.store.receive(validateLead(lead),key()).id;
  assert.equal((await deliverNotification(f.store,notification,async () => new Response(JSON.stringify({accepted:true,private:'x'.repeat(5000)})))).ok,false);
  assert.equal(f.store.get(oversizedId).notification.status,'failed');
});

test('real local gateway failure, requeue, acceptance and SQLite reopen preserve operational readback', async t => {
  const f = await fixture(t); let calls = 0;
  const gateway = createServer(async (request,response) => {
    for await (const chunk of request) {} calls++;
    response.writeHead(calls === 1 ? 503 : 200, {'Content-Type':'application/json'}); response.end(JSON.stringify(calls === 1 ? {error:'private provider text'} : {accepted:true}));
  });
  await new Promise(resolve => gateway.listen(0,'127.0.0.1',resolve)); t.after(() => new Promise(resolve => gateway.close(resolve)));
  const receipt = await (await f.post()).json(), config = {...notification,notificationUrl:`http://127.0.0.1:${gateway.address().port}/synthetic`};
  assert.equal((await deliverNotification(f.store,config)).ok,false); f.store.retry(receipt.leadId);
  assert.equal((await deliverNotification(f.store,config)).ok,true);
  const before = (await f.report()).data.monitoring; assert.deepEqual(before.totals,{received:1,crmSaved:0,gatewayAccepted:1,failedAttempts:1});
  f.store.close(); const reopened = new InquiryStore(f.path);
  assert.deepEqual(readMonitoring(reopened).totals,before.totals); assert.equal(readMonitoring(reopened).requests.count,1); reopened.close();
});

test('CRM strict saved acknowledgement and rejected/blocked retry results remain independent of notification', async t => {
  const f = await fixture(t), id = f.store.receive(validateLead(lead),key()).id, config = crm();
  await deliverCrmInquiry(f.store,config,async () => new Response('{"persisted":false}',{status:201}));
  assert.equal(readMonitoring(f.store).totals.crmSaved,0); f.store.retryCrm(id);
  await deliverCrmInquiry(f.store,config,async () => new Response('Denied private provider text',{status:403}));
  assert.equal(readMonitoring(f.store).queues.crm.counts.blocked,1); f.store.retryCrm(id);
  await deliverCrmInquiry(f.store,config,async () => new Response(JSON.stringify({ok:true,persisted:true,siteId:config.crmSiteId,sourceInquiryId:id,leadId:'sale-'+randomUUID(),duplicate:false}),{status:201}));
  assert.deepEqual(readMonitoring(f.store).totals,{received:1,crmSaved:1,gatewayAccepted:0,failedAttempts:2});
  assert.equal(readMonitoring(f.store).queues.notification.counts.pending,1);
});
