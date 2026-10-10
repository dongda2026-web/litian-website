import { createConnection } from 'node:net';
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { UploadError } from './upload-scanner.mjs';

export const IMAGE_POLICY = 'private-image-v1-pillow';
export const IMAGE_DECODER = 'Pillow 12.3.0';
export const IMAGE_SELF_TEST = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c49444154789c63606060000000040001f61738550000000049454e44ae426082', 'hex');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const unavailable = () => new UploadError(503, 'image_inspection_unavailable');
const rejected = new Set(['image_content_not_allowed', 'image_type_not_allowed', 'image_size_not_allowed', 'image_complexity_limit']);

export function validateImageInspection(result, bytes, mimeType) {
  if (!result || typeof result !== 'object' || Array.isArray(result) || Object.keys(result).sort().join(',') !== 'decoder,frames,height,mimeType,ok,policy,sha256,size,width' || result.ok !== true ||
    result.policy !== IMAGE_POLICY || result.decoder !== IMAGE_DECODER || result.mimeType !== mimeType || result.size !== bytes.length || result.sha256 !== digest(bytes) || result.frames !== 1 ||
    ![result.width, result.height].every(value => Number.isSafeInteger(value) && value > 0 && value <= 8192) || result.width * result.height > 16000000) throw unavailable();
  return Object.freeze({ ...result });
}

export class ImageUploadInspector {
  constructor({ socketPath, timeoutMs = 9000 } = {}) {
    if (typeof socketPath !== 'string' || !isAbsolute(socketPath) || socketPath.includes('\0') || Buffer.byteLength(socketPath) > 100 ||
      !Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 15000) throw new TypeError('Image inspection requires a private Unix socket and bounded deadline');
    this.socketPath = socketPath; this.timeoutMs = timeoutMs;
  }

  exchange(job, bytes, mimeType) {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ path: this.socketPath });
      let response = Buffer.alloc(0), settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true; clearTimeout(timer); socket.destroy(); error ? reject(error) : resolve(value);
      };
      const fail = () => finish(unavailable());
      const timer = setTimeout(fail, this.timeoutMs);
      socket.on('error', fail);
      socket.on('close', () => { if (!settled) fail(); });
      socket.on('data', chunk => {
        if (response.length + chunk.length > 1028) { fail(); return; }
        response = Buffer.concat([response, chunk]);
        if (response.length >= 4 && (response.readUInt32BE(0) < 1 || response.readUInt32BE(0) > 1024)) fail();
      });
      socket.on('end', () => {
        if (settled) return;
        try {
          if (response.length < 5 || response.readUInt32BE(0) !== response.length - 4) throw unavailable();
          const result = JSON.parse(response.subarray(4).toString('utf8'));
          if (result?.ok === false && Object.keys(result).sort().join(',') === 'code,ok') {
            if (rejected.has(result.code)) throw new UploadError(422, result.code);
            throw unavailable();
          }
          finish(null, validateImageInspection(result, bytes, mimeType));
        } catch (error) { finish(error instanceof UploadError ? error : unavailable()); }
      });
      socket.once('connect', () => {
        const header = Buffer.from(JSON.stringify(job)), length = Buffer.alloc(4); length.writeUInt32BE(header.length);
        socket.write(length); socket.write(header);
        socket.end(job.kind === 'inspect' ? bytes : undefined);
      });
    });
  }

  async ready() {
    try { return await this.exchange({ kind: 'ready' }, IMAGE_SELF_TEST, 'image/png'); }
    catch { throw unavailable(); }
  }

  inspect(bytes, mimeType) {
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 5 * 1024 * 1024 || !['image/png', 'image/jpeg'].includes(mimeType)) throw new UploadError(422, 'image_type_not_allowed');
    return this.exchange({ kind: 'inspect', size: bytes.length, mimeType }, bytes, mimeType);
  }
}
