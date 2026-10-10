import test from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../aliyun/inquiry-function/inquiry-handler.mjs';

const payload = { type: 'inquiry', company: 'Synthetic', contact: 'QA', email: 'qa@example.test', product: 'FIBC' };
const event = body => ({ httpMethod: 'POST', headers: { Origin: 'http://localhost:4189', 'Idempotency-Key': 'synthetic-test-key-123' }, body: JSON.stringify(body) });

test('legacy template no longer claims reception when storage is missing', async () => {
  const result = await handler(event(payload), { env: {} });
  assert.equal(result.statusCode, 503);
  assert.equal(JSON.parse(result.body).ok, false);
});

test('legacy handler rejects unapproved origin and malformed body before forwarding', async () => {
  const config = { env: { LEADS_WEBHOOK_URL: 'https://storage.example.test' } };
  assert.equal((await handler({ ...event(payload), headers: { Origin: 'https://evil.example' } }, config)).statusCode, 403);
  assert.equal((await handler(event(null), config)).statusCode, 422);
  assert.equal((await handler(event({ ...payload, email: 'bad' }), config)).statusCode, 422);
});

test('legacy adapter requires durable acknowledgement and hides provider error details', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const config = { env: { LEADS_WEBHOOK_URL: 'https://storage.example.test' } };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, leadId: 'DD-TEST12345' }) });
  assert.equal((await handler(event(payload), config)).statusCode, 502);
  globalThis.fetch = async () => { throw new Error('PRIVATE SECRET'); };
  const failed = await handler(event(payload), config);
  assert.equal(failed.statusCode, 502);
  assert.equal(failed.body.includes('SECRET'), false);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, persisted: true, leadId: 'DD-TEST12345' }) });
  const received = await handler(event(payload), config);
  assert.deepEqual(JSON.parse(received.body), { ok: true, persisted: true, leadId: 'DD-TEST12345', duplicate: false });
});
