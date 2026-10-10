import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { InquiryStore, createInquiryServer } from '../server/inquiry-service.mjs';
import { ClamAvScanner } from '../server/upload-scanner.mjs';
import { UPLOAD_LIMITS } from '../server/private-uploads.mjs';
import { ImageUploadInspector, IMAGE_SELF_TEST } from '../server/image-upload-inspector.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const scannerOptions = process.env.UPLOAD_AV_SOCKET ? { socketPath: process.env.UPLOAD_AV_SOCKET } : { port: 43310 };
const scanner = new ClamAvScanner(scannerOptions);
const imageInspector = new ImageUploadInspector({ socketPath: process.env.UPLOAD_IMAGE_SOCKET });
await imageInspector.ready();
const version = await scanner.version();
const root = resolve('var/private-uploads-a12'); await mkdir(root, { recursive: true, mode: 0o700 });
const directory = await mkdtemp(join(root, 'acceptance-')), file = join(directory, 'inquiries.sqlite');
const png = IMAGE_SELF_TEST;
const document = await PDFDocument.create(); document.addPage([100, 100]); const pdf = Buffer.from(await document.save());
const jpeg = await readFile(new URL('../assets/img/products/cement-valve-bag.jpg', import.meta.url));
let store = new InquiryStore(file), server, now = Date.now();
const config = { adminToken: randomBytes(32).toString('hex'), rateSalt: randomBytes(32).toString('hex'), localPreview: true,
  allowedOrigins: ['http://127.0.0.1:4197'], uploads: { scanner, imageInspector, now: () => now } };
const base = config.allowedOrigins[0];
async function start() { server = createInquiryServer(store, config); await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4197, '127.0.0.1', resolve); }); }
async function issue() {
  const response = await fetch(base + '/api/upload-session', { method: 'POST', headers: { Origin: base, Connection: 'close', 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(response.status, 201);
  const data = await response.json();
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  return { Origin: base, Connection: 'close', Cookie: response.headers.get('set-cookie').split(';')[0], 'X-Upload-CSRF': data.csrfToken };
}
async function upload(headers, bytes, name, mime = 'image/png', key = randomUUID()) {
  const body = new FormData(); body.append('file', new Blob([bytes], { type: mime }), name);
  return fetch(base + '/api/uploads', { method: 'POST', headers: { ...headers, 'Idempotency-Key': key }, body });
}
async function post(headers, files, key) {
  return fetch(base + '/api/inquiries', { method: 'POST', headers: { ...headers, 'Idempotency-Key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({
    type: 'quote-calculator', company: 'Synthetic Attachment Acceptance', contact: 'Synthetic QA', email: 'attachments@example.test', product: 'FIBC Bulk Bags', productId: 'fibc-bulk-bags',
    quantity: '1000', quantityUnit: 'pcs', specifications: { capacity: '1000', sling: '4loop', liner: 'pe', discharge: 'bot', qty: '1000' }, attachments: files.map(value => ({ id: value.id })) }) });
}

try {
  await start();
  const headers = await issue(), other = await issue(), key = randomUUID();
  const firstResponse = await upload(headers, png, 'Synthetic artwork.png', 'image/png', key); assert.equal(firstResponse.status, 201);
  const first = (await firstResponse.json()).file;
  assert.equal(first.sha256, sha(png)); assert.equal(first.scan.engine, version.engine); assert.equal(first.scan.signatureVersion, version.signatureVersion);
  assert.equal((await upload(headers, png, first.filename, first.mimeType, key)).status, 200);
  const imageCount = store.db.prepare('SELECT COUNT(*) AS count FROM private_uploads').get().count;
  const malformed = await upload(other, Buffer.concat([png, Buffer.from('Synthetic trailing data')]), 'Synthetic trailing.png');
  assert.equal(malformed.status, 422); assert.equal((await malformed.json()).error, 'image_content_not_allowed');
  assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM private_uploads').get().count, imageCount);
  const inspection = store.db.prepare('SELECT image_policy,image_inspection FROM private_uploads WHERE id=?').get(first.id);
  assert.equal(inspection.image_policy, 'private-image-v1-pillow'); assert.equal(JSON.parse(inspection.image_inspection).sha256, first.sha256);
  const pdfResponse = await upload(headers, pdf, 'Synthetic specification.pdf', 'application/pdf'); assert.equal(pdfResponse.status, 201);
  const second = (await pdfResponse.json()).file;
  const jpegResponse = await upload(headers, jpeg, 'Synthetic existing-public-product.jpg', 'image/jpeg'); assert.equal(jpegResponse.status, 201);
  const third = (await jpegResponse.json()).file; assert.equal(third.sha256, sha(jpeg));
  assert.equal((await upload(other, png, 'wrong.pdf', 'application/pdf')).status, 415);
  assert.equal((await upload(other, Buffer.alloc(UPLOAD_LIMITS.fileBytes + 1), 'huge.png')).status, 413);
  const marker = Buffer.from(['X5O!P%@AP[4\\PZX54(P^)7CC)7}', '$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join(''));
  assert.equal(marker.length, 68);
  await assert.rejects(scanner.scan(marker), error => error.code === 'file_rejected');
  const unsafePdf = await PDFDocument.create(); unsafePdf.addPage([100, 100]); await unsafePdf.attach(marker, 'antivirus-test.txt');
  const embedded = Buffer.from(await unsafePdf.save());
  const observe = async bytes => { try { await scanner.scan(bytes); return 'not-detected'; } catch (error) { if (error.code === 'file_rejected') return 'detected'; throw error; } };
  const rawAntivirusObservations = { pngWithAppendedStandardMarker: await observe(Buffer.concat([png, marker])), pdfWithEmbeddedStandardMarker: await observe(embedded) };
  const detection = await upload(other, embedded, 'Synthetic embedded-file test.pdf', 'application/pdf'); assert.equal(detection.status, 422);
  assert.equal((await detection.json()).error, 'file_content_not_allowed');
  assert.equal((await fetch(base + '/api/uploads/' + first.id, { headers: other })).status, 404);
  const inquiryKey = randomUUID(), payload = [first, second, third];
  const response = await post(headers, payload, inquiryKey); assert.equal(response.status, 201); const id = (await response.json()).leadId;
  assert.equal((await post(headers, payload, inquiryKey)).status, 200);
  assert.equal((await post(headers, payload, randomUUID())).status, 409);
  assert.equal(store.get(id).lead.attachments.length, 3);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM inquiries').get().count, 1);
  const downloadPath = '/api/admin/inquiries/' + id + '/attachments/';
  assert.equal((await fetch(base + downloadPath + first.id, { headers: { Connection: 'close' } })).status, 401);
  assert.equal((await fetch(base + downloadPath + first.id, { headers })).status, 401);
  const adminHeaders = { Authorization: 'Bearer ' + config.adminToken, Connection: 'close' };
  const original = await fetch(base + downloadPath + first.id, { headers: adminHeaders }); assert.equal(original.status, 200);
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), png);
  const before = store.get(id).lead;
  await new Promise(resolve => server.close(resolve)); store.close(); store = new InquiryStore(file); await start();
  assert.deepEqual(store.get(id).lead, before);
  for (const [attachment, bytes] of [[first, png], [second, pdf], [third, jpeg]]) {
    const result = await fetch(base + downloadPath + attachment.id, { headers: adminHeaders }); assert.equal(result.status, 200);
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), bytes);
  }
  now += UPLOAD_LIMITS.ttlMs + 1;
  assert.equal((await fetch(base + '/api/uploads/' + first.id, { headers })).status, 401);
  assert.equal((await post(headers, payload, inquiryKey)).status, 401);
  const retained = await fetch(base + downloadPath + first.id, { headers: adminHeaders }); assert.equal(retained.status, 200);
  assert.deepEqual(Buffer.from(await retained.arrayBuffer()), png);
  const failing = new ClamAvScanner({ ...scannerOptions, now: () => Date.now() + 72 * 3600000 });
  await assert.rejects(failing.version(), error => error.code === 'scanner_signatures_stale');
  process.stdout.write(JSON.stringify({ event: 'private_upload_foundation_acceptance', passed: true, environment: 'isolated-local', engine: version.engine,
    signatureVersion: version.signatureVersion, signatureDate: version.signatureDate, cleanPngAndPdf: true, existingPublicJpegAccepted: true, rawAntivirusObservations,
    realStandardAntivirusTestRejected: true, embeddedPdfRejectedByStructuralPolicy: true,
    actualIsolatedImageInspection: true, trailingImageRejectedBeforeStorage: true, privateProofPersisted: true,
    declaredTypeMismatchRejected: true, oversizedRejected: true, crossSessionDenied: true, anonymousByteReadDenied: true, originalBytesHashPreserved: true,
    atomicInquiryBinding: true, sameKeyDeduplicated: true, rebindRejected: true, originalBytesRestartReadback: true, expiredSessionDenied: true,
    retainedBoundOriginalReadable: true, staleSignaturesRejected: true, erpAttachmentTransport: false, publicUploadUi: false, productionWrites: false }) + '\n');
} finally {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  try { store.close(); } catch {}
}
