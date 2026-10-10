import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/js/procurement-core.js';

const core = globalThis.DongDaProcurement;
const product = {
  moqK: 1,
  specs: [
    { id: 'capacity', type: 'select', label: { en: 'Capacity', ru: 'Load' }, opts: [{ v: '1000', l: { en: '1000 kg', ru: '1000 kg RU' } }] },
    { id: 'qty', type: 'qty', label: { en: 'Quantity' }, min: 100, unit: 'pcs' }
  ]
};

test('MOQ uses both product and quantity field rather than conflicting FIBC minimum', () => {
  assert.equal(core.minimumQuantity(product), 1000);
  assert.equal(core.validateConfiguration(product, { capacity: '1000', qty: '999' }).qty, 'minimum');
  assert.deepEqual(core.validateConfiguration(product, { capacity: '1000', qty: '1000' }), {});
});

test('configuration rejects empty, unknown, decimal, negative and excessive values', () => {
  assert.equal(core.validateConfiguration(product, { capacity: 'fake', qty: '1000' }).capacity, 'required');
  for (const qty of ['', '-1', '1.5', '1e4', '1000000001', {}, Infinity]) {
    assert.equal(core.validateConfiguration(product, { capacity: '1000', qty }).qty, 'integer');
  }
});

test('configuration confirmation resolves option labels and quantity exactly once', () => {
  assert.deepEqual(core.configurationRows(product, { capacity: '1000', qty: '1000' }, 'ru'), [
    { id: 'capacity', label: 'Load', value: '1000 kg RU' },
    { id: 'qty', label: 'Quantity', value: '1000 pcs' }
  ]);
  assert.equal(core.localized({ zh: 'zh', en: 'en' }, 'ru'), 'en');
});

test('no endpoint never means received and does not send a request', async () => {
  const result = await core.submitInquiry({}, { endpoint: '', fetch: () => assert.fail('Unexpected fetch') });
  assert.deepEqual(result, { ok: false, reason: 'email-only' });
});

test('only explicit durable server acknowledgement counts as success', async () => {
  for (const data of [{}, { ok: true }, { ok: false, persisted: true, leadId: 'DD-12345678' }, { ok: true, persisted: true, leadId: 'client-id' }]) {
    const result = await core.submitInquiry({}, { endpoint: '/api/inquiries', idempotencyKey: 'test-key', fetch: async () => ({ ok: true, status: 200, json: async () => data }) });
    assert.equal(result.ok, false);
  }
  let request;
  const result = await core.submitInquiry({ company: 'Test' }, {
    endpoint: '/api/inquiries', idempotencyKey: 'test-key',
    fetch: async (_, options) => {
      request = options;
      return { ok: true, status: 201, json: async () => ({ ok: true, persisted: true, leadId: 'DD-12345678', duplicate: true }) };
    }
  });
  assert.equal(request.headers['Idempotency-Key'], 'test-key');
  assert.deepEqual(result, { ok: true, leadId: 'DD-12345678', duplicate: true });
});

test('invalid JSON, application failure, validation, throttling and timeout remain retryable failures', async () => {
  for (const [status, reason] of [[409, 'conflict'], [422, 'validation'], [429, 'rate-limit'], [503, 'unconfirmed']]) {
    assert.equal((await core.submitInquiry({}, { endpoint: '/api/inquiries', fetch: async () => ({ ok: false, status, json: async () => ({}) }) })).reason, reason);
  }
  assert.equal((await core.submitInquiry({}, { endpoint: '/api/inquiries', fetch: async () => { throw new Error('Offline'); } })).reason, 'network');
  assert.equal((await core.submitInquiry({}, {
    endpoint: '/api/inquiries', timeoutMs: 5,
    fetch: async (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Timeout', 'AbortError'))))
  })).reason, 'timeout');
});
