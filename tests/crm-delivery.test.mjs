import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { InquiryStore, createInquiryServer, validateLead } from '../server/inquiry-service.mjs';
import { canonicalPacket, crmConfiguration, deliverCrmInquiry } from '../server/crm-delivery.mjs';

const config = () => ({ crmUrl: 'https://erp.cn-dongda.com/api/sales/website-inquiries', crmSiteId: 'dongda-website', crmToken: randomBytes(32).toString('hex') });
const lead = validateLead({ type: 'inquiry', company: 'Synthetic CRM Buyer', contact: 'Synthetic Contact', email: 'qa@example.test', product: 'FIBC', quantity: '1000 pcs', language: 'en', specifications: { fabric: 'PP' } });
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'dongda-crm-')), path = join(directory, 'inquiries.sqlite'), store = new InquiryStore(path);
  t.after(async () => { try { store.close(); } catch {} await rm(directory, { recursive: true, force: true }); });
  const id = store.receive(lead, randomBytes(16).toString('hex')).id;
  return { path, store, id, config: config() };
}
const ack = (f, extra = {}) => ({ ok: true, persisted: true, siteId: f.config.crmSiteId, sourceInquiryId: f.id, leadId: 'sale-' + randomUUID(), duplicate: false, ...extra });
const response = (data, status = 201) => new Response(JSON.stringify(data), { status });

test('CRM config is optional, dedicated, HTTPS and exact endpoint; never browser/admin credentials', () => {
  assert.equal(crmConfiguration({}), null); assert.ok(crmConfiguration(config()));
  for (const changes of [{ crmToken: '' }, { crmSiteId: '*' }, { crmUrl: 'http://erp.cn-dongda.com/api/sales/website-inquiries' },
    { crmUrl: 'https://erp.cn-dongda.com/api/sales/leads' }, { crmUrl: 'https://u:p@erp.cn-dongda.com/api/sales/website-inquiries' },
    { crmUrl: 'https://erp.cn-dongda.com/api/sales/website-inquiries?token=bad' }, { crmUrl: 'http://127.0.0.1:3000/api/sales/website-inquiries' }]) assert.throws(() => crmConfiguration({ ...config(), ...changes }));
  const shared = config(); assert.throws(() => crmConfiguration({ ...shared, adminToken: shared.crmToken }));
  assert.ok(crmConfiguration({ ...config(), crmUrl: 'http://127.0.0.1:3000/api/sales/website-inquiries', crmAllowLoopback: true }));
});

test('atomic queue, stable original packet, strict ERP acknowledgement and restart readback', async t => {
  const f = await fixture(t); assert.equal(f.store.get(f.id).crm.status, 'pending');
  assert.equal((await deliverCrmInquiry(f.store, {})).reason, 'not_configured');
  const expected = ack(f); let received;
  const result = await deliverCrmInquiry(f.store, f.config, async (url, options) => {
    assert.equal(url, f.config.crmUrl); assert.equal(options.redirect, 'error'); assert.equal(options.headers['Idempotency-Key'], f.id);
    assert.equal(options.headers.Origin, undefined); received = JSON.parse(options.body);
    const { digest, ...packet } = received; assert.equal(digest, createHash('sha256').update(canonicalPacket(packet)).digest('hex'));
    return response(expected);
  });
  assert.equal(result.ok, true); assert.deepEqual(received.payload, lead);
  assert.equal(f.store.get(f.id).crm.mainLeadId, expected.leadId); assert.equal(f.store.get(f.id).notification.status, 'pending');
  assert.equal((await deliverCrmInquiry(f.store, f.config)).reason, 'no_pending_inquiry');
  assert.throws(() => f.store.retryCrm(f.id)); assert.throws(() => f.store.followUp(f.id, { status: 'contacted', owner: 'Wrong CRM', note: '' }), /followup_in_main_system/);
  f.store.close(); const reopened = new InquiryStore(f.path); assert.equal(reopened.get(f.id).crm.status, 'synced'); assert.equal(reopened.get(f.id).crm.mainLeadId, expected.leadId); reopened.close();
});

test('lost response retries the identical packet; different destination is blocked', async t => {
  const f = await fixture(t); let first;
  await deliverCrmInquiry(f.store, f.config, async (_, options) => { first = options.body; throw new Error('PRIVATE token/error'); });
  assert.equal(f.store.get(f.id).crm.status, 'failed'); assert.equal(f.store.get(f.id).crm.lastError.includes('PRIVATE'), false);
  f.store.retryCrm(f.id);
  const result = await deliverCrmInquiry(f.store, f.config, async (_, options) => { assert.equal(options.body, first); return response(ack(f, { duplicate: true }), 200); });
  assert.equal(result.duplicate, true);
  const changed = await fixture(t);
  await deliverCrmInquiry(changed.store, changed.config, async () => { throw new Error(); }); changed.store.retryCrm(changed.id);
  let called = false;
  await deliverCrmInquiry(changed.store, { ...changed.config, crmSiteId: 'new-site' }, async () => { called = true; });
  assert.equal(called, false); assert.equal(changed.store.get(changed.id).crm.status, 'blocked');
});

test('false/foreign/oversized ACK, permanent denial and unavailable-owner errors retain raw inquiry', async t => {
  for (const change of [{ persisted: false }, { sourceInquiryId: 'DD-OTHER' }, { siteId: 'other' }, { leadId: 'made-up' }, { duplicate: undefined }, { ok: false }]) {
    const f = await fixture(t); await deliverCrmInquiry(f.store, f.config, async () => response(ack(f, change)));
    assert.equal(f.store.get(f.id).crm.status, 'failed'); assert.deepEqual(f.store.get(f.id).lead, lead);
  }
  const large = await fixture(t); await deliverCrmInquiry(large.store, large.config, async () => response({ text: 'x'.repeat(5000) })); assert.equal(large.store.get(large.id).crm.status, 'failed');
  for (const status of [401, 403, 404, 409, 422]) {
    const f = await fixture(t); await deliverCrmInquiry(f.store, f.config, async () => new Response('Denied', { status }));
    assert.equal(f.store.get(f.id).crm.status, 'blocked'); assert.equal((await deliverCrmInquiry(f.store, f.config)).reason, 'no_pending_inquiry');
  }
  const missing = await fixture(t); await deliverCrmInquiry(missing.store, missing.config, async () => response({ message: 'WEBSITE_INTAKE_NO_SALES_OWNER' }, 409));
  assert.equal(missing.store.get(missing.id).crm.status, 'failed');
});

test('one live lease, expired-lease recovery and no stale worker overwrite', async t => {
  const f = await fixture(t); let complete;
  const pending = deliverCrmInquiry(f.store, f.config, () => new Promise(resolve => { complete = resolve; }));
  assert.equal((await deliverCrmInquiry(f.store, f.config)).reason, 'no_pending_inquiry');
  f.store.db.prepare('UPDATE crm_deliveries SET lease_until = 0 WHERE inquiry_id = ?').run(f.id);
  const expected = ack(f); await deliverCrmInquiry(f.store, f.config, async () => response(expected));
  complete(response(ack(f))); assert.equal((await pending).reason, 'lease_expired');
  assert.equal(f.store.get(f.id).crm.mainLeadId, expected.leadId);
});

test('CRM retry is protected; configured intake disables the parallel local follow-up authority', async t => {
  const f = await fixture(t), serverConfig = { ...f.config, adminToken: randomBytes(32).toString('hex'), rateSalt: randomBytes(32).toString('hex'), allowedOrigins: ['https://cn-dongda.com'] };
  const server = createInquiryServer(f.store, serverConfig); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`, path = '/api/admin/inquiries/' + f.id;
  assert.equal((await fetch(base + path + '/crm-retry', { method: 'POST' })).status, 401);
  const headers = { Authorization: 'Bearer ' + serverConfig.adminToken, 'Content-Type': 'application/json' };
  assert.equal((await fetch(base + path + '/crm-retry', { method: 'POST', headers })).status, 202);
  assert.equal((await fetch(base + path + '/followups', { method: 'POST', headers, body: JSON.stringify({ status: 'contacted', owner: '', note: '' }) })).status, 409);
  const health = await (await fetch(base + '/api/health')).json(); assert.equal(health.crmConfigured, true); assert.equal(JSON.stringify(health).includes(serverConfig.crmToken), false);
});
