import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { InquiryStore, createInquiryServer } from '../server/inquiry-service.mjs';
import { staticPreview } from '../server/static-preview.mjs';

const port = Number(process.env.PORT || 4191);
const root = resolve('dist/client');
const store = new InquiryStore(resolve('var/preview-inquiries.sqlite'));
const api = createInquiryServer(store, {
  adminToken: process.env.INQUIRY_ADMIN_TOKEN || randomBytes(32).toString('hex'),
  rateSalt: randomBytes(32).toString('hex'),
  localPreview: true,
  allowedOrigins: [`http://127.0.0.1:${port}`, `http://localhost:${port}`]
});
const serve = staticPreview(root, html => html.replace('<script src="assets/js/procurement-core.js">', '<script>window.DONGDA_INQUIRY_ENDPOINT="/api/inquiries";</script><script src="assets/js/procurement-core.js">'));
const server = createServer(async (request, response) => {
  if (request.url.startsWith('/api/') || /^\/admin(?:\/|\?|$)/.test(request.url)) { api.emit('request', request, response); return; }
  await serve(request, response);
});
server.listen(port, '127.0.0.1', () => process.stdout.write(`Procurement preview: http://127.0.0.1:${port}/ (local database only; notifications disabled)\n`));
function close() { server.close(() => { store.close(); }); }
process.once('SIGINT', close);
process.once('SIGTERM', close);
