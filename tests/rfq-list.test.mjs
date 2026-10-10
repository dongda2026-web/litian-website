import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { randomUUID, randomBytes, webcrypto } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext, Script } from 'node:vm';
import '../assets/js/catalog-core.js';
import '../assets/js/procurement-core.js';
import '../assets/js/rfq-list-core.js';
import { InquiryStore, createInquiryServer, validateLead } from '../server/inquiry-service.mjs';
import { deliverCrmInquiry } from '../server/crm-delivery.mjs';

const catalog = DongDaCatalog.create(JSON.parse(await readFile(new URL('../content/products.json', import.meta.url), 'utf8')));
const core = DongDaRfqList;
const row = (id = 'fibc-bulk-bags') => {
  const product = catalog.resolve(id);
  return { lineId: 'line-' + randomUUID(), productId: id, specifications: Object.fromEntries(product.configuration.map(field =>
    [field.id, field.type === 'qty' ? String(DongDaProcurement.minimumQuantity(product)) : field.opts[0].v])) };
};
const lead = () => ({ type: 'multi-product-rfq', company: 'Synthetic RFQ Buyer', contact: 'Synthetic RFQ Contact', email: 'rfq@example.test',
  phone: '', product: 'Multi-product RFQ (2)', productId: '', quantity: '', quantityUnit: '', specifications: '',
  items: core.items([row(), row()], catalog, 'en'), destination: 'Synthetic destination', deliveryWindow: 'Subject to confirmation',
  notes: '', language: 'en', page: 'https://cn-dongda.com/#rfq' });

test('RFQ draft roundtrip retains distinct line identities and configurations, never contacts', () => {
  const first = row(), second = row(); second.specifications.qty = '2000';
  const values = core.draft([first, second], catalog), saved = core.serialize(values, catalog);
  assert.deepEqual(core.restore(saved, catalog), values);
  assert.notEqual(values[0].lineId, values[1].lineId);
  values[0].specifications.qty = '3000'; assert.notEqual(first.specifications.qty, '3000');
  assert.deepEqual(Object.keys(JSON.parse(saved)), ['version', 'items']);
  assert.throws(() => core.restore(JSON.stringify({ version: 1, items: [first], email: 'private@example.test' }), catalog));
  assert.equal(core.draft([{ ...first, specifications: {} }], catalog)[0].specifications.qty, '');
});

test('RFQ validates every item: count, identity, canonical products, quantity and allowed options', () => {
  const first = row(), second = row();
  assert.equal(core.items(Array.from({ length: 20 }, () => row()), catalog, 'en').length, 20);
  for (const values of [[], Array.from({ length: 21 }, () => row()), [first, first], [{ ...first, lineId: 'line-' + '-'.repeat(36) }],
    [{ ...first, productId: 'unknown' }], [{ ...first, specifications: { ...first.specifications, qty: false } }],
    [{ ...first, specifications: { ...first.specifications, capacity: 'fake' } }], [{ ...first, specifications: { ...first.specifications, extra: 'value' } }]]) {
    assert.throws(() => core.items(values, catalog, 'en'));
  }
  for (const qty of ['', '0', '1.5', '-1', '1000000001']) assert.throws(() => core.items([{ ...first, specifications: { ...first.specifications, qty } }], catalog, 'en'));
  assert.equal(core.items([{ ...first, specifications: { ...first.specifications, qty: '1' } }], catalog, 'en')[0].quantity, '1');
  const items = core.items([first, second], catalog, 'en');
  assert.deepEqual(core.validateItems(items, catalog), items);
  for (const changes of [{ quantity: '2' }, { quantityUnit: 'kg' }, { product: '' }, { price: '1' }]) assert.throws(() => core.validateItems([{ ...items[0], ...changes }], catalog));
  assert.throws(() => core.restore('x'.repeat(64001), catalog));
});

test('RFQ public schema rejects aggregate quantity and malformed destination instead of truncating', () => {
  const valid = lead(); assert.deepEqual(validateLead(valid), valid);
  for (const changes of [{ items: [] }, { quantity: '2000' }, { productId: 'fibc-bulk-bags' }, { specifications: {} },
    { destination: '' }, { destination: 'x'.repeat(161) }, { deliveryWindow: null }, { email: 'bad' }]) assert.throws(() => validateLead({ ...valid, ...changes }));
  assert.throws(() => validateLead({ ...valid, type: 'inquiry' }));
});

test('RFQ retry key survives reload without persisting customer data; changed payload gets a new key', async () => {
  const source = await readFile(new URL('../assets/js/rfq-list-ui.js', import.meta.url), 'utf8'); new Script(source);
  const cache = new Map(), sessionStorage = { getItem: key => cache.get(key) || null, setItem: (key, value) => cache.set(key, value), removeItem: key => cache.delete(key) };
  const context = () => { const value = { sessionStorage, crypto: webcrypto, TextEncoder }; runInNewContext(source, value); return value; };
  const payload = lead(), first = await context().rfqRequestKey(payload);
  assert.equal(await context().rfqRequestKey(payload), first);
  const saved = [...cache.values()].join('');
  for (const privateValue of [payload.company, payload.email, payload.contact, payload.destination]) assert.equal(saved.includes(privateValue), false);
  assert.notEqual(await context().rfqRequestKey({ ...payload, notes: 'Changed requirement' }), first);
  const receiptContext = context();
  Object.assign(receiptContext, { DongDaRfqList: core, catalog, document: { getElementById: () => ({ hidden: false, classList: { remove() {} } }) } });
  cache.set('dongda-rfq-list-v1', core.serialize([], catalog)); cache.set('dongda-rfq-receipt-v1', 'DD-' + randomUUID().toUpperCase());
  cache.set('dongda-rfq-language-v1', 'zh');
  receiptContext.restoreRfqList(); assert.equal(receiptContext.rfqListState.receipt, cache.get('dongda-rfq-receipt-v1'));
  assert.equal(receiptContext.lang, 'zh');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const initialization = html.match(/setLangAll\((initialIndustryPage\?initialIndustryPage\.language:initialProductPage\?initialProductPage\.language:lang)\);/)?.[0];
  assert.ok(initialization, 'page initialization must retain restored language and prefer a physical route locale');
  for (const [industryPage, productPage, restored, expected] of [[null,null,'zh','zh'],[null,null,'ru','ru'],[null,{language:'en'},'zh','en'],[{language:'ru'},null,'zh','ru']]) {
    let selected;
    runInNewContext(initialization, {initialIndustryPage:industryPage,initialProductPage:productPage,lang:restored,setLangAll:value=>{selected=value;}});
    assert.equal(selected,expected);
  }
  receiptContext.resetRfqReceipt(); assert.equal(cache.has('dongda-rfq-request-v1'), false); assert.equal(cache.has('dongda-rfq-receipt-v1'), false);
});

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'dongda-rfq-')), path = join(directory, 'inquiries.sqlite'), store = new InquiryStore(path);
  const config = { adminToken: randomBytes(32).toString('hex'), rateSalt: randomBytes(32).toString('hex'), allowedOrigins: ['https://cn-dongda.com'] };
  const server = createInquiryServer(store, config); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); try { store.close(); } catch {} await rm(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (payload, key = randomUUID()) => fetch(base + '/api/inquiries', { method: 'POST',
    headers: { Origin: config.allowedOrigins[0], 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(payload) });
  return { path, store, config, server, base, post };
}

test('RFQ frontend submission uses the shared field reader, retains failure drafts and guards double-clicks', async () => {
  const source = await readFile(new URL('../assets/js/rfq-list-ui.js', import.meta.url), 'utf8');
  const cache = new Map(), requests = [], receipts = [];
  const values = { 'rfq-company': 'Synthetic frontend company', 'rfq-contact': 'Synthetic frontend contact', 'rfq-email': 'frontend@example.test', 'rfq-destination': 'Synthetic frontend destination' };
  const elements = new Map();
  const context = { lang: 'en', catalog, DongDaRfqList: core, DONGDA_LIST_COPY: { en: { request: 'Multi-product request', ackPending: 'Submitting' } },
    crypto: webcrypto, TextEncoder, window: { DONGDA_INQUIRY_ENDPOINT: '/api/inquiries' }, location: { href: 'https://cn-dongda.com/#rfq' },
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, { hidden: false, classList: { remove() {} }, reset() {} }); return elements.get(id); } },
    fieldValue: id => values[id] || '', validateContactFields: () => true, setLeadStatus() {}, rfqText: key => key,
    showEmailFallback() {}, saveLeadLocal: result => receipts.push(result),
    sessionStorage: { getItem: key => cache.get(key) || null, setItem: (key, value) => cache.set(key, value), removeItem: key => cache.delete(key) },
    DongDaProcurement: { ...DongDaProcurement, submitInquiry: async (payload, options) => { requests.push({ payload, options }); return { ok: false, reason: 'network' }; } } };
  runInNewContext(source, context); context.renderRfqList = () => {};
  const selected = [row(), row('valve-bags')]; context.rfqListState.items = selected;
  const event = { preventDefault() {} };
  await Promise.all([context.submitRfqList(event), context.submitRfqList(event)]);
  assert.equal(requests.length, 1); assert.equal(receipts.length, 0); assert.equal(context.rfqListState.items, selected); assert.equal(context.rfqListState.busy, false);
  assert.equal(requests[0].payload.company, values['rfq-company']); assert.equal(requests[0].payload.items.length, 2); assert.equal(requests[0].payload.quantity, '');
  context.DongDaProcurement.submitInquiry = async (payload, options) => { requests.push({ payload, options }); return { ok: true, leadId: 'DD-' + randomUUID().toUpperCase() }; };
  await context.submitRfqList(event);
  assert.equal(requests[1].options.idempotencyKey, requests[0].options.idempotencyKey); assert.equal(receipts.length, 1); assert.equal(context.rfqListState.items.length, 0);
  assert.equal(cache.get('dongda-rfq-receipt-v1'), receipts[0].leadId);
  for (const value of Object.values(values)) assert.equal([...cache.values()].join('').includes(value), false);
});

test('RFQ durable reception, protected readback, retry conflict, CRM v2 and restart preserve all lines', async t => {
  const f = await fixture(t), payload = lead(), key = randomUUID();
  const response = await f.post(payload, key); assert.equal(response.status, 201); const receipt = await response.json();
  assert.equal(receipt.persisted, true); assert.equal(JSON.stringify(receipt).includes(payload.email), false);
  assert.equal((await fetch(f.base + '/api/admin/inquiries/' + receipt.leadId)).status, 401);
  const readback = await (await fetch(f.base + '/api/admin/inquiries/' + receipt.leadId, { headers: { Authorization: 'Bearer ' + f.config.adminToken } })).json();
  assert.deepEqual(readback.inquiry.lead, payload);
  assert.equal((await (await f.post(payload, key)).json()).leadId, receipt.leadId);
  assert.equal((await f.post({ ...payload, destination: 'Changed destination' }, key)).status, 409);
  assert.equal(f.store.list().length, 1);
  const crm = { crmUrl: 'https://erp.cn-dongda.com/api/sales/website-inquiries', crmSiteId: 'dongda-website', crmToken: randomBytes(32).toString('hex') };
  let sent;
  const delivered = await deliverCrmInquiry(f.store, crm, async (_, options) => {
    sent = JSON.parse(options.body); return new Response(JSON.stringify({ ok: true, persisted: true, siteId: crm.crmSiteId, sourceInquiryId: receipt.leadId, leadId: 'sale-' + randomUUID(), duplicate: false }), { status: 201 });
  });
  assert.equal(delivered.ok, true); assert.equal(sent.schemaVersion, '2026.10.08-v2'); assert.deepEqual(sent.payload, payload);
  f.store.close(); const reopened = new InquiryStore(f.path); assert.deepEqual(reopened.get(receipt.leadId).lead, payload); assert.equal(reopened.get(receipt.leadId).crm.status, 'synced'); reopened.close();
});

test('RFQ body limit is 64KB only for multi-item type; invalid submissions never receive an ID', async t => {
  const f = await fixture(t), payload = lead(); payload.items = core.items(Array.from({ length: 20 }, () => row()), catalog, 'en');
  payload.items.forEach(item => { item.product = 'Synthetic product title '.repeat(6); });
  const response = await f.post(payload); assert.equal(response.status, 201);
  assert.equal((await f.post({ ...payload, notes: 'x'.repeat(65536) })).status, 413);
  assert.equal((await f.post({ ...payload, notes: 'x'.repeat(20000) })).status, 422);
  assert.equal((await f.post({ ...payload, type: 'inquiry', notes: 'x'.repeat(20000) })).status, 413);
  assert.equal((await f.post({ ...payload, items: payload.items.concat(payload.items[0]) })).status, 422);
  assert.equal(f.store.list().length, 1);
});
