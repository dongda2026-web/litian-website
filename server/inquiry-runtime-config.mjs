import { isAbsolute } from 'node:path';
import { crmConfiguration } from './crm-delivery.mjs';
import { ClamAvScanner } from './upload-scanner.mjs';
import { ImageUploadInspector } from './image-upload-inspector.mjs';

function enabled(value) {
  if (value === undefined || value === '' || value === '0') return false;
  if (value === '1') return true;
  throw new TypeError('Inquiry attachment flags require exactly 0 or 1');
}

function privateSocket(value) {
  return typeof value === 'string' && isAbsolute(value) && !value.includes('\0') && Buffer.byteLength(value) <= 100;
}

// This only assembles configuration. It does not create a database, connect to
// scanners, issue an upload capability, or claim scanner/ERP availability.
export function inquiryRuntimeConfig(env) {
  const uploadsEnabled = enabled(env.INQUIRY_UPLOADS_ENABLED);
  const crmAttachmentsEnabled = enabled(env.DONGDA_CRM_ATTACHMENTS_ENABLED);
  const config = {
    adminToken: env.INQUIRY_ADMIN_TOKEN,
    rateSalt: env.INQUIRY_RATE_SALT,
    allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean),
    notificationUrl: env.LEADS_WEBHOOK_URL,
    notificationToken: env.LEADS_WEBHOOK_TOKEN,
    salesRecipient: env.SALES_RECIPIENT,
    crmUrl: env.DONGDA_CRM_INTAKE_URL,
    crmSiteId: env.DONGDA_CRM_SITE_ID,
    crmToken: env.DONGDA_CRM_INTAKE_TOKEN,
    crmAttachmentsEnabled
  };
  if (!uploadsEnabled && !crmAttachmentsEnabled) return config;
  // An existing service credential alone must not grant attachment permission.
  let target;
  try { target = crmConfiguration(config); }
  catch { throw new TypeError('Attachment intake requires valid dedicated HTTPS CRM configuration'); }
  if (!target) throw new TypeError('Attachment intake requires dedicated HTTPS CRM configuration');
  if (!uploadsEnabled) return config; // Retained bound originals may still retry.
  if (!config.allowedOrigins.length || !config.allowedOrigins.every(value => {
    try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value; }
    catch { return false; }
  })) throw new TypeError('Private uploads require explicit HTTPS origins');
  // Reuse the implemented private socket/loopback transports. No HTTP scanner
  // URL, remote host, implicit daemon, browser org, or owner fallback is added.
  if (env.UPLOAD_AV_URL !== undefined && env.UPLOAD_AV_URL !== '') throw new TypeError('ClamAV requires a private socket or explicit loopback port');
  const socket = env.UPLOAD_AV_SOCKET;
  const port = env.UPLOAD_AV_PORT;
  if (socket && port) throw new TypeError('Specify one ClamAV transport');
  let scanner;
  if (socket) {
    if (!privateSocket(socket)) throw new TypeError('ClamAV requires a private absolute socket');
    scanner = new ClamAvScanner({ socketPath: socket });
  } else {
    if (typeof port !== 'string' || !/^[0-9]{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new TypeError('ClamAV requires an explicit loopback port');
    scanner = new ClamAvScanner({ host: '127.0.0.1', port: Number(port) });
  }
  if (!privateSocket(env.UPLOAD_IMAGE_SOCKET)) throw new TypeError('Image inspection requires a private absolute socket');
  config.uploads = { scanner, imageInspector: new ImageUploadInspector({ socketPath: env.UPLOAD_IMAGE_SOCKET }) };
  return config;
}
