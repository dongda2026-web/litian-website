import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { InquiryStore, createInquiryServer } from '../server/inquiry-service.mjs';
import { deliverCrmInquiry } from '../server/crm-delivery.mjs';
import { ClamAvScanner } from '../server/upload-scanner.mjs';
import { ImageUploadInspector, IMAGE_SELF_TEST } from '../server/image-upload-inspector.mjs';

const mainRoot = resolve(process.argv[2] || '../../dongda-main-integration');
if (process.argv.includes('--fixture-main')) {
  const { createApp } = await import(pathToFileURL(join(mainRoot, 'apps/api/dist/app.js')).href);
  const app = createApp(); await app.listen({ host: '127.0.0.1', port: Number(process.env.ATTACHMENT_FIXTURE_PORT || 0) });
  process.stdout.write(JSON.stringify({ event: 'attachment_fixture_ready', port: app.server.address().port }) + '\n');
  process.once('SIGTERM', async () => { await app.close(); process.exit(0); });
} else {
  for (const key of Object.keys(process.env)) if (/^(DATABASE|DONGDA_|PG|WHATSAPP_|SMTP_|DB_SCHEMA)/.test(key)) delete process.env[key];
  const directory = await mkdtemp(join(tmpdir(), 'dongda-attachment-main-'));
  const admin = randomBytes(32).toString('hex'), employee = randomBytes(32).toString('hex'), other = randomBytes(32).toString('hex'), stranger = randomBytes(32).toString('hex'), manager = randomBytes(32).toString('hex'), token = randomBytes(32).toString('hex');
  const org = 'website-attachment-http-qa'; let child, mainPort = 0, website, store;
  const startMain = async () => {
    const processChild = spawn(process.execPath, [fileURLToPath(import.meta.url), mainRoot, '--fixture-main'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env,
      NODE_ENV: 'test', DONGDA_DATA_DIR: join(directory, 'main'), DONGDA_AUTH_REQUIRED: '1', DONGDA_ACCESS_TOKEN: admin,
      DONGDA_WEBSITE_INTAKE_TOKEN: token, DONGDA_WEBSITE_INTAKE_SITE_ID: 'dongda-website', DONGDA_WEBSITE_INTAKE_ORG: org,
      DONGDA_WEBSITE_INTAKE_FOLLOWUP_HOURS: '24', ATTACHMENT_FIXTURE_PORT: String(mainPort) } });
    child = processChild;
    processChild.stderr.on('data', () => {});
    const port = await new Promise((resolve, reject) => {
      let buffer = ''; const timer = setTimeout(() => reject(new Error('Isolated ERP startup timed out')), 30000);
      processChild.once('error', reject); processChild.once('exit', () => { clearTimeout(timer); reject(new Error('Isolated ERP exited before ready')); });
      processChild.stdout.on('data', chunk => {
        buffer += chunk.toString(); let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          try { const row = JSON.parse(line); if (row.event === 'attachment_fixture_ready') { clearTimeout(timer); resolve(row.port); } } catch {}
        }
        if (buffer.length > 8192) buffer = '';
      });
    });
    mainPort = port; return 'http://127.0.0.1:' + port;
  };
  const stopMain = async () => {
    if (!child || child.exitCode !== null) return;
    const running = child; child = null;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { running.kill('SIGKILL'); reject(new Error('Isolated ERP graceful shutdown timed out')); }, 30000);
      running.once('exit', () => { clearTimeout(timer); resolve(); }); running.kill('SIGTERM');
    });
  };
  try {
    const imageInspector = new ImageUploadInspector({ socketPath: process.env.UPLOAD_IMAGE_SOCKET });
    await imageInspector.ready();
    const scanner = new ClamAvScanner(process.env.UPLOAD_AV_SOCKET ? { socketPath: process.env.UPLOAD_AV_SOCKET } : { port: 43310 }); const version = await scanner.version();
    let mainBase = await startMain();
    const seed = async (id, secret, userOrg = org, role = 'operator') => {
      const response = await fetch(mainBase + '/api/security/users', { method: 'POST', headers: { Authorization: 'Bearer ' + admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name: 'Synthetic Sales', role, org: userOrg, token: secret, modules: ['sales'], features: ['sales.workspace'] }) });
      assert.equal(response.status, 200);
    };
    await seed('attachment-http-owner', employee); await seed('attachment-http-stranger', stranger, 'other-attachment-http-org');
    const config = { adminToken: randomBytes(32).toString('hex'), rateSalt: randomBytes(32).toString('hex'), allowedOrigins: ['https://cn-dongda.com'], uploads: { scanner, imageInspector },
      crmUrl: mainBase + '/api/sales/website-inquiries', crmSiteId: 'dongda-website', crmToken: token, crmAllowLoopback: true, crmAttachmentsEnabled: true };
    const openWebsite = async () => {
      store = new InquiryStore(join(directory, 'inquiries.sqlite')); website = createInquiryServer(store, config);
      await new Promise(resolve => website.listen(0, '127.0.0.1', resolve)); return 'http://127.0.0.1:' + website.address().port;
    };
    let base = await openWebsite(); const cases = [];
    const png = IMAGE_SELF_TEST;
    const jpeg = await readFile(new URL('../assets/img/products/cement-valve-bag.jpg', import.meta.url));
    const pdf = await PDFDocument.create(); pdf.addPage([200, 200]); const pdfBytes = Buffer.from(await pdf.save());
    const originals = [{ filename: '需求图.png', mimeType: 'image/png', bytes: png }, { filename: 'reference.jpg', mimeType: 'image/jpeg', bytes: jpeg }, { filename: 'drawing.pdf', mimeType: 'application/pdf', bytes: pdfBytes }];
    const demand = { type: 'quote-calculator', company: 'Synthetic Attachment Buyer', contact: 'Synthetic QA', email: 'qa@example.test', phone: '', product: 'FIBC Bulk Bags', productId: 'fibc-bulk-bags', quantity: '1000', quantityUnit: 'pcs', specifications: { capacity: '1000', sling: '4loop', liner: 'pe', discharge: 'bot', qty: '1000' }, notes: '', language: 'en', page: 'https://cn-dongda.com/#quote/fibc-bulk-bags' };
    for (const kind of ['quote', 'rfq', 'sample']) {
      const issued = await fetch(base + '/api/upload-session', { method: 'POST', headers: { Origin: config.allowedOrigins[0], 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(issued.status, 201);
      const session = await issued.json(), headers = { Origin: config.allowedOrigins[0], Cookie: issued.headers.get('set-cookie').split(';')[0], 'X-Upload-CSRF': session.csrfToken };
      const chosen = kind === 'quote' ? originals : [originals[kind === 'rfq' ? 0 : 1]], files = [];
      for (const original of chosen) {
        const form = new FormData(); form.append('file', new Blob([original.bytes], { type: original.mimeType }), original.filename);
        const uploaded = await fetch(base + '/api/uploads', { method: 'POST', headers: { ...headers, 'Idempotency-Key': randomUUID() }, body: form }); assert.equal(uploaded.status, 201);
        files.push({ ...(await uploaded.json()).file, bytes: original.bytes });
      }
      let payload = { ...demand };
      if (kind === 'rfq') payload = { ...demand, type: 'multi-product-rfq', product: 'Synthetic RFQ', productId: '', quantity: '', quantityUnit: '', specifications: '', destination: 'Synthetic destination', deliveryWindow: '', items: [1000, 2000].map(quantity => ({ lineId: 'line-' + randomUUID(), productId: 'fibc-bulk-bags', product: 'FIBC Bulk Bags', quantity: String(quantity), quantityUnit: 'pcs', specifications: { capacity: '1000', sling: '4loop', liner: 'pe', discharge: 'bot', qty: String(quantity) } })) };
      if (kind === 'sample') payload = { ...demand, type: 'sample-request', quantity: '', quantityUnit: '', specifications: '', sampleRequest: { purpose: 'Synthetic trial', quantity: '2', expectedPurchaseQuantity: '100000', requirements: '', recipientName: 'Synthetic QA', recipientPhone: '+1 555 0100', country: 'Synthetic', city: 'Synthetic', address: 'Synthetic address', postalCode: '', costTermsAcknowledged: true } };
      payload.attachments = files.map(file => ({ id: file.id, ...(kind === 'rfq' ? { lineId: payload.items[1].lineId } : {}) }));
      const response = await fetch(base + '/api/inquiries', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify(payload) }); assert.equal(response.status, 201); const inquiryId = (await response.json()).leadId;
      let ack;
      const lost = await deliverCrmInquiry(store, config, async (url, options) => { const result = await fetch(url, options); assert.equal(result.status, 201); ack = await result.json(); throw new Error('Synthetic lost ACK'); });
      assert.equal(lost.reason, 'delivery_not_confirmed'); assert.ok(ack?.attachments); assert.equal(store.get(inquiryId).crm.status, 'failed');
      store.db.prepare('UPDATE crm_deliveries SET next_at=? WHERE inquiry_id=?').run(Date.now() + 86400000, inquiryId);
      cases.push({ kind, files, inquiryId, ack, source: store.get(inquiryId).lead });
    }
    await new Promise(resolve => website.close(resolve)); website = null; store.close(); store = null;
    await stopMain(); mainBase = await startMain(); assert.equal(config.crmUrl, mainBase + '/api/sales/website-inquiries'); base = await openWebsite();
    for (const row of cases) {
      store.db.prepare('UPDATE crm_deliveries SET next_at=0 WHERE inquiry_id=?').run(row.inquiryId);
      const delivered = await deliverCrmInquiry(store, config); assert.equal(delivered.ok, true); assert.equal(delivered.duplicate, true); assert.equal(delivered.mainLeadId, row.ack.leadId);
      assert.deepEqual(store.get(row.inquiryId).lead, row.source);
    }
    const employeeHeaders = { Authorization: 'Bearer ' + employee, 'X-Dongda-User-Id': 'attachment-http-owner' };
    const workspaceResponse = await fetch(mainBase + '/api/sales', { headers: employeeHeaders }); assert.equal(workspaceResponse.status, 200); const workspace = await workspaceResponse.json();
    assert.equal(workspace.leads.length, 3); assert.equal(workspace.messages.length, 3); assert.equal(workspace.websiteInquiries, undefined);
    await seed('attachment-http-other', other);
    for (const row of cases) {
      const lead = workspace.leads.find(lead => lead.id === row.ack.leadId); assert.equal(lead.ownerId, 'attachment-http-owner'); assert.deepEqual(lead.websiteInquiry.attachments, row.source.attachments);
      assert.equal(lead.quotation, undefined); assert.equal(lead.orderId, undefined);
      if (row.kind === 'rfq') assert.equal(lead.websiteInquiry.attachments[0].lineId, row.source.items[1].lineId);
      for (const original of row.files) {
        const url = mainBase + '/api/sales/leads/' + lead.id + '/attachments/' + original.id;
        const download = await fetch(url, { headers: employeeHeaders }); assert.equal(download.status, 200); const bytes = Buffer.from(await download.arrayBuffer()); assert.deepEqual(bytes, original.bytes);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), original.sha256); assert.match(download.headers.get('content-disposition'), /^attachment;/); assert.match(download.headers.get('cache-control'), /no-store/);
        for (const headers of [{ Authorization: 'Bearer ' + token }, { Authorization: 'Bearer ' + other, 'X-Dongda-User-Id': 'attachment-http-other' }, { Authorization: 'Bearer ' + stranger, 'X-Dongda-User-Id': 'attachment-http-stranger' }]) assert.ok([401, 404].includes((await fetch(url, { headers })).status));
      }
    }
    const moved = cases[0], movedUrl = mainBase + '/api/sales/leads/' + moved.ack.leadId + '/attachments/' + moved.files[0].id;
    const assignment = JSON.stringify({ leadId: moved.ack.leadId, ownerId: 'attachment-http-other' });
    const deniedAssignment = await fetch(mainBase + '/api/sales/inbox/assign', { method: 'POST', headers: { ...employeeHeaders, 'Content-Type': 'application/json' }, body: assignment }); assert.equal(deniedAssignment.status, 403);
    await seed('attachment-http-manager', manager, org, 'admin');
    const assigned = await fetch(mainBase + '/api/sales/inbox/assign', { method: 'POST', headers: { Authorization: 'Bearer ' + manager, 'X-Dongda-User-Id': 'attachment-http-manager', 'Content-Type': 'application/json' }, body: assignment }); assert.equal(assigned.status, 200);
    assert.equal((await fetch(movedUrl, { headers: employeeHeaders })).status, 404);
    assert.equal((await fetch(movedUrl, { headers: { Authorization: 'Bearer ' + other, 'X-Dongda-User-Id': 'attachment-http-other' } })).status, 200);
    const index = JSON.parse(await readFile(join(directory, 'main', 'archive-files.json'), 'utf8')); assert.equal(Object.keys(index).length, 5);
    assert.equal(JSON.stringify(workspace).includes(originals[0].bytes.toString('base64')), false);
    process.stdout.write(JSON.stringify({ event: 'private_attachment_main_http_acceptance', passed: true, environment: 'isolated-local-synthetic', realClamAv: version, contracts: ['v5-quote', 'v5-rfq', 'v5-sample'], originalFormats: ['png', 'jpeg', 'pdf'], bytesAndHashesPreserved: true, separateErpProcessRestart: true, websiteSqliteRestart: true, lostAckRecoveredWithoutDuplicates: true, ownerAndOrganizationDenied: true, reassignmentRevokesOldOwner: true, websiteCredentialCannotRead: true, privateOriginals: 5, leads: 3, messages: 3, publicUiEnabled: false, productionWrites: false }) + '\n');
  } finally {
    if (website) await new Promise(resolve => website.close(resolve)); store?.close(); await stopMain(); await rm(directory, { recursive: true, force: true });
  }
}
