import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { InquiryStore, createInquiryServer, validateLead, deliverNotification } from '../server/inquiry-service.mjs';

const lead = { type: 'inquiry', company: 'Test Company', contact: 'Synthetic Contact', email: 'acceptance@example.test', product: 'FIBC', productId: 'fibc-bulk-bags', quantity: '1000 pcs', specifications: 'Test requirement', notes: '' };
const key = () => randomBytes(16).toString('hex');

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'dongda-inquiry-'));
  const path = join(directory, 'inquiries.sqlite');
  const store = new InquiryStore(path);
  const config = { adminToken: randomBytes(32).toString('hex'), rateSalt: randomBytes(32).toString('hex'), allowedOrigins: ['https://cn-dongda.com'] };
  const server = createInquiryServer(store, config);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); try { store.close(); } catch {} await rm(directory, { recursive: true, force: true }); });
  const post = (payload = lead, requestKey = key(), extra = {}) => fetch(base + '/api/inquiries', { method: 'POST', headers: { Origin: 'https://cn-dongda.com', 'Content-Type': 'application/json', 'Idempotency-Key': requestKey, ...extra }, body: JSON.stringify(payload) });
  const admin = async (path, options = {}) => fetch(base + '/api/admin/inquiries' + path, { ...options, headers: { Authorization: 'Bearer ' + config.adminToken, 'Content-Type': 'application/json', ...options.headers } });
  return { path, store, config, server, base, post, admin };
}

test('shared contract rejects oversized, missing, malformed and spam fields without silent truncation', () => {
  for (const invalid of [null, [], 'text', { ...lead, company: 'x'.repeat(121) }, { ...lead, contact: '' }, { ...lead, email: 'invalid' }, { ...lead, honeypot: 'bot' }, { ...lead, notes: { html: '<script>' } }, { ...lead, specifications: { qty: {} } }, { ...lead, type: 'fake' }]) {
    assert.throws(() => validateLead(invalid));
  }
  assert.equal(validateLead({ ...lead, company: "Company '); DROP TABLE inquiries;--" }).company, "Company '); DROP TABLE inquiries;--");
});

test('commit -> protected readback -> restart readback with atomic outbox', async t => {
  const f = await fixture(t);
  const response = await f.post();
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.persisted, true);
  assert.match(result.leadId, /^DD-/);
  const detail = await (await f.admin('/' + result.leadId)).json();
  assert.equal(detail.inquiry.lead.email, lead.email);
  assert.equal(detail.inquiry.notification.status, 'pending');
  f.store.close();
  const reopened = new InquiryStore(f.path);
  assert.equal(reopened.get(result.leadId).lead.company, lead.company);
  assert.equal(reopened.list().length, 1);
  reopened.close();
});

test('same key returns server ID once; changed payload conflicts without replacing original', async t => {
  const f = await fixture(t), requestKey = key();
  const first = await (await f.post(lead, requestKey)).json();
  const secondResponse = await f.post(lead, requestKey), second = await secondResponse.json();
  assert.equal(secondResponse.status, 200);
  assert.equal(second.leadId, first.leadId);
  assert.equal(second.duplicate, true);
  assert.equal((await f.post({ ...lead, company: 'Changed' }, requestKey)).status, 409);
  assert.equal(f.store.list().length, 1);
  assert.equal(f.store.get(first.leadId).lead.company, lead.company);
});

test('origin and admin permissions, MIME, body limits, validation and real 404 are enforced', async t => {
  const f = await fixture(t);
  assert.equal((await fetch(f.base + '/api/admin/inquiries')).status, 401);
  assert.equal((await fetch(f.base + '/api/admin/inquiries', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await f.post(lead, key(), { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await f.post(lead, key(), { Origin: '' })).status, 403);
  assert.equal((await f.post(lead, key(), { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await f.post(null)).status, 422);
  assert.equal((await f.post({ ...lead, notes: 'x'.repeat(20000) })).status, 413);
  assert.equal((await fetch(f.base + '/unknown')).status, 404);
  assert.equal((await f.admin('/DD-UNKNOWN123')).status, 404);
  assert.equal(f.store.list().length, 0);
});

test('notification failure keeps lead; retry uses same ID; gateway success is explicit', async t => {
  const f = await fixture(t);
  const result = await (await f.post()).json();
  assert.equal((await deliverNotification(f.store, {})).reason, 'not_configured');
  assert.equal(f.store.get(result.leadId).notification.status, 'pending');
  const config = { notificationUrl: 'https://gateway.example.test', salesRecipient: 'sales@example.test' };
  const failed = await deliverNotification(f.store, config, async () => { throw new Error('SECRET provider error'); });
  assert.equal(failed.ok, false);
  assert.equal(f.store.get(result.leadId).notification.status, 'failed');
  assert.equal(f.store.get(result.leadId).lead.email, lead.email);
  assert.equal(f.store.get(result.leadId).notification.lastError.includes('SECRET'), false);
  await f.admin('/' + result.leadId + '/retry', { method: 'POST' });
  let request;
  const delivered = await deliverNotification(f.store, config, async (_, options) => { request = options; return new Response(JSON.stringify({ accepted: true })); });
  assert.equal(delivered.ok, true);
  assert.equal(request.headers['Idempotency-Key'], result.leadId);
  assert.equal(f.store.get(result.leadId).notification.status, 'accepted');
  assert.equal((await f.admin('/' + result.leadId + '/retry', { method: 'POST' })).status, 409);
});

test('owner/status followup is persisted and invalid status is rejected', async t => {
  const f = await fixture(t);
  const result = await (await f.post()).json();
  const response = await f.admin('/' + result.leadId + '/followups', { method: 'POST', body: JSON.stringify({ status: 'contacted', owner: 'Sales A', note: 'Synthetic acceptance' }) });
  assert.equal(response.status, 200);
  assert.equal(f.store.get(result.leadId).followups.length, 1);
  assert.equal(f.store.get(result.leadId).owner, 'Sales A');
  assert.equal((await f.admin('/' + result.leadId + '/followups', { method: 'POST', body: JSON.stringify({ status: 'unknown', owner: '', note: '' }) })).status, 422);
});

test('public rate limit and non-sensitive reception response', async t => {
  const f = await fixture(t);
  const response = await f.post(), body = await response.text();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(body.includes(lead.email), false);
  assert.equal(body.includes(lead.company), false);
  for (let i = 0; i < 9; i++) await f.post();
  const blocked = await f.post();
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '60');
  assert.equal(f.store.list().length, 10);
});

test('real HTTP restart retains lead, outbox and idempotency; no duplicate after restart', async t => {
  const f = await fixture(t), requestKey = key();
  const result = await (await f.post(lead, requestKey)).json();
  await new Promise(resolve => f.server.close(resolve));
  f.store.close();
  const reopened = new InquiryStore(f.path), server = createInquiryServer(reopened, f.config);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(base + '/api/admin/inquiries/' + result.leadId, { headers: { Authorization: 'Bearer ' + f.config.adminToken } });
    const readback = (await response.json()).inquiry;
    assert.equal(readback.lead.email, lead.email);
    assert.equal(readback.notification.status, 'pending');
    const replay = await fetch(base + '/api/inquiries', { method: 'POST', headers: { Origin: f.config.allowedOrigins[0], 'Content-Type': 'application/json', 'Idempotency-Key': requestKey }, body: JSON.stringify(lead) });
    assert.equal((await replay.json()).duplicate, true);
    assert.equal(reopened.list().length, 1);
  } finally { await new Promise(resolve => server.close(resolve)); reopened.close(); }
});

test('storage failure never acknowledges reception', async t => {
  const f = await fixture(t);
  f.store.receive = () => { throw new Error('disk full private-path'); };
  const response = await f.post();
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(JSON.stringify(body).includes('private-path'), false);
});
