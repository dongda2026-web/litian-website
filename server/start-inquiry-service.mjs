import { InquiryStore, createInquiryServer, deliverNotification } from './inquiry-service.mjs';
import { crmConfiguration, deliverCrmInquiry } from './crm-delivery.mjs';
import { inquiryRuntimeConfig } from './inquiry-runtime-config.mjs';

const config = inquiryRuntimeConfig(process.env);
const crmConfigured = Boolean(crmConfiguration(config));
if (config.notificationUrl && new URL(config.notificationUrl).protocol !== 'https:') throw new Error('Notification endpoint must use HTTPS');
const store = new InquiryStore(process.env.INQUIRY_DB_PATH || '');
const server = createInquiryServer(store, config);
const port = Number(process.env.PORT || 4191);
let working = false;
const worker = setInterval(async () => {
  if (working) return;
  working = true;
  try { await deliverCrmInquiry(store, config); await deliverNotification(store, config); }
  catch { process.stderr.write(JSON.stringify({ event: 'inquiry_delivery_worker_failed' }) + '\n'); }
  finally { working = false; }
}, 15000);
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(JSON.stringify({ event: 'inquiry_service_started', host: '127.0.0.1', port, version: '2026.10.08-a12-pre', crmConfigured, notificationConfigured: Boolean(config.notificationUrl && config.salesRecipient) }) + '\n');
});
async function shutdown() {
  clearInterval(worker);
  await new Promise(resolve => server.close(resolve));
  while (working) await new Promise(resolve => setTimeout(resolve, 50));
  store.close();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
