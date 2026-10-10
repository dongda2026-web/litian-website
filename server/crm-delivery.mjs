import { createHash, randomUUID } from 'node:crypto';
import { finishDelivery, recordWorkerCheck } from './inquiry-monitoring.mjs';
import { readBoundOriginal } from './private-uploads.mjs';

export const CRM_SCHEMA_VERSION = '2026.10.08-v1';
export const CRM_RFQ_SCHEMA_VERSION = '2026.10.08-v2';
export const CRM_SAMPLE_SCHEMA_VERSION = '2026.10.08-v3';
export const CRM_CUSTOMIZATION_SCHEMA_VERSION = '2026.10.08-v4';
export const CRM_ATTACHMENT_SCHEMA_VERSION = '2026.10.08-v5';
export function canonicalPacket(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return JSON.stringify(value);
  if (typeof value !== 'object') throw new TypeError('CRM digest requires JSON data');
  if (Array.isArray(value)) return '[' + value.map(canonicalPacket).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalPacket(value[key])).join(',') + '}';
}
export function crmConfiguration(config) {
  if (![config.crmUrl, config.crmSiteId, config.crmToken].some(Boolean)) return null;
  if (!config.crmUrl || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(config.crmSiteId || '') || !config.crmToken || config.crmToken.length < 32 || config.crmToken === config.adminToken) throw new Error('Dedicated CRM URL, site and service token are required');
  const url = new URL(config.crmUrl);
  const loopback = config.crmAllowLoopback === true && url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname);
  if ((!loopback && (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) || url.username || url.password || url.search || url.hash || url.pathname !== '/api/sales/website-inquiries') throw new Error('CRM requires its dedicated HTTPS intake endpoint');
  return { url: url.href, siteId: config.crmSiteId, token: config.crmToken };
}

export async function readAcknowledgement(response) {
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > 4096) throw new Error('invalid_acknowledgement');
    return text;
  }
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) { await reader.cancel(); throw new Error('invalid_acknowledgement'); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { reader.releaseLock(); }
}

export async function deliverCrmInquiry(store, config, fetchImpl = fetch) {
  const target = crmConfiguration(config);
  if (!target) { recordWorkerCheck(store, 'crm', 'disabled'); return { skipped: true, reason: 'not_configured' }; }
  const now = Date.now(), lease = randomUUID();
  recordWorkerCheck(store, 'crm', 'polling');
  const row = store.db.prepare(`UPDATE crm_deliveries SET status = 'sending', lease_until = ?, lease_token = ?, attempts = attempts + 1
    WHERE inquiry_id = (SELECT inquiry_id FROM crm_deliveries WHERE status IN ('pending', 'failed', 'sending') AND next_at <= ? AND lease_until < ? ORDER BY next_at, inquiry_id LIMIT 1) RETURNING *`).get(now + 30000, lease, now, now);
  if (!row) { recordWorkerCheck(store, 'crm', 'idle'); return { skipped: true, reason: 'no_pending_inquiry' }; }
  const finish = (status, code, nextAt = 0, leadId = '') => finishDelivery(store, 'crm', row.inquiry_id, lease, status, code, nextAt, leadId);
  // Keep identity and destination stable across retries, including a lost response after an ERP commit.
  if (row.site_id && (row.site_id !== target.siteId || row.target_url !== target.url)) {
    finish('blocked', 'configuration_changed'); return { ok: false, id: row.inquiry_id, reason: 'configuration_changed' };
  }
  store.db.prepare('UPDATE crm_deliveries SET site_id = ?, target_url = ? WHERE inquiry_id = ? AND lease_token = ?').run(target.siteId, target.url, row.inquiry_id, lease);
  try {
    const inquiry = store.get(row.inquiry_id);
    const attached = Boolean(inquiry.lead.attachments?.length);
    if (attached && config.crmAttachmentsEnabled !== true) {
      finish('blocked', 'attachment_transport_pending');
      return { ok: false, id: inquiry.id, reason: 'attachment_transport_pending' };
    }
    const customized=Boolean(inquiry.lead.customization || inquiry.lead.items?.some(item=>item.customization));
    const files = attached ? inquiry.lead.attachments.map(file => {
      const saved = readBoundOriginal(store, inquiry.id, file.id);
      if (canonicalPacket(saved.file) !== canonicalPacket(file)) throw new Error('attachment_integrity_failed');
      return { id: file.id, data: saved.bytes.toString('base64') };
    }) : [];
    const packet = { schemaVersion: attached ? CRM_ATTACHMENT_SCHEMA_VERSION : customized ? CRM_CUSTOMIZATION_SCHEMA_VERSION : inquiry.lead.type === 'sample-request' ? CRM_SAMPLE_SCHEMA_VERSION : inquiry.lead.type === 'multi-product-rfq' ? CRM_RFQ_SCHEMA_VERSION : CRM_SCHEMA_VERSION, siteId: target.siteId, sourceInquiryId: inquiry.id, receivedAt: inquiry.receivedAt, payload: inquiry.lead };
    const digest = createHash('sha256').update(canonicalPacket(packet)).digest('hex');
    const response = await fetchImpl(target.url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + target.token, 'Idempotency-Key': inquiry.id }, body: JSON.stringify({ ...packet, digest, ...(attached ? { files } : {}) }) });
    // Bound response parsing. A proxy/provider error must not enter logs or customer-facing state.
    const text = await readAcknowledgement(response);
    let ack; try { ack = JSON.parse(text); } catch { if ([200, 201].includes(response.status)) throw new Error('invalid_acknowledgement'); else ack = {}; }
    if (!ack || typeof ack !== 'object' || Array.isArray(ack)) ack = {};
    if (![200, 201].includes(response.status)) {
      const retryable = [408, 425, 429].includes(response.status) || response.status >= 500 || (response.status === 409 && (ack.code === 'WEBSITE_INTAKE_NO_SALES_OWNER' || ack.message === 'WEBSITE_INTAKE_NO_SALES_OWNER'));
      const reason = 'http_' + response.status;
      const updated = finish(retryable ? 'failed' : 'blocked', reason, retryable ? Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(row.attempts, 7)) : 0);
      return updated.changes ? { ok: false, id: inquiry.id, reason } : { skipped: true, reason: 'lease_expired' };
    }
    if (ack.ok !== true || ack.persisted !== true || ack.siteId !== target.siteId || ack.sourceInquiryId !== inquiry.id || !/^sale-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(ack.leadId || '') || typeof ack.duplicate !== 'boolean') throw new Error('invalid_acknowledgement');
    if (attached) {
      if (!Array.isArray(ack.attachments) || ack.attachments.length !== files.length || ack.attachments.some((file, index) => !file || Object.keys(file).sort().join(',') !== 'id,sha256' || file.id !== inquiry.lead.attachments[index].id || file.sha256 !== inquiry.lead.attachments[index].sha256)) throw new Error('invalid_acknowledgement');
    }
    const updated = finish('synced', '', 0, ack.leadId);
    return updated.changes ? { ok: true, id: inquiry.id, mainLeadId: ack.leadId, duplicate: ack.duplicate } : { skipped: true, reason: 'lease_expired' };
  } catch {
    const updated = finish('failed', 'delivery_not_confirmed', Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(row.attempts, 7)));
    return updated.changes ? { ok: false, id: row.inquiry_id, reason: 'delivery_not_confirmed' } : { skipped: true, reason: 'lease_expired' };
  }
}
