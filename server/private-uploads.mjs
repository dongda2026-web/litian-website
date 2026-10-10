import Busboy from 'busboy';
import { fileTypeFromBuffer } from 'file-type';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { backupPrivateDatabase } from './inquiry-monitoring.mjs';
import { equalSecret } from './admin-sessions.mjs';
import { inspectUploadPdf } from './pdf-upload-inspector.mjs';
import { UploadError } from './upload-scanner.mjs';
import { validateImageInspection, IMAGE_SELF_TEST, IMAGE_POLICY } from './image-upload-inspector.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const idPattern = /^UP-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const UPLOAD_LIMITS = Object.freeze({ fileBytes: 5 * 1024 * 1024, files: 3, totalBytes: 10 * 1024 * 1024, ttlMs: 30 * 60 * 1000 });
const formats = { 'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'application/pdf': ['pdf'] };
export const UPLOAD_POLICY = 'private-artwork-v1-static-pdf';
const metadata = row => ({ id: row.id, filename: row.filename, mimeType: row.mime_type, size: row.size_bytes, sha256: row.sha256, scan: JSON.parse(row.scan), validationPolicy: row.validation_policy });
const isImage = row => ['image/png', 'image/jpeg'].includes(row.mime_type);
function checkedImage(row) {
  if (!isImage(row)) return true;
  if (!row.image_policy) return !row.image_inspection && row.state === 'bound';
  if (row.image_policy !== IMAGE_POLICY || !row.image_inspection) return false;
  try {
    const proof = validateImageInspection(JSON.parse(row.image_inspection), Buffer.from(row.data), row.mime_type);
    return proof.sha256 === row.sha256 && proof.size === row.size_bytes;
  } catch { return false; }
}

export function readBoundOriginal(store, inquiryId, id) {
  const row = store.db.prepare("SELECT * FROM private_uploads WHERE id=? AND inquiry_id=? AND state='bound'").get(id, inquiryId);
  if (!row) throw new UploadError(404, 'upload_not_found');
  const bytes = Buffer.from(row.data);
  if (row.validation_policy !== UPLOAD_POLICY || bytes.length !== row.size_bytes || hash(bytes) !== row.sha256 || !checkedImage(row)) throw new UploadError(503, 'attachment_integrity_failed');
  return { file: { ...metadata(row), ...(row.line_id ? { lineId: row.line_id } : {}) }, bytes };
}

export function validateUploadName(filename) {
  if (typeof filename !== 'string' || !filename || filename !== filename.trim() || filename.length > 120 || Buffer.byteLength(filename) > 480 ||
    /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069/\\:<>"]/.test(filename) || filename.startsWith('.') || filename.endsWith('.')) throw new UploadError(422, 'invalid_filename');
  const extension = filename.split('.').at(-1).toLowerCase();
  if (!Object.values(formats).some(values => values.includes(extension))) throw new UploadError(415, 'file_type_not_allowed');
  return extension;
}

export async function readUpload(request) {
  if (!/^multipart\/form-data\s*;/i.test(request.headers['content-type'] || '')) throw new UploadError(415, 'multipart_required');
  const contentLength = request.headers['content-length'];
  if (contentLength !== undefined && (!/^\d+$/.test(contentLength) || Number(contentLength) > UPLOAD_LIMITS.fileBytes + 8192)) throw new UploadError(413, 'file_too_large');
  let parser;
  try { parser = Busboy({ headers: request.headers, defParamCharset: 'utf8', preservePath: true, limits: { fileSize: UPLOAD_LIMITS.fileBytes + 1, files: 1, fields: 0, parts: 2, headerPairs: 50 } }); }
  catch { throw new UploadError(400, 'invalid_upload'); }
  return new Promise((resolve, reject) => {
    let file = null, failure = null, total = 0, settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); request.unpipe(parser);
      request.off('data', count); request.off('aborted', aborted); request.off('error', aborted);
      if (error) { parser.destroy(); request.resume(); reject(error); } else resolve(value);
    };
    const count = chunk => { total += chunk.length; if (total > UPLOAD_LIMITS.fileBytes + 8192) finish(new UploadError(413, 'file_too_large')); };
    const aborted = () => finish(new UploadError(400, 'invalid_upload'));
    const timer = setTimeout(() => finish(new UploadError(408, 'upload_timeout')), 15000);
    parser.on('file', (name, stream, info) => {
      const chunks = []; let size = 0;
      if (name !== 'file' || file) failure = new UploadError(422, 'single_file_required');
      file = { filename: info.filename, mimeType: info.mimeType };
      stream.on('limit', () => { failure = new UploadError(413, 'file_too_large'); });
      stream.on('error', aborted);
      stream.on('data', chunk => { size += chunk.length; if (size <= UPLOAD_LIMITS.fileBytes) chunks.push(chunk); else failure = new UploadError(413, 'file_too_large'); });
      stream.on('end', () => { file.bytes = Buffer.concat(chunks); });
    });
    parser.on('field', () => { failure = new UploadError(422, 'single_file_required'); });
    for (const event of ['partsLimit', 'filesLimit', 'fieldsLimit']) parser.on(event, () => { failure = new UploadError(422, 'single_file_required'); });
    parser.on('error', aborted);
    parser.on('close', () => finish(failure || (!file?.bytes?.length ? new UploadError(422, 'empty_file') : null), file));
    request.on('data', count); request.once('aborted', aborted); request.once('error', aborted); request.pipe(parser);
  });
}

export class PrivateUploads {
  constructor(store, { scanner, imageInspector, now = Date.now, capacityBytes = 200 * 1024 * 1024 }, config) {
    if (!scanner || typeof scanner.scan !== 'function' || typeof scanner.version !== 'function') throw new TypeError('A fail-closed scanner is required');
    if (!imageInspector || typeof imageInspector.inspect !== 'function' || typeof imageInspector.ready !== 'function') throw new TypeError('An isolated fail-closed image inspector is required');
    if (!Number.isSafeInteger(capacityBytes) || capacityBytes < UPLOAD_LIMITS.fileBytes || capacityBytes > 1024 * 1024 * 1024) throw new TypeError('Invalid private upload capacity');
    if (!config.allowedOrigins.every(value => { const url = new URL(value); return url.origin === value && (config.localPreview === true ? url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) : url.protocol === 'https:'); })) throw new TypeError('Uploads require HTTPS or explicit loopback preview');
    this.store = store; this.db = store.db; this.scanner = scanner; this.imageInspector = imageInspector; this.now = now; this.capacityBytes = capacityBytes; this.active = 0;
    this.name = config.localPreview ? 'dd_preview_upload_' + (new URL(config.allowedOrigins[0]).port || '80') : '__Secure-dd_upload';
    this.secure = config.localPreview !== true;
    const installed = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='private_uploads'").get();
    const hasPolicy = installed && this.db.prepare('PRAGMA table_info(private_uploads)').all().some(row => row.name === 'validation_policy');
    const hasInspection = installed && this.db.prepare('PRAGMA table_info(private_uploads)').all().some(row => row.name === 'image_inspection');
    const hasImagePolicy = installed && this.db.prepare('PRAGMA table_info(private_uploads)').all().some(row => row.name === 'image_policy');
    if (!hasPolicy || !hasInspection || !hasImagePolicy) this.backup = backupPrivateDatabase(this.db, store.path, 'pre-a12');
    this.db.exec(`CREATE TABLE IF NOT EXISTS upload_sessions (
      id TEXT PRIMARY KEY, csrf_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS private_uploads (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES upload_sessions(id), upload_key TEXT NOT NULL,
      filename TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL CHECK(size_bytes>0), sha256 TEXT NOT NULL,
      scan TEXT NOT NULL, validation_policy TEXT NOT NULL DEFAULT '', image_inspection TEXT NOT NULL DEFAULT '', image_policy TEXT NOT NULL DEFAULT '', data BLOB NOT NULL, created_at INTEGER NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('ready','bound','retired')),
      inquiry_id TEXT REFERENCES inquiries(id), line_id TEXT NOT NULL DEFAULT '', UNIQUE(session_id,upload_key)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS private_uploads_inquiry_idx ON private_uploads(inquiry_id);
    CREATE INDEX IF NOT EXISTS private_uploads_session_idx ON private_uploads(session_id,state);`);
    if (installed && !hasPolicy) this.db.exec("ALTER TABLE private_uploads ADD COLUMN validation_policy TEXT NOT NULL DEFAULT ''");
    if (installed && !hasInspection) this.db.exec("ALTER TABLE private_uploads ADD COLUMN image_inspection TEXT NOT NULL DEFAULT ''");
    if (installed && !hasImagePolicy) this.db.exec("ALTER TABLE private_uploads ADD COLUMN image_policy TEXT NOT NULL DEFAULT ''");
  }

  async issue() {
    validateImageInspection(await this.imageInspector.ready(), IMAGE_SELF_TEST, 'image/png');
    await this.scanner.version();
    if (this.db.prepare('SELECT COUNT(*) AS count FROM upload_sessions').get().count >= 10000) throw new UploadError(503, 'upload_capacity_reached');
    const token = randomBytes(32).toString('hex'), csrfToken = randomBytes(32).toString('hex'), expiresAt = this.now() + UPLOAD_LIMITS.ttlMs;
    this.db.prepare('INSERT INTO upload_sessions(id,csrf_hash,expires_at,created_at) VALUES(?,?,?,?)').run(hash(token), hash(csrfToken), expiresAt, this.now());
    return { csrfToken, expiresAt, cookie: `${this.name}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${UPLOAD_LIMITS.ttlMs / 1000}${this.secure ? '; Secure' : ''}` };
  }

  session(request, csrf = false) {
    const values = (request.headers.cookie || '').split(';').map(value => value.trim()).filter(value => value.startsWith(this.name + '='));
    const token = values.length === 1 ? values[0].slice(this.name.length + 1) : '';
    const row = /^[a-f0-9]{64}$/.test(token) ? this.db.prepare('SELECT * FROM upload_sessions WHERE id=?').get(hash(token)) : null;
    if (!row || row.expires_at <= this.now()) throw new UploadError(401, 'upload_session_required');
    if (csrf && (typeof request.headers['x-upload-csrf'] !== 'string' || !/^[a-f0-9]{64}$/.test(request.headers['x-upload-csrf']) || !equalSecret(hash(request.headers['x-upload-csrf']), row.csrf_hash))) throw new UploadError(403, 'upload_csrf_required');
    return row;
  }

  async upload(request, key) {
    const session = this.session(request, true);
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(key)) throw new UploadError(422, 'upload_key_required');
    if (this.active >= 2) throw new UploadError(503, 'upload_busy');
    this.active++;
    try {
      const file = await readUpload(request), extension = validateUploadName(file.filename);
      let detected; try { detected = await fileTypeFromBuffer(file.bytes); } catch { throw new UploadError(415, 'file_type_not_allowed'); }
      if (!detected || !formats[detected.mime]?.includes(extension) || file.mimeType !== detected.mime) throw new UploadError(415, 'file_type_not_allowed');
      this.session(request, true);
      const digest = hash(file.bytes);
      const existing = this.db.prepare('SELECT * FROM private_uploads WHERE session_id=? AND upload_key=?').get(session.id, key);
      if (existing) {
        if (existing.validation_policy !== UPLOAD_POLICY || existing.state === 'retired' || existing.sha256 !== digest || existing.filename !== file.filename || existing.mime_type !== detected.mime || !checkedImage(existing)) throw new UploadError(409, 'upload_conflict');
        return { file: metadata(existing), duplicate: true };
      }
      const inspection = detected.mime === 'application/pdf' ? null : validateImageInspection(await this.imageInspector.inspect(file.bytes, detected.mime), file.bytes, detected.mime);
      if (detected.mime === 'application/pdf') await inspectUploadPdf(file.bytes);
      this.session(request, true);
      const scan = await this.scanner.scan(file.bytes);
      if (!scan || Object.keys(scan).sort().join(',') !== 'engine,scannedAt,signatureDate,signatureVersion' || !/^ClamAV [\w.-]{3,40}$/.test(scan.engine) || !/^\d{1,12}$/.test(scan.signatureVersion) ||
        !Number.isFinite(Date.parse(scan.signatureDate)) || !Number.isFinite(Date.parse(scan.scannedAt)) || this.now() - Date.parse(scan.signatureDate) > 48 * 3600000 ||
        Date.parse(scan.signatureDate) - this.now() > 300000 || this.now() - Date.parse(scan.scannedAt) > 30000 || Date.parse(scan.scannedAt) - this.now() > 300000) throw new UploadError(503, 'scanner_unavailable');
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.session(request, true);
        const repeat = this.db.prepare('SELECT * FROM private_uploads WHERE session_id=? AND upload_key=?').get(session.id, key);
        if (repeat) {
          if (repeat.validation_policy !== UPLOAD_POLICY || repeat.state === 'retired' || repeat.sha256 !== digest || repeat.filename !== file.filename || repeat.mime_type !== detected.mime || !checkedImage(repeat)) throw new UploadError(409, 'upload_conflict');
          this.db.exec('COMMIT'); return { file: metadata(repeat), duplicate: true };
        }
        const quota = this.db.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(size_bytes),0) AS bytes FROM private_uploads WHERE session_id=? AND state != 'retired'").get(session.id);
        const total = this.db.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(size_bytes),0) AS bytes FROM private_uploads').get();
        if (quota.count >= UPLOAD_LIMITS.files || quota.bytes + file.bytes.length > UPLOAD_LIMITS.totalBytes) throw new UploadError(413, 'upload_quota_exceeded');
        if (total.count >= 10000 || total.bytes + file.bytes.length > this.capacityBytes) throw new UploadError(503, 'upload_capacity_reached');
        const id = 'UP-' + randomUUID();
        this.db.prepare("INSERT INTO private_uploads(id,session_id,upload_key,filename,mime_type,size_bytes,sha256,scan,validation_policy,image_inspection,image_policy,data,created_at,state) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'ready')")
          .run(id, session.id, key, file.filename, detected.mime, file.bytes.length, digest, JSON.stringify(scan), UPLOAD_POLICY, inspection ? JSON.stringify(inspection) : '', inspection ? IMAGE_POLICY : '', file.bytes, this.now());
        this.db.exec('COMMIT'); return { file: { id, filename: file.filename, mimeType: detected.mime, size: file.bytes.length, sha256: digest, scan, validationPolicy: UPLOAD_POLICY }, duplicate: false };
      } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    } finally { this.active--; }
  }

  status(request, id) {
    const session = this.session(request);
    const row = this.db.prepare("SELECT * FROM private_uploads WHERE id=? AND session_id=? AND state!='retired'").get(id, session.id);
    if (!row) throw new UploadError(404, 'upload_not_found');
    return { file: metadata(row), state: row.state };
  }

  retire(request, id) {
    const session = this.session(request, true);
    const row = this.db.prepare('SELECT state FROM private_uploads WHERE id=? AND session_id=?').get(id, session.id);
    if (!row) throw new UploadError(404, 'upload_not_found');
    if (row.state === 'bound') throw new UploadError(409, 'upload_already_bound');
    this.db.prepare("UPDATE private_uploads SET state='retired' WHERE id=? AND session_id=?").run(id, session.id);
  }

  prepare(request, references, lead, expectedInquiryId = '') {
    const session = this.session(request, true);
    if (!Array.isArray(references) || references.length < 1 || references.length > UPLOAD_LIMITS.files || !['quote-calculator', 'multi-product-rfq', 'sample-request'].includes(lead.type)) throw new UploadError(422, 'invalid_attachments');
    const seen = new Set();
    return { sessionId: session.id, files: references.map(reference => {
      if (!reference || typeof reference !== 'object' || Array.isArray(reference) || Object.keys(reference).some(key => !['id', 'lineId'].includes(key)) || !idPattern.test(reference.id || '') || seen.has(reference.id)) throw new UploadError(422, 'invalid_attachments');
      seen.add(reference.id);
      const lineId = reference.lineId ?? '';
      if (typeof lineId !== 'string' || lineId && (lead.type !== 'multi-product-rfq' || !lead.items.some(item => item.lineId === lineId))) throw new UploadError(422, 'invalid_attachment_line');
      const row = this.db.prepare("SELECT * FROM private_uploads WHERE id=? AND session_id=? AND state!='retired'").get(reference.id, session.id);
      if (!row || row.validation_policy !== UPLOAD_POLICY || !checkedImage(row) || row.inquiry_id && (row.inquiry_id !== expectedInquiryId || row.line_id !== lineId)) throw new UploadError(409, 'attachment_not_available');
      return { ...metadata(row), ...(lineId ? { lineId } : {}) };
    }) };
  }

  bind(files, sessionId, inquiryId) {
    if (!this.db.isTransaction || !sessionId) throw new UploadError(409, 'attachment_transaction_required');
    for (const file of files) {
      const row = this.db.prepare("SELECT * FROM private_uploads WHERE id=? AND session_id=? AND state='ready'").get(file.id, sessionId);
      if (!row || !checkedImage(row)) throw new UploadError(409, 'attachment_not_available');
      const result = this.db.prepare("UPDATE private_uploads SET state='bound',inquiry_id=?,line_id=? WHERE id=? AND session_id=? AND state='ready' AND sha256=? AND validation_policy=?")
        .run(inquiryId, file.lineId || '', file.id, sessionId, file.sha256, UPLOAD_POLICY);
      if (result.changes !== 1) throw new UploadError(409, 'attachment_not_available');
    }
  }

  content(inquiryId, id) {
    const { file, bytes } = readBoundOriginal(this.store, inquiryId, id);
    const extension = formats[file.mimeType]?.[0];
    if (!extension) throw new UploadError(503, 'attachment_integrity_failed');
    const encoded = encodeURIComponent(file.filename).replace(/['()*]/g, value => '%' + value.charCodeAt(0).toString(16).toUpperCase());
    return { bytes, mimeType: file.mimeType, disposition: `attachment; filename="artwork.${extension}"; filename*=UTF-8''${encoded}` };
  }
}
