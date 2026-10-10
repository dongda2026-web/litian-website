import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { InquiryStore, createInquiryServer, validateLead, deliverNotification } from '../server/inquiry-service.mjs';
import { deliverCrmInquiry } from '../server/crm-delivery.mjs';
import { recordIntakeRequest } from '../server/inquiry-monitoring.mjs';

// Local synthetic fixture. All gateway/ERP acknowledgements below are mocks, not external delivery.
const directory = await mkdtemp(join(tmpdir(), 'dongda-monitor-browser-')), store = new InquiryStore(join(directory, 'inquiries.sqlite'));
const port = Number(process.env.PORT || 4195);
const empty = process.env.MONITOR_FIXTURE_EMPTY === '1';
const config = { localPreview: true, adminToken: randomBytes(32).toString('hex'), rateSalt: randomBytes(32).toString('hex'),
  allowedOrigins: [`http://127.0.0.1:${port}`, `http://localhost:${port}`], notificationUrl: 'https://synthetic.example.test', salesRecipient: 'qa@example.test' };
const crmConfig = { crmUrl: 'https://erp.example.test/api/sales/website-inquiries', crmSiteId: 'synthetic-site', crmToken: randomBytes(32).toString('hex') };
for (let index = 0; index < (empty ? 0 : 8); index++) {
  const id = store.receive(validateLead({ type: 'inquiry', company: 'Synthetic Monitoring Buyer ' + (index + 1), contact: 'Synthetic QA', email: 'qa@example.test', product: 'FIBC', quantity: '1000 pcs', language: 'en' }), randomUUID()).id;
  const received = new Date(Date.now() - index * 86400000 - 1800000).toISOString();
  store.db.prepare('UPDATE inquiries SET received_at = ? WHERE id = ?').run(received, id);
  recordIntakeRequest(store,201,'',25,Date.parse(received));
  if (index === 0) {
    await deliverNotification(store,config,async () => { throw new Error('Synthetic failure'); }); store.retry(id);
    await deliverNotification(store,config,async () => new Response('{"accepted":true}'));
    await deliverCrmInquiry(store,crmConfig,async (_,options) => new Response(JSON.stringify({ok:true,persisted:true,siteId:crmConfig.crmSiteId,sourceInquiryId:JSON.parse(options.body).sourceInquiryId,leadId:'sale-'+randomUUID(),duplicate:false}),{status:201}));
  }
  if (index === 1) store.followUp(id,{status:'contacted',owner:'Synthetic Sales',note:'Synthetic stage update',expectedRevision:0});
}
if (!empty) {
  recordIntakeRequest(store,422,'validation_failed',12); recordIntakeRequest(store,200,'',7);
  store.db.prepare("UPDATE notifications SET status = 'accepted', accepted_at = '' WHERE inquiry_id = (SELECT id FROM inquiries ORDER BY received_at LIMIT 1)").run();
}
const server = createInquiryServer(store,config);
const originalGet = store.db.prepare.bind(store.db);
let monitoringUnavailable = false;
store.db.prepare = (...args) => {
  if (monitoringUnavailable && args[0].includes('SELECT started_at FROM monitor_meta')) throw new Error('Synthetic monitoring read failure');
  return originalGet(...args);
};
process.on('SIGUSR1',() => { monitoringUnavailable = !monitoringUnavailable; process.stdout.write('Synthetic monitor failure=' + monitoringUnavailable + '\n'); });
server.listen(port,'127.0.0.1',() => process.stdout.write(`Synthetic monitoring fixture: http://127.0.0.1:${port}/admin (${empty ? 0 : 8} synthetic records; mocked external channels; SIGUSR1 toggles read failure)\n`));
async function close() { await new Promise(resolve => server.close(resolve)); store.close(); await rm(directory,{recursive:true,force:true}); }
process.once('SIGINT',close); process.once('SIGTERM',close);
