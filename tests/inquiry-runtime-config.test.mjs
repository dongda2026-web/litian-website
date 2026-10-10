import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { inquiryRuntimeConfig } from '../server/inquiry-runtime-config.mjs';
import { ClamAvScanner } from '../server/upload-scanner.mjs';
import { ImageUploadInspector } from '../server/image-upload-inspector.mjs';

// Configuration-only fixtures. Do not open sockets, scanners, HTTP or SQLite.
const base = () => ({ INQUIRY_ADMIN_TOKEN: 'synthetic-admin-fixture-material-0001', INQUIRY_RATE_SALT: 'synthetic-rate-fixture-material-0001',
  ALLOWED_ORIGINS: 'https://website.example.test', DONGDA_CRM_INTAKE_URL: 'https://erp.example.test/api/sales/website-inquiries',
  DONGDA_CRM_SITE_ID: 'synthetic-website', DONGDA_CRM_INTAKE_TOKEN: 'synthetic-service-fixture-material-0001' });
const upload = () => ({ ...base(), INQUIRY_UPLOADS_ENABLED: '1', UPLOAD_AV_SOCKET: '/run/synthetic-private/clamd.sock', UPLOAD_IMAGE_SOCKET: '/run/synthetic-private/image.sock' });

test('absence is default OFF even when CRM and scanner configuration exists', () => {
  const env = upload(); delete env.INQUIRY_UPLOADS_ENABLED;
  const config = inquiryRuntimeConfig(env);
  assert.equal(config.crmAttachmentsEnabled, false); assert.equal(Object.hasOwn(config, 'uploads'), false);
});
test('explicit zero remains OFF and preserves the existing server-only configuration', () => {
  const env = { ...base(), INQUIRY_UPLOADS_ENABLED: '0', DONGDA_CRM_ATTACHMENTS_ENABLED: '0',
    LEADS_WEBHOOK_URL: 'https://gateway.example.test/inquiries', LEADS_WEBHOOK_TOKEN: 'synthetic-notification-fixture', SALES_RECIPIENT: 'synthetic-approved-destination' };
  const config = inquiryRuntimeConfig(env);
  assert.equal(config.crmAttachmentsEnabled, false); assert.equal(Object.hasOwn(config, 'uploads'), false);
  for (const [key, value] of [['adminToken', env.INQUIRY_ADMIN_TOKEN], ['rateSalt', env.INQUIRY_RATE_SALT], ['notificationUrl', env.LEADS_WEBHOOK_URL], ['notificationToken', env.LEADS_WEBHOOK_TOKEN], ['salesRecipient', env.SALES_RECIPIENT], ['crmUrl', env.DONGDA_CRM_INTAKE_URL], ['crmSiteId', env.DONGDA_CRM_SITE_ID], ['crmToken', env.DONGDA_CRM_INTAKE_TOKEN]]) assert.equal(config[key], value);
  assert.deepEqual(config.allowedOrigins, ['https://website.example.test']);
});
test('empty flags are OFF, never truthy enablement', () => {
  const config = inquiryRuntimeConfig({ ...base(), INQUIRY_UPLOADS_ENABLED: '', DONGDA_CRM_ATTACHMENTS_ENABLED: '' });
  assert.equal(config.crmAttachmentsEnabled, false); assert.equal(Object.hasOwn(config, 'uploads'), false);
});
test('noncanonical and nonstring flags reject instead of granting file permission', () => {
  for (const key of ['INQUIRY_UPLOADS_ENABLED', 'DONGDA_CRM_ATTACHMENTS_ENABLED']) {
    for (const value of ['true', 'false', 'yes', '1 ', '2', true, false, 1, null]) assert.throws(() => inquiryRuntimeConfig({ ...base(), [key]: value }), TypeError);
  }
});
test('explicit new-upload enablement wires the real existing Unix scanner and inspector', () => {
  const config = inquiryRuntimeConfig(upload());
  assert.ok(config.uploads.scanner instanceof ClamAvScanner); assert.ok(config.uploads.imageInspector instanceof ImageUploadInspector);
  assert.deepEqual(config.uploads.scanner.connection, { path: '/run/synthetic-private/clamd.sock' });
  assert.equal(config.uploads.imageInspector.socketPath, '/run/synthetic-private/image.sock');
  assert.equal(config.uploads.scanner.timeoutMs, 10000); assert.equal(config.uploads.imageInspector.timeoutMs, 9000);
  assert.equal(config.crmAttachmentsEnabled, false);
});
test('explicit scanner port remains loopback and has no implicit daemon fallback', () => {
  const env = upload(); delete env.UPLOAD_AV_SOCKET; env.UPLOAD_AV_PORT = '43310';
  const config = inquiryRuntimeConfig(env);
  assert.deepEqual(config.uploads.scanner.connection, { host: '127.0.0.1', port: 43310 });
});
test('both explicit gates preserve the v5 transport permission', () => {
  const config = inquiryRuntimeConfig({ ...upload(), DONGDA_CRM_ATTACHMENTS_ENABLED: '1' });
  assert.equal(config.crmAttachmentsEnabled, true); assert.ok(config.uploads.scanner instanceof ClamAvScanner);
});
test('transport may retry retained originals while new upload admission stays OFF', () => {
  const config = inquiryRuntimeConfig({ ...base(), INQUIRY_UPLOADS_ENABLED: '0', DONGDA_CRM_ATTACHMENTS_ENABLED: '1' });
  assert.equal(config.crmAttachmentsEnabled, true); assert.equal(Object.hasOwn(config, 'uploads'), false);
});
test('new upload admission does not silently open CRM attachment transport', () => {
  const config = inquiryRuntimeConfig({ ...upload(), DONGDA_CRM_ATTACHMENTS_ENABLED: '0' });
  assert.ok(config.uploads); assert.equal(config.crmAttachmentsEnabled, false);
});
test('new uploads cannot start with absent or partial ERP configuration', () => {
  for (const key of ['DONGDA_CRM_INTAKE_URL', 'DONGDA_CRM_SITE_ID', 'DONGDA_CRM_INTAKE_TOKEN']) {
    const env = upload(); delete env[key]; assert.throws(() => inquiryRuntimeConfig(env), TypeError);
  }
});
test('transport cannot enable without an actual dedicated ERP target', () => {
  assert.throws(() => inquiryRuntimeConfig({ DONGDA_CRM_ATTACHMENTS_ENABLED: '1' }), TypeError);
});
test('production attachment configuration rejects insecure or non-dedicated CRM URLs', () => {
  for (const value of ['http://erp.example.test/api/sales/website-inquiries', 'http://127.0.0.1:3000/api/sales/website-inquiries', 'https://erp.example.test/api/sales/leads', 'https://erp.example.test/api/sales/website-inquiries?token=synthetic', 'https://user:synthetic@erp.example.test/api/sales/website-inquiries', 'not-a-url']) {
    assert.throws(() => inquiryRuntimeConfig({ ...upload(), DONGDA_CRM_INTAKE_URL: value }), TypeError);
  }
});
test('administrator token reuse cannot become the attachment service credential', () => {
  const env = upload(); env.DONGDA_CRM_INTAKE_TOKEN = env.INQUIRY_ADMIN_TOKEN;
  assert.throws(() => inquiryRuntimeConfig(env), TypeError);
});
test('new uploads require explicit exact HTTPS website origins', () => {
  for (const value of ['', 'http://127.0.0.1:4191', 'https://website.example.test/path', 'https://user:synthetic@website.example.test', 'not-an-origin']) {
    assert.throws(() => inquiryRuntimeConfig({ ...upload(), ALLOWED_ORIGINS: value }), TypeError);
  }
});
test('new upload admission without an explicit scanner endpoint fails closed', () => {
  const env = upload(); delete env.UPLOAD_AV_SOCKET; assert.throws(() => inquiryRuntimeConfig(env), TypeError);
});
test('ambiguous scanner transports fail rather than selecting a hidden endpoint', () => {
  assert.throws(() => inquiryRuntimeConfig({ ...upload(), UPLOAD_AV_PORT: '43310' }), TypeError);
});
test('invalid scanner and image sockets reject before capability issuance', () => {
  for (const key of ['UPLOAD_AV_SOCKET', 'UPLOAD_IMAGE_SOCKET']) {
    for (const value of ['relative.sock', '/run/invalid\0.sock', '/run/' + 'x'.repeat(101), 123, undefined]) {
      assert.throws(() => inquiryRuntimeConfig({ ...upload(), [key]: value }), TypeError);
    }
  }
});
test('malformed scanner ports cannot create remote or unbounded transports', () => {
  for (const value of ['', '0', '65536', '-1', '43310 ', 'https://scanner.example.test', 43310, null]) {
    const env = upload(); delete env.UPLOAD_AV_SOCKET; env.UPLOAD_AV_PORT = value;
    assert.throws(() => inquiryRuntimeConfig(env), TypeError);
  }
});
test('HTTP scanner URL is unsupported and cannot be presented as configured AV', () => {
  assert.throws(() => inquiryRuntimeConfig({ ...upload(), UPLOAD_AV_URL: 'https://scanner.example.test/scan' }), TypeError);
});
test('browser tenant or owner-like configuration is never forwarded into inquiry scope', () => {
  const config = inquiryRuntimeConfig({ ...upload(), DONGDA_CRM_ORG: 'synthetic-other-org', DONGDA_CRM_OWNER: 'synthetic-unknown-owner', tenant: 'synthetic-tenant', ownerId: 'synthetic-owner' });
  for (const key of ['org', 'tenant', 'tenantId', 'owner', 'ownerId', 'crmOrg', 'crmOwner']) assert.equal(Object.hasOwn(config, key), false);
  assert.equal(Object.hasOwn(config, 'localPreview'), false); assert.equal(Object.hasOwn(config, 'crmAllowLoopback'), false);
});
test('the actual startup prefix passes assembled options before any SQLite/server construction', () => {
  const source = readFileSync(new URL('../server/start-inquiry-service.mjs', import.meta.url), 'utf8');
  const boundary = source.indexOf('const store = new InquiryStore('); assert.ok(boundary > 0);
  const prefix = source.slice(0, boundary).replace(/^import .*;\n/gm, '');
  let calls = 0;
  const context = { process: { env: { ...upload(), DONGDA_CRM_ATTACHMENTS_ENABLED: '1' } }, URL,
    inquiryRuntimeConfig: env => { calls += 1; return inquiryRuntimeConfig(env); }, crmConfiguration: config => ({ siteId: config.crmSiteId }) };
  const config = vm.runInNewContext(prefix + '\nconfig;', context);
  assert.equal(calls, 1); assert.equal(config.crmAttachmentsEnabled, true);
  assert.ok(config.uploads.scanner instanceof ClamAvScanner); assert.ok(config.uploads.imageInspector instanceof ImageUploadInspector);
  assert.match(source, /createInquiryServer\(store, config\)/); assert.match(source, /deliverCrmInquiry\(store, config\)/);
});
