import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer as netServer } from 'node:net';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PDFDocument, PDFName } from 'pdf-lib';
import { InquiryStore, createInquiryServer, validateLead } from '../server/inquiry-service.mjs';
import { PrivateUploads, validateUploadName, UPLOAD_LIMITS } from '../server/private-uploads.mjs';
import { ClamAvScanner, UploadError } from '../server/upload-scanner.mjs';
import { deliverCrmInquiry } from '../server/crm-delivery.mjs';
import { inspectUploadPdf } from '../server/pdf-upload-inspector.mjs';
import { readMonitoring } from '../server/inquiry-monitoring.mjs';
import { IMAGE_SELF_TEST, IMAGE_POLICY, IMAGE_DECODER } from '../server/image-upload-inspector.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64');
const digest = value => createHash('sha256').update(value).digest('hex');
const source = () => ({ type: 'quote-calculator', company: 'Synthetic Upload Buyer', contact: 'Synthetic QA', email: 'upload@example.test', phone: '', product: 'FIBC Bulk Bags', productId: 'fibc-bulk-bags',
  quantity: '1000', quantityUnit: 'pcs', specifications: { capacity: '1000', sling: '4loop', liner: 'pe', discharge: 'bot', qty: '1000' }, notes: '', language: 'en', page: 'https://cn-dongda.com/#quote/fibc-bulk-bags' });
const scanResult = () => ({ engine: 'ClamAV 1.5.0', signatureVersion: '28147', signatureDate: new Date(Date.now() - 1000).toISOString(), scannedAt: new Date().toISOString() });
const fakeScanner = () => ({ version: async () => scanResult(), scan: async () => scanResult() });
// Admission/transaction tests use a synthetic proof, not evidence of actual decoding.
const imageProof = (bytes, mimeType) => ({ ok: true, policy: IMAGE_POLICY, decoder: IMAGE_DECODER, mimeType, size: bytes.length, sha256: digest(bytes), width: 1, height: 1, frames: 1 });
const fakeInspector = () => ({ ready: async () => imageProof(IMAGE_SELF_TEST, 'image/png'), inspect: async (bytes, mimeType) => imageProof(bytes, mimeType) });

test('opt-in attachment transport sends only bound verified originals and requires every hash in the persisted ACK', async t => {
  const f = await fixture(t), session = await f.issue(), file = (await (await f.upload(session)).json()).file;
  const received = await f.post(session, { ...source(), attachments: [{ id: file.id }] }); assert.equal(received.status, 201); const id = (await received.json()).leadId;
  const config = { crmUrl: 'https://erp.example.test/api/sales/website-inquiries', crmSiteId: 'dongda-website', crmToken: randomBytes(32).toString('hex'), crmAttachmentsEnabled: true };
  const ack = { ok: true, persisted: true, siteId: config.crmSiteId, sourceInquiryId: id, leadId: 'sale-' + randomUUID(), duplicate: false };
  let count = 0;
  const send = async (_url, options) => {
    count++; const { digest: actual, files, ...packet } = JSON.parse(options.body);
    assert.equal(packet.schemaVersion, '2026.10.08-v5');
    const { canonicalPacket } = await import('../server/crm-delivery.mjs');
    assert.equal(actual, digest(canonicalPacket(packet))); assert.deepEqual(Buffer.from(files[0].data, 'base64'), png);
    assert.equal(files[0].id, file.id); assert.deepEqual(packet.payload.attachments, [file]);
    return new Response(JSON.stringify(count === 1 ? ack : { ...ack, duplicate: true, attachments: [{ id: file.id, sha256: file.sha256 }] }), { status: count === 1 ? 201 : 200 });
  };
  assert.equal((await deliverCrmInquiry(f.store, config, send)).reason, 'delivery_not_confirmed'); assert.equal(f.store.get(id).crm.status, 'failed');
  f.store.db.prepare('UPDATE crm_deliveries SET next_at=0 WHERE inquiry_id=?').run(id);
  assert.equal((await deliverCrmInquiry(f.store, config, send)).ok, true); assert.equal(f.store.get(id).crm.mainLeadId, ack.leadId); assert.equal(count, 2);
  await f.reopen(); assert.equal(f.store.get(id).crm.status, 'synced'); assert.deepEqual(f.store.uploads.content(id, file.id).bytes, png);
});

test('opt-in attachment transport never sends corrupted or mismatched bound content', async t => {
  const f = await fixture(t), session = await f.issue(), file = (await (await f.upload(session)).json()).file;
  const received = await f.post(session, { ...source(), attachments: [{ id: file.id }] }); assert.equal(received.status, 201); const id = (await received.json()).leadId;
  f.store.db.prepare('UPDATE private_uploads SET data=? WHERE id=?').run(Buffer.alloc(png.length), file.id);
  let requests = 0;
  const result = await deliverCrmInquiry(f.store, { crmUrl: 'https://erp.example.test/api/sales/website-inquiries', crmSiteId: 'dongda-website', crmToken: randomBytes(32).toString('hex'), crmAttachmentsEnabled: true }, async () => { requests++; });
  assert.equal(result.reason, 'delivery_not_confirmed'); assert.equal(requests, 0); assert.equal(f.store.get(id).crm.status, 'failed');
});

async function fixture(t, scanner = fakeScanner(), imageInspector = fakeInspector()) {
  const directory = await mkdtemp(join(tmpdir(), 'dongda-upload-')), path = join(directory, 'inquiries.sqlite');
  let store = new InquiryStore(path), server, base, now = Date.now();
  const config = { adminToken: randomBytes(32).toString('hex'), rateSalt: randomBytes(32).toString('hex'), allowedOrigins: ['https://cn-dongda.com'], uploads: { scanner, imageInspector, now: () => now } };
  const start = async () => { server = createInquiryServer(store, config); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = 'http://127.0.0.1:' + server.address().port; };
  await start();
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); await rm(directory, { recursive: true, force: true }); });
  const issue = async () => {
    const response = await fetch(base + '/api/upload-session', { method: 'POST', headers: { Origin: config.allowedOrigins[0], 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 201); const body = await response.json();
    return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: body.csrfToken, headers: { Origin: config.allowedOrigins[0], Cookie: response.headers.get('set-cookie').split(';')[0], 'X-Upload-CSRF': body.csrfToken }, expiresAt: body.expiresAt, cookieHeader: response.headers.get('set-cookie') };
  };
  const upload = (session, bytes = png, name = '需求图.png', type = 'image/png', key = randomUUID()) => {
    const body = new FormData(); body.append('file', new Blob([bytes], { type }), name);
    return fetch(base + '/api/uploads', { method: 'POST', headers: { ...session.headers, 'Idempotency-Key': key }, body });
  };
  const post = (session, payload, key = randomUUID()) => fetch(base + '/api/inquiries', { method: 'POST', headers: { ...session.headers, 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(payload) });
  return { directory, path, config, issue, upload, post, get store() { return store; }, get base() { return base; }, advance: value => { now += value; },
    reopen: async () => { await new Promise(resolve => server.close(resolve)); store.close(); store = new InquiryStore(path); await start(); } };
}

test('opt-in uploads require an inspector and failed readiness cannot issue a draft capability', async t => {
  assert.throws(() => new PrivateUploads({}, { scanner: fakeScanner() }, {}), /isolated fail-closed/);
  const inspector = fakeInspector(), f = await fixture(t, fakeScanner(), inspector);
  inspector.ready = async () => { throw new UploadError(503, 'image_inspection_unavailable'); };
  const response = await fetch(f.base + '/api/upload-session', { method: 'POST', headers: { Origin: f.config.allowedOrigins[0], 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 503); assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS count FROM upload_sessions').get().count, 0);
});

test('image rejection, missing decoder and malformed proof cannot scan or persist bytes; later retry recovers', async t => {
  let scans = 0;
  const scanner = { version: async () => scanResult(), scan: async () => { scans++; return scanResult(); } }, inspector = fakeInspector();
  const f = await fixture(t, scanner, inspector), session = await f.issue(), key = randomUUID();
  for (const failure of [new UploadError(422, 'image_content_not_allowed'), new UploadError(503, 'image_inspection_unavailable'), new UploadError(503, 'image_inspection_timeout')]) {
    inspector.inspect = async () => { throw failure; };
    assert.equal((await f.upload(session, png, 'drawing.png', 'image/png', key)).status, failure.status);
  }
  for (const proof of [undefined, { ...imageProof(png, 'image/png'), sha256: '0'.repeat(64) }, { ...imageProof(png, 'image/png'), extra: true }, { ...imageProof(png, 'image/png'), width: 8193 }]) {
    inspector.inspect = async () => proof;
    assert.equal((await f.upload(session, png, 'drawing.png', 'image/png', key)).status, 503);
  }
  assert.equal(scans, 0); assert.equal(f.store.uploads.active, 0);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS count FROM private_uploads').get().count, 0);
  inspector.inspect = fakeInspector().inspect;
  assert.equal((await f.upload(session, png, 'drawing.png', 'image/png', key)).status, 201);
  assert.equal(scans, 1);
});

test('inspection proof is private, persisted with original bytes and required for new binding', async t => {
  const f = await fixture(t), session = await f.issue(), file = (await (await f.upload(session)).json()).file;
  assert.equal(Object.hasOwn(file, 'imageInspection'), false);
  const row = f.store.db.prepare('SELECT * FROM private_uploads WHERE id=?').get(file.id);
  assert.equal(row.image_policy, IMAGE_POLICY); assert.deepEqual(JSON.parse(row.image_inspection), imageProof(png, 'image/png'));
  assert.deepEqual(Buffer.from(row.data), png);
  f.store.db.prepare("UPDATE private_uploads SET image_inspection='' WHERE id=?").run(file.id);
  assert.equal((await f.post(session, { ...source(), attachments: [{ id: file.id }] })).status, 409);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS count FROM inquiries').get().count, 0);
  f.store.db.prepare('UPDATE private_uploads SET image_inspection=? WHERE id=?').run(row.image_inspection, file.id);
  assert.equal((await f.post(session, { ...source(), attachments: [{ id: file.id }] })).status, 201);
});

test('expiry during isolated inspection rejects before antivirus or insertion', async t => {
  let scans = 0; const inspector = fakeInspector();
  const f = await fixture(t, { version: async () => scanResult(), scan: async () => { scans++; return scanResult(); } }, inspector), session = await f.issue();
  inspector.inspect = async (bytes, mime) => { f.advance(UPLOAD_LIMITS.ttlMs + 1); return imageProof(bytes, mime); };
  assert.equal((await f.upload(session)).status, 401); assert.equal(scans, 0);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS count FROM private_uploads').get().count, 0);
});

test('committed identical upload retry survives inspector outage without changing its original proof', async t => {
  const inspector = fakeInspector(), f = await fixture(t, fakeScanner(), inspector), session = await f.issue(), key = randomUUID();
  const file = (await (await f.upload(session, png, 'drawing.png', 'image/png', key)).json()).file;
  const before = f.store.db.prepare('SELECT image_policy,image_inspection FROM private_uploads WHERE id=?').get(file.id);
  inspector.inspect = async () => { throw new UploadError(503, 'image_inspection_unavailable'); };
  const retry = await f.upload(session, png, 'drawing.png', 'image/png', key);
  assert.equal(retry.status, 200); assert.deepEqual((await retry.json()).file, file);
  assert.deepEqual(f.store.db.prepare('SELECT image_policy,image_inspection FROM private_uploads WHERE id=?').get(file.id), before);
  assert.equal((await f.upload(session, png, 'other.png', 'image/png', key)).status, 409);
});

test('legacy bound originals and receipt retries survive additive migration but unchecked ready images cannot bind', async t => {
  const f = await fixture(t), session = await f.issue(), first = (await (await f.upload(session)).json()).file, second = (await (await f.upload(session)).json()).file;
  const key = randomUUID(), payload = { ...source(), attachments: [{ id: first.id }] }, response = await f.post(session, payload, key);
  assert.equal(response.status, 201); const id = (await response.json()).leadId, before = f.store.get(id).lead;
  f.store.db.exec('ALTER TABLE private_uploads DROP COLUMN image_inspection; ALTER TABLE private_uploads DROP COLUMN image_policy;');
  await f.reopen();
  assert.ok(f.store.uploads.backup); assert.deepEqual(f.store.get(id).lead, before);
  assert.deepEqual(f.store.uploads.content(id, first.id).bytes, png);
  assert.equal((await f.post(session, payload, key)).status, 200);
  assert.equal((await f.post(session, { ...source(), attachments: [{ id: second.id }] })).status, 409);
  assert.deepEqual({ ...f.store.db.prepare('SELECT image_policy,image_inspection FROM private_uploads WHERE id=?').get(first.id) }, { image_policy: '', image_inspection: '' });
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS count FROM private_uploads').get().count, 2);
});

test('private upload filename policy preserves multilingual names and rejects unsafe paths, controls and unsupported formats', () => {
  assert.equal(validateUploadName('需求图.v2.PNG'), 'png'); assert.equal(validateUploadName('technical drawing.pdf'), 'pdf');
  for (const value of ['', '../file.png', 'a\\file.png', '.hidden.png', ' a.png', 'a.png ', 'a:1.png', 'a\n.png', 'a\u202e.png', 'a<script>.png', 'a'.repeat(121) + '.png', 'file.svg', 'file.zip', 'a.png.exe']) assert.throws(() => validateUploadName(value));
});

async function protocol(t, { verdict = 'stream: OK', version, wait = false } = {}) {
  let versions = 0; const received = [];
  const server = netServer(socket => {
    let data = Buffer.alloc(0), responded = false;
    socket.on('error', () => {});
    socket.on('data', chunk => {
      data = Buffer.concat([data, chunk]);
      if (responded || wait) return;
      const zero = data.indexOf(0); if (zero < 0) return;
      const command = data.subarray(0, zero).toString();
      if (command === 'zVERSION') { responded = true; versions++; socket.end((typeof version === 'function' ? version(versions) : version || 'ClamAV 1.5.0/28147/' + new Date().toUTCString()) + '\0'); return; }
      assert.equal(command, 'zINSTREAM'); let offset = zero + 1; const chunks = [];
      while (offset + 4 <= data.length) {
        const length = data.readUInt32BE(offset); offset += 4;
        if (!length) { received.push(Buffer.concat(chunks)); responded = true; socket.end(verdict + '\0'); return; }
        if (offset + length > data.length) return;
        chunks.push(data.subarray(offset, offset + length)); offset += length;
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); });
  return { scanner: new ClamAvScanner({ port: server.address().port, timeoutMs: wait ? 30 : 1000 }), received };
}

test('ClamAV adapter uses length-framed original bytes and records matching fresh engine/signature identity', async t => {
  const f = await protocol(t); const result = await f.scanner.scan(png);
  assert.deepEqual(f.received, [png]); assert.equal(result.engine, 'ClamAV 1.5.0'); assert.equal(result.signatureVersion, '28147'); assert.ok(Date.parse(result.scannedAt));
  assert.throws(() => new ClamAvScanner({ host: 'remote.example.test' })); assert.throws(() => new ClamAvScanner({ socketPath: 'relative' }));
  const utc = new Date().toUTCString(), unzoned = utc.replace(/^\w{3}, /, '').replace(/ GMT$/, ''), expected = Date.parse(utc);
  const unzonedScanner = await protocol(t, { version: 'ClamAV 1.5.0/28147/' + unzoned });
  assert.equal(Date.parse((await unzonedScanner.scanner.version()).signatureDate), expected);
});

test('ClamAV adapter rejects detection, stale or changed signatures, unknown response and timeout without leaking provider text', async t => {
  for (const [options, code] of [[{ verdict: 'stream: Synthetic.Threat FOUND' }, 'file_rejected'], [{ verdict: 'stream: size limit exceeded ERROR' }, 'scanner_unavailable'],
    [{ version: 'ClamAV 1.5.0/28147/' + new Date(Date.now() - 72 * 3600000).toUTCString() }, 'scanner_signatures_stale'],
    [{ version: number => 'ClamAV 1.5.0/' + (28147 + number) + '/' + new Date().toUTCString() }, 'scanner_changed'], [{ wait: true }, 'scanner_unavailable']]) {
    const f = await protocol(t, options); await assert.rejects(f.scanner.scan(png), error => error instanceof UploadError && error.code === code && !error.message.includes('Synthetic.Threat'));
  }
});

test('upload sessions are HttpOnly, CSRF-bound, origin-restricted and opaque across buyers', async t => {
  const f = await fixture(t), first = await f.issue(), second = await f.issue();
  assert.match(first.cookieHeader, /HttpOnly/); assert.match(first.cookieHeader, /SameSite=Strict/); assert.match(first.cookieHeader, /Secure/);
  assert.equal((await f.upload({ headers: { Origin: f.config.allowedOrigins[0] } })).status, 401);
  assert.equal((await f.upload({ headers: { ...first.headers, 'X-Upload-CSRF': 'a'.repeat(64) } })).status, 403);
  assert.equal((await f.upload({ headers: { ...first.headers, Origin: 'https://other.example.test' } })).status, 403);
  const uploaded = await f.upload(first); assert.equal(uploaded.status, 201); const id = (await uploaded.json()).file.id;
  assert.equal((await fetch(f.base + '/api/uploads/' + id, { headers: second.headers })).status, 404);
  assert.equal((await fetch(f.base + '/api/uploads/' + id)).status, 403);
  const row = await (await fetch(f.base + '/api/uploads/' + id, { headers: first.headers })).json(); assert.equal(row.state, 'ready'); assert.equal(row.data, undefined);
  f.advance(UPLOAD_LIMITS.ttlMs + 1);
  assert.equal((await fetch(f.base + '/api/uploads/' + id, { headers: first.headers })).status, 401);
  assert.equal((await f.post(first, { ...source(), attachments: [{ id }] })).status, 401);
});

test('multipart type, declared MIME, signature, actual bytes, extra fields and file count are enforced before persistence', async t => {
  const f = await fixture(t), session = await f.issue();
  for (const [bytes, name, type, status] of [[png, 'a.pdf', 'application/pdf', 415], [Buffer.from('<svg/>'), 'a.png', 'image/png', 415], [png, 'a.png', 'text/plain', 415],
    [Buffer.alloc(UPLOAD_LIMITS.fileBytes + 1), 'a.png', 'image/png', 413], [Buffer.alloc(0), 'a.png', 'image/png', 422]]) assert.equal((await f.upload(session, bytes, name, type)).status, status);
  const body = new FormData(); body.append('file', new Blob([png], { type: 'image/png' }), 'a.png'); body.append('metadata', 'must not trust this');
  assert.equal((await fetch(f.base + '/api/uploads', { method: 'POST', headers: { ...session.headers, 'Idempotency-Key': randomUUID() }, body })).status, 422);
  const multiple = new FormData(); for (let i = 0; i < 2; i++) multiple.append('file', new Blob([png], { type: 'image/png' }), 'a.png');
  assert.equal((await fetch(f.base + '/api/uploads', { method: 'POST', headers: { ...session.headers, 'Idempotency-Key': randomUUID() }, body: multiple })).status, 422);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS count FROM private_uploads').get().count, 0);
});

test('exact five-MiB boundary and ten-MiB session total are accepted, an additional byte is rejected', async t => {
  const f = await fixture(t), session = await f.issue(), bytes = Buffer.concat([png, Buffer.alloc(UPLOAD_LIMITS.fileBytes - png.length)]);
  assert.equal((await f.upload(session, bytes, 'first.png')).status, 201);
  assert.equal((await f.upload(session, bytes, 'second.png')).status, 201);
  assert.equal((await f.upload(session)).status, 413);
  assert.equal(f.store.db.prepare('SELECT SUM(size_bytes) AS bytes FROM private_uploads').get().bytes, UPLOAD_LIMITS.totalBytes);
});

test('PDF structural policy accepts static documents, rejects embedded files, scripts, escaped action keys and broken PDF without altering originals', async () => {
  const plain = await PDFDocument.create(); plain.addPage([100, 100]); const before = Buffer.from(await plain.save()); const hash = digest(before);
  await inspectUploadPdf(before); assert.equal(digest(before), hash);
  await plain.attach(Buffer.from('Synthetic attachment'), 'file.txt');
  await assert.rejects(inspectUploadPdf(Buffer.from(await plain.save())), error => error.code === 'file_content_not_allowed');
  const active = await PDFDocument.create(); active.addPage([100, 100]); active.addJavaScript('synthetic-test', 'app.alert("Synthetic");');
  await assert.rejects(inspectUploadPdf(Buffer.from(await active.save())), error => error.code === 'file_content_not_allowed');
  const launched = await PDFDocument.create(); launched.addPage([100, 100]); launched.catalog.set(PDFName.of('OpenAction'), launched.context.obj({ S: 'Launch', F: 'synthetic.exe' }));
  await assert.rejects(inspectUploadPdf(Buffer.from(await launched.save())), error => error.code === 'file_content_not_allowed');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /Names << /Java#53cript << /Names [(Synthetic) 4 0 R] >> >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>',
    '<< /S /Java#53cript /J#53 (Synthetic script) >>',
  ];
  let encoded = '%PDF-1.7\n'; const offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(encoded)); encoded += (index + 1) + ' 0 obj\n' + object + '\nendobj\n'; }
  const xref = Buffer.byteLength(encoded);
  encoded += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n' + offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
  encoded += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  const escaped = Buffer.from(encoded);
  assert.equal((await PDFDocument.load(escaped)).getPageCount(), 1);
  await assert.rejects(inspectUploadPdf(escaped), error => error.code === 'file_content_not_allowed');
  const manyPages = await PDFDocument.create(); for (let page = 0; page < 101; page++) manyPages.addPage([100, 100]);
  await assert.rejects(inspectUploadPdf(Buffer.from(await manyPages.save())), error => error.code === 'file_content_not_allowed');
  const deep = await PDFDocument.create(); deep.addPage([100, 100]); let nested = deep.context.obj({});
  for (let depth = 0; depth < 55; depth++) nested = deep.context.obj({ Child: nested });
  deep.catalog.set(PDFName.of('SyntheticDepth'), nested);
  await assert.rejects(inspectUploadPdf(Buffer.from(await deep.save())), error => error.code === 'file_complexity_limit');
  await assert.rejects(inspectUploadPdf(Buffer.from('%PDF-1.7\ninvalid\n%%EOF')), error => error.code === 'file_content_not_allowed');
});

test('HTTP PDF policy rejects embedded content before scan/storage and never labels legacy rows as newly validated', async t => {
  let scans = 0; const f = await fixture(t, { ...fakeScanner(), scan: async () => { scans++; return scanResult(); } }), session = await f.issue();
  const document = await PDFDocument.create(); document.addPage([100, 100]); await document.attach(Buffer.from('Synthetic'), 'file.txt');
  assert.equal((await f.upload(session, Buffer.from(await document.save()), 'technical.pdf', 'application/pdf')).status, 422); assert.equal(scans, 0);
  const file = (await (await f.upload(session)).json()).file;
  f.store.db.prepare("UPDATE private_uploads SET validation_policy='' WHERE id=?").run(file.id);
  assert.equal((await f.post(session, { ...source(), attachments: [{ id: file.id }] })).status, 409); assert.equal(f.store.list().length, 0);
});

test('scan errors, invalid proof and exhausted quotas never return a successful file or persist unscanned bytes', async t => {
  for (const [scanner, expected] of [[fakeScanner(), 201], [{ ...fakeScanner(), scan: async () => { throw new UploadError(422, 'file_rejected'); } }, 422], [{ ...fakeScanner(), scan: async () => { throw new UploadError(503, 'scanner_unavailable'); } }, 503], [{ ...fakeScanner(), scan: async () => ({ clean: true }) }, 503]]) {
    const f = await fixture(t, scanner), session = await f.issue();
    const response = await f.upload(session);
    assert.equal(response.status, expected);
    if (expected === 201) {
      await f.upload(session); await f.upload(session); assert.equal((await f.upload(session)).status, 413);
      assert.equal(f.store.db.prepare('SELECT COUNT(*) AS count FROM private_uploads').get().count, 3);
    } else {
      assert.equal((await response.json()).ok, false);
      assert.equal(f.store.db.prepare('SELECT COUNT(*) AS count FROM private_uploads').get().count, 0);
    }
  }
});

test('upload same-key replay preserves original bytes while changed payload and removed files conflict', async t => {
  const f = await fixture(t), session = await f.issue(), key = randomUUID();
  const first = await f.upload(session, png, 'a.png', 'image/png', key); assert.equal(first.status, 201); const id = (await first.json()).file.id;
  const repeated = await f.upload(session, png, 'a.png', 'image/png', key); assert.equal(repeated.status, 200); assert.equal((await repeated.json()).file.id, id);
  assert.equal((await f.upload(session, Buffer.concat([png, Buffer.from('different')]), 'a.png', 'image/png', key)).status, 409);
  assert.equal((await fetch(f.base + '/api/uploads/' + id, { method: 'DELETE', headers: session.headers })).status, 200);
  assert.equal((await f.upload(session, png, 'a.png', 'image/png', key)).status, 409);
  assert.equal(f.store.db.prepare('SELECT sha256 FROM private_uploads WHERE id=?').get(id).sha256, digest(png));
});

test('expiry during multipart retry and retained-storage capacity reject without changing the original file', async t => {
  const f = await fixture(t), session = await f.issue(), key = randomUUID();
  const original = (await (await f.upload(session, png, 'a.png', 'image/png', key)).json()).file;
  const body = new FormData(); body.append('file', new Blob([png], { type: 'image/png' }), 'a.png');
  const encoded = new Request('http://127.0.0.1', { method: 'POST', body });
  const bytes = Buffer.from(await encoded.arrayBuffer());
  const request = Readable.from((async function* () { f.advance(UPLOAD_LIMITS.ttlMs + 1); yield bytes; })());
  request.headers = { ...session.headers, 'content-type': encoded.headers.get('content-type') };
  await assert.rejects(f.store.uploads.upload(request, key), error => error.code === 'upload_session_required');
  assert.equal(f.store.db.prepare('SELECT sha256 FROM private_uploads WHERE id=?').get(original.id).sha256, digest(png));
  const capacity = await fixture(t), next = await capacity.issue();
  capacity.store.uploads.capacityBytes = UPLOAD_LIMITS.fileBytes;
  const full = Buffer.concat([png, Buffer.alloc(UPLOAD_LIMITS.fileBytes - png.length)]);
  assert.equal((await capacity.upload(next, full, 'full.png')).status, 201);
  const rejected = await capacity.upload(next);
  assert.equal(rejected.status, 503); assert.equal((await rejected.json()).error, 'upload_capacity_reached');
  assert.equal(capacity.store.db.prepare('SELECT COUNT(*) AS count FROM private_uploads').get().count, 1);
});

test('inquiry association commits original metadata and bytes together, deduplicates receipt and never rebinds another inquiry', async t => {
  const f = await fixture(t), session = await f.issue(), second = await f.issue(), uploaded = await f.upload(session), file = (await uploaded.json()).file, key = randomUUID();
  const payload = { ...source(), attachments: [{ id: file.id }] };
  assert.throws(() => validateLead(payload));
  assert.equal((await f.post(second, payload)).status, 409);
  assert.equal((await f.post(session, { ...payload, attachments: [{ ...file }] })).status, 422);
  const originalBind = f.store.uploads.bind.bind(f.store.uploads);
  f.store.uploads.bind = (...args) => { originalBind(...args); throw new UploadError(503, 'synthetic_storage_failure'); };
  assert.equal((await f.post(session, payload, key)).status, 503);
  assert.equal(f.store.list().length, 0); assert.equal(f.store.db.prepare('SELECT state FROM private_uploads WHERE id=?').get(file.id).state, 'ready');
  f.store.uploads.bind = originalBind;
  const response = await f.post(session, payload, key); assert.equal(response.status, 201); const receipt = await response.json();
  assert.equal(JSON.stringify(receipt).includes(file.filename), false); assert.equal(JSON.stringify(receipt).includes(file.id), false);
  assert.deepEqual(f.store.get(receipt.leadId).lead.attachments, [file]); assert.equal((await f.post(session, payload, key)).status, 200);
  assert.equal((await f.post(session, payload)).status, 409);
  assert.equal((await f.post(session, { ...payload, notes: 'Changed' }, key)).status, 409);
  assert.equal((await fetch(f.base + '/api/uploads/' + file.id, { method: 'DELETE', headers: session.headers })).status, 409);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS count FROM inquiries').get().count, 1); assert.equal(f.store.db.prepare('SELECT COUNT(*) AS count FROM notifications').get().count, 1);
});

test('RFQ attachment references validate independent line identity; binding and bytes survive database/server restart', async t => {
  const f = await fixture(t), session = await f.issue(), file = (await (await f.upload(session)).json()).file;
  const items = Array.from({ length: 2 }, () => ({ lineId: 'line-' + randomUUID(), productId: 'fibc-bulk-bags', product: 'FIBC Bulk Bags', specifications: source().specifications, quantity: '1000', quantityUnit: 'pcs' }));
  const payload = { ...source(), type: 'multi-product-rfq', product: 'Multi-product RFQ', productId: '', quantity: '', quantityUnit: '', specifications: '', items, destination: 'Synthetic city', deliveryWindow: '', attachments: [{ id: file.id, lineId: items[1].lineId }] };
  assert.equal((await f.post(session, { ...payload, attachments: [{ id: file.id, lineId: 'line-' + randomUUID() }] })).status, 422);
  const response = await f.post(session, payload); assert.equal(response.status, 201); const id = (await response.json()).leadId;
  const before = f.store.get(id).lead; await f.reopen(); assert.deepEqual(f.store.get(id).lead, before);
  assert.deepEqual(f.store.uploads.content(id, file.id).bytes, png); assert.equal(before.attachments[0].lineId, items[1].lineId);
});

test('private original downloads require admin authentication, exact inquiry binding and valid byte digest; naked URLs reveal nothing', async t => {
  const f = await fixture(t), session = await f.issue(), file = (await (await f.upload(session)).json()).file;
  const id = (await (await f.post(session, { ...source(), attachments: [{ id: file.id }] })).json()).leadId;
  const path = '/api/admin/inquiries/' + id + '/attachments/' + file.id;
  assert.equal((await fetch(f.base + path)).status, 401); assert.equal((await fetch(f.base + path, { headers: session.headers })).status, 401);
  const response = await fetch(f.base + path, { headers: { Authorization: 'Bearer ' + f.config.adminToken } }); assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png); assert.match(response.headers.get('content-disposition'), /^attachment;/); assert.match(response.headers.get('content-security-policy'), /sandbox/);
  assert.equal((await fetch(f.base + path.replace(id, 'DD-' + randomUUID().toUpperCase()), { headers: { Authorization: 'Bearer ' + f.config.adminToken } })).status, 404);
  f.store.db.prepare('UPDATE private_uploads SET data=? WHERE id=?').run(Buffer.from('corrupt'), file.id);
  assert.equal((await fetch(f.base + path, { headers: { Authorization: 'Bearer ' + f.config.adminToken } })).status, 503);
});

test('additive upload migration creates private consistent backup and retains old inquiry, queues and followup history', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dongda-upload-migration-')), path = join(directory, 'inquiries.sqlite'), store = new InquiryStore(path);
  t.after(async () => { store.close(); await rm(directory, { recursive: true, force: true }); });
  const id = store.receive(validateLead(source()), randomUUID()).id; store.followUp(id, { status: 'contacted', owner: 'Synthetic owner', note: 'Existing record', expectedRevision: 0 });
  const before = store.get(id); const uploads = new PrivateUploads(store, { scanner: fakeScanner(), imageInspector: fakeInspector() }, { allowedOrigins: ['https://cn-dongda.com'] });
  assert.deepEqual(store.get(id), before); assert.equal((await stat(uploads.backup)).mode & 0o777, 0o600);
  const copy = new DatabaseSync(uploads.backup, { readOnly: true }); assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(copy.prepare('SELECT id FROM inquiries').get().id, id); assert.equal(copy.prepare('SELECT COUNT(*) AS count FROM followups').get().count, 1); copy.close();
  assert.equal(new PrivateUploads(store, { scanner: fakeScanner(), imageInspector: fakeInspector() }, { allowedOrigins: ['https://cn-dongda.com'] }).backup, undefined);
});

test('unfinished ERP attachment transport is explicitly blocked without outbound requests or leaking names into monitoring', async t => {
  const f = await fixture(t), session = await f.issue(), file = (await (await f.upload(session)).json()).file;
  const id = (await (await f.post(session, { ...source(), attachments: [{ id: file.id }] })).json()).leadId;
  let requests = 0;
  const result = await deliverCrmInquiry(f.store, { crmUrl: 'https://erp.example.test/api/sales/website-inquiries', crmSiteId: 'dongda-website', crmToken: randomBytes(32).toString('hex') }, async () => { requests++; throw new Error('Must not send incomplete contract'); });
  assert.equal(result.reason, 'attachment_transport_pending'); assert.equal(requests, 0); assert.equal(f.store.get(id).crm.status, 'blocked');
  const monitor = JSON.stringify(readMonitoring(f.store, 7, { crmConfigured: true }));
  for (const value of [file.filename, file.id, id, source().email, 'Synthetic Upload Buyer']) assert.equal(monitor.includes(value), false);
});
