import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { InquiryStore, createInquiryServer, validateLead, deliverNotification } from '../server/inquiry-service.mjs';

// Synthetic browser fixture only. The gateway below never makes an external request.
const directory = await mkdtemp(join(tmpdir(), 'dongda-admin-browser-'));
const store = new InquiryStore(join(directory, 'inquiries.sqlite'));
const port = Number(process.env.PORT || 4193);
const config = {
  adminToken: randomBytes(32).toString('hex'), rateSalt: randomBytes(32).toString('hex'), localPreview: true,
  allowedOrigins: [`http://127.0.0.1:${port}`, `http://localhost:${port}`],
  notificationUrl: 'https://synthetic-gateway.example.test', salesRecipient: 'qa@example.test'
};
let target;
for (let i = 1; i <= 25; i++) {
  const lead = validateLead({ type: 'inquiry', company: i === 25 ? '浏览器验收采购公司 / International Packaging Buyer' : i === 24 ? '<img src=x onerror=alert(1)>' : `Synthetic Buyer ${String(i).padStart(2, '0')}`,
    contact: 'Synthetic Contact', email: 'qa@example.test', product: 'FIBC Bulk Bags', productId: 'fibc', quantity: '1000 pcs', specifications: 'Synthetic specification / 测试规格', notes: '仅供本机浏览器验收，不是真实客户。', language: 'en' });
  const id = store.receive(lead, randomBytes(16).toString('hex')).id;
  if (i === 25) target = id;
}
store.db.prepare("UPDATE notifications SET status = 'accepted' WHERE inquiry_id != ?").run(target);
await deliverNotification(store, config, async () => { throw new Error('synthetic_failure'); });
const server = createInquiryServer(store, config);
server.listen(port, '127.0.0.1', () => process.stdout.write(`Synthetic sales fixture: http://127.0.0.1:${port}/admin (25 synthetic records; no real notifications)\n`));
const worker = setInterval(() => {
  if (store.get(target).notification.status === 'pending') deliverNotification(store, config, async () => {
    if (store.get(target).notification.attempts < 3) throw new Error('synthetic_retry_failure');
    return new Response(JSON.stringify({ accepted: true }));
  }).catch(() => {});
}, 1000);
async function close() { clearInterval(worker); await new Promise(resolve => server.close(resolve)); store.close(); await rm(directory, { recursive: true, force: true }); }
process.once('SIGINT', close); process.once('SIGTERM', close);
