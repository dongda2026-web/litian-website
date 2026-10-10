import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { InquiryStore, createInquiryServer } from '../server/inquiry-service.mjs';
import { deliverCrmInquiry } from '../server/crm-delivery.mjs';
import { readMonitoring } from '../server/inquiry-monitoring.mjs';

// Isolated synthetic data only; never inherit a deployment environment or its database.
for (const key of Object.keys(process.env)) if (/^(DATABASE|DONGDA_|PG|WHATSAPP_|SMTP_)/.test(key)) delete process.env[key];
const directory = await mkdtemp(join(tmpdir(), 'dongda-website-main-'));
const rfq = process.argv.includes('--rfq');
const sample = process.argv.includes('--sample');
const customization=process.argv.includes('--customization');
if ((rfq && sample) || (customization && sample)) throw new Error('Select one integration contract');
const mainRoot = resolve(process.argv.slice(2).find(arg => !arg.startsWith('--')) || '../../dongda-main-integration');
const admin = randomBytes(32).toString('hex'), employee = randomBytes(32).toString('hex'), token = randomBytes(32).toString('hex');
Object.assign(process.env, { DONGDA_DATA_DIR: join(directory, 'main'), DONGDA_AUTH_REQUIRED: '1', DONGDA_ACCESS_TOKEN: admin,
  DONGDA_WEBSITE_INTAKE_TOKEN: token, DONGDA_WEBSITE_INTAKE_SITE_ID: 'dongda-website', DONGDA_WEBSITE_INTAKE_ORG: 'website-http-qa', DONGDA_WEBSITE_INTAKE_FOLLOWUP_HOURS: '24' });
let main, website, store;
try {
  const { createApp } = await import(pathToFileURL(join(mainRoot, 'apps/api/dist/app.js')).href);
  main = createApp(); await main.listen({ host: '127.0.0.1', port: 0 });
  const mainBase = `http://127.0.0.1:${main.server.address().port}`;
  const seeded = await fetch(mainBase + '/api/security/users', { method: 'POST', headers: { Authorization: 'Bearer ' + admin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'website-http-sales', name: 'Synthetic Sales', role: 'operator', org: 'website-http-qa', token: employee, modules: ['sales'], features: ['sales.workspace'] }) });
  assert.equal(seeded.status, 200, await seeded.text());
  store = new InquiryStore(join(directory, 'inquiries.sqlite'));
  const config = { adminToken: randomBytes(32).toString('hex'), rateSalt: randomBytes(32).toString('hex'), allowedOrigins: ['https://cn-dongda.com'],
    crmUrl: mainBase + '/api/sales/website-inquiries', crmSiteId: 'dongda-website', crmToken: token, crmAllowLoopback: true };
  website = createInquiryServer(store, config); await new Promise(resolve => website.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${website.address().port}`, requestKey = randomBytes(16).toString('hex');
  let payload = { type: 'quote-calculator', company: 'Synthetic HTTP Buyer', contact: 'Synthetic QA', email: 'qa@example.test', phone: '+1 555 0101', product: 'FIBC', productId: 'fibc-bulk-bags',
    quantity: '1000', quantityUnit: 'pcs', specifications: { capacity: '1000', sling: '4loop', liner: 'pe', discharge: 'bot', qty: '1000' }, notes: 'Synthetic integrated request', language: 'en', page: 'https://cn-dongda.com/#inquiry' };
  if (rfq) payload = { ...payload, type: 'multi-product-rfq', product: 'Synthetic multi-product RFQ', productId: '', quantity: '', quantityUnit: '', specifications: '',
    destination: 'Synthetic destination', deliveryWindow: 'Subject to confirmation', items: [
      { lineId: 'line-' + randomUUID(), productId: 'fibc-bulk-bags', product: 'FIBC Bulk Bags', quantity: '1000', quantityUnit: 'pcs', specifications: { capacity: '1000', sling: '4loop', liner: 'pe', discharge: 'bot', qty: '1000' } },
      { lineId: 'line-' + randomUUID(), productId: 'valve-bags', product: 'Valve Bags', quantity: '5000', quantityUnit: 'pcs', specifications: { size: 'm', valve: 'heat', layer: '3', qty: '5000' } }
    ] };
  if (sample) payload = { ...payload,type:'sample-request',quantity:'',quantityUnit:'',specifications:'',sampleRequest:{purpose:'Synthetic material trial',quantity:'2',expectedPurchaseQuantity:'100000',requirements:'Synthetic sample specification',recipientName:'Synthetic Recipient',recipientPhone:'+1 555 0100',country:'Synthetic country',city:'Synthetic city',address:'Synthetic address',postalCode:'01000',costTermsAcknowledged:true} };
  if(customization) {
    const requested={...globalThis.DongDaCustomization.defaults,length:'900.25',width:'900',height:'1100',material:'Synthetic custom PP',printing:'multi-color',printColors:'2',loadKg:'1000',notes:'Synthetic private custom design',technicalAdvice:true};
    if(rfq)payload.items=payload.items.map((item,index)=>({...item,customization:{...requested,length:index?'500':'900.25',notes:'Synthetic line '+index}}));
    else payload.customization=requested;
  }
  const receive = () => fetch(base + '/api/inquiries', { method: 'POST', headers: { Origin: config.allowedOrigins[0], 'Content-Type': 'application/json', 'Idempotency-Key': requestKey }, body: JSON.stringify(payload) });
  const reception = await receive(); assert.equal(reception.status, 201); const receipt = await reception.json();
  // Lose the real HTTP acknowledgement after the main-system commit. Retry must recover the same lead.
  let firstAck;
  const lost = await deliverCrmInquiry(store, config, async (url, options) => {
    const response = await fetch(url, options); assert.equal(response.status, 201); firstAck = await response.json(); throw new Error('Synthetic lost response');
  });
  assert.equal(lost.ok, false); assert.equal(store.get(receipt.leadId).crm.status, 'failed');
  store.retryCrm(receipt.leadId);
  const recovered = await deliverCrmInquiry(store, config); assert.equal(recovered.ok, true); assert.equal(recovered.duplicate, true); assert.equal(recovered.mainLeadId, firstAck.leadId);
  const sales = await fetch(mainBase + '/api/sales', { headers: { Authorization: 'Bearer ' + employee, 'X-Dongda-User-Id': 'website-http-sales' } });
  assert.equal(sales.status, 200); const workspace = await sales.json(); assert.equal(workspace.leads.length, 1); assert.equal(workspace.messages.length, 1);
  assert.equal(workspace.leads[0].ownerId, 'website-http-sales'); assert.equal(workspace.leads[0].quantity, rfq || sample ? '' : '1000'); assert.equal(workspace.leads[0].quotation, undefined);
  let sampleReview;
  if (sample) {
    const lead = workspace.leads[0];
    assert.deepEqual(lead.websiteInquiry.sampleRequest,payload.sampleRequest);assert.equal(lead.sampleReview.status,'pending');
    const review = await fetch(mainBase + '/api/sales/leads/' + lead.id + '/sample-review',{method:'POST',headers:{Authorization:'Bearer '+employee,'X-Dongda-User-Id':'website-http-sales','Content-Type':'application/json'},body:JSON.stringify({revision:lead.revision,status:'confirmed',note:'Synthetic cost and freight confirmation'})});
    assert.equal(review.status,200);sampleReview=(await review.json()).lead.sampleReview;
    assert.equal(sampleReview.status,'confirmed');assert.equal(sampleReview.actorId,'website-http-sales');
    const denied = await fetch(mainBase + '/api/sales/leads/' + lead.id + '/sample-review',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({revision:lead.revision,status:'dispatched',note:'injected'})});assert.equal(denied.status,401);
    const stale = await fetch(mainBase + '/api/sales/leads/' + lead.id + '/sample-review',{method:'POST',headers:{Authorization:'Bearer '+employee,'X-Dongda-User-Id':'website-http-sales','Content-Type':'application/json'},body:JSON.stringify({revision:lead.revision,status:'dispatched',note:'Synthetic stale write'})});assert.equal(stale.status,409);
  }
  if (rfq) {
    assert.deepEqual(workspace.leads[0].websiteInquiry.items, payload.items);
    assert.equal(workspace.leads[0].websiteInquiry.destination, payload.destination);
    assert.equal(workspace.leads[0].websiteInquiry.deliveryWindow, payload.deliveryWindow);
    for (const item of payload.items) { assert.ok(workspace.messages[0].content.includes(item.lineId)); assert.ok(workspace.messages[0].content.includes(item.quantity + ' pcs')); }
  }
  if(customization && !rfq)assert.deepEqual(workspace.leads[0].websiteInquiry.customization,payload.customization);
  assert.equal(workspace.leads[0].websiteInquiry.sourceInquiryId, receipt.leadId); assert.equal(workspace.messages[0].origin, 'website');
  assert.equal(workspace.websiteInquiries, undefined);
  const inbox = await (await fetch(mainBase + '/api/sales/inbox', { headers: { Authorization: 'Bearer ' + employee, 'X-Dongda-User-Id': 'website-http-sales' } })).json();
  assert.equal(inbox.conversations.length, 1);
  assert.equal((await receive()).status, 200); assert.equal((await deliverCrmInquiry(store, config)).reason, 'no_pending_inquiry');
  const inquiry = await (await fetch(base + '/api/admin/inquiries/' + receipt.leadId, { headers: { Authorization: 'Bearer ' + config.adminToken } })).json();
  assert.equal(inquiry.inquiry.crm.status, 'synced'); assert.equal(inquiry.inquiry.crm.mainLeadId, workspace.leads[0].id); assert.deepEqual(inquiry.inquiry.lead, payload);
  assert.equal((await fetch(mainBase + '/api/config', { headers: { Authorization: 'Bearer ' + token } })).status, 401);
  const monitoringResponse = await fetch(base + '/api/admin/monitoring?days=7', { headers: { Authorization: 'Bearer ' + config.adminToken } });
  assert.equal(monitoringResponse.status, 200);
  const monitoring = (await monitoringResponse.json()).monitoring;
  assert.deepEqual(monitoring.totals, { received: 1, crmSaved: 1, gatewayAccepted: 0, failedAttempts: 1 });
  assert.equal(monitoring.requests.count, 2); assert.equal(monitoring.queues.crm.counts.synced, 1);
  for (const secret of [payload.email, payload.company, token, employee, receipt.leadId, firstAck.leadId]) assert.equal(JSON.stringify(monitoring).includes(secret), false);
  await new Promise(resolve => website.close(resolve)); website = null; store.close(); store = new InquiryStore(join(directory, 'inquiries.sqlite'));
  assert.equal(store.get(receipt.leadId).crm.status, 'synced'); assert.equal(store.get(receipt.leadId).crm.mainLeadId, firstAck.leadId);
  assert.deepEqual(readMonitoring(store).totals, monitoring.totals);
  await main.close(); main = createApp(); await main.listen({ host: '127.0.0.1', port: Number(new URL(mainBase).port) });
  const reopenedSales = await fetch(mainBase + '/api/sales', { headers: { Authorization: 'Bearer ' + employee, 'X-Dongda-User-Id': 'website-http-sales' } });
  assert.equal(reopenedSales.status, 200); const reopenedWorkspace = await reopenedSales.json();
  assert.equal(reopenedWorkspace.leads.length, 1); assert.equal(reopenedWorkspace.leads[0].id, firstAck.leadId); assert.equal(reopenedWorkspace.messages.length, 1);
  if (rfq) assert.deepEqual(reopenedWorkspace.leads[0].websiteInquiry.items, payload.items);
  if(customization && !rfq)assert.deepEqual(reopenedWorkspace.leads[0].websiteInquiry.customization,payload.customization);
  if (sample) {assert.deepEqual(reopenedWorkspace.leads[0].websiteInquiry.sampleRequest,payload.sampleRequest);assert.deepEqual(reopenedWorkspace.leads[0].sampleReview,sampleReview);assert.equal(reopenedWorkspace.leads[0].stage,'new');assert.equal(reopenedWorkspace.leads[0].orderId,undefined);}
  process.stdout.write(JSON.stringify({ event: 'website_main_http_acceptance', passed: true, environment: 'isolated-local-synthetic',
    schema: customization ? '2026.10.08-v4' : sample ? '2026.10.08-v3' : rfq ? '2026.10.08-v2' : '2026.10.08-v1', structuredCustomization:customization, customizationRestartReadback:customization, multiProductRfq: rfq, allItemsPreserved: rfq, structuredSampleRequest:sample, staffSampleReview:sample, sampleReviewRestartReadback:sample,
    publicReception: true, mainSavedReadback: true, inboxReadback: true, assignedOwner: true, lostResponseDeduplicated: true,
    originalPayloadPreserved: true, sqliteRestartReadback: true, mainHttpRestartReadback: true, serviceCredentialRestricted: true,
    privateMonitoringReadback: true, monitoringRestartReadback: true, duplicateNotConversion: true, monitoringNoIdentity: true, liveWrites: false }) + '\n');
} finally {
  if (website) await new Promise(resolve => website.close(resolve));
  if (main) await main.close();
  store?.close(); await rm(directory, { recursive: true, force: true });
}
