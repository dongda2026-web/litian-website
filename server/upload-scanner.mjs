import { createConnection } from 'node:net';
import { isAbsolute } from 'node:path';

export class UploadError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; this.fields = []; }
}

export class ClamAvScanner {
  constructor({ socketPath, host = '127.0.0.1', port = 3310, timeoutMs = 10000, now = Date.now } = {}) {
    if (socketPath ? !isAbsolute(socketPath) : host !== '127.0.0.1' || !Number.isInteger(port) || port < 1 || port > 65535) throw new TypeError('ClamAV must use a local Unix socket or loopback port');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 30000) throw new TypeError('Invalid scanner deadline');
    this.connection = socketPath ? { path: socketPath } : { host, port };
    this.timeoutMs = timeoutMs;
    this.now = now;
  }

  exchange(command, bytes) {
    return new Promise((resolve, reject) => {
      const socket = createConnection(this.connection), chunks = [];
      let size = 0, settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true; clearTimeout(timer); socket.destroy();
        error ? reject(error) : resolve(value);
      };
      const unavailable = () => finish(new UploadError(503, 'scanner_unavailable'));
      const timer = setTimeout(unavailable, this.timeoutMs);
      socket.on('error', unavailable);
      socket.on('close', () => { if (!settled) unavailable(); });
      socket.on('data', chunk => {
        size += chunk.length;
        if (size > 2048) { unavailable(); return; }
        chunks.push(chunk);
        const response = Buffer.concat(chunks);
        const end = response.indexOf(0);
        if (end < 0) return;
        if (end !== response.length - 1 || response.subarray(0, end).includes(10) || response.subarray(0, end).includes(13)) { unavailable(); return; }
        finish(null, response.subarray(0, end).toString('utf8'));
      });
      socket.once('connect', () => {
        socket.write('z' + command + '\0');
        if (!bytes) return;
        for (let offset = 0; offset < bytes.length; offset += 65536) {
          const chunk = bytes.subarray(offset, offset + 65536), length = Buffer.alloc(4);
          length.writeUInt32BE(chunk.length); socket.write(length); socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
    });
  }

  async version() {
    const value = await this.exchange('VERSION');
    const match = value.match(/^ClamAV ([0-9]+\.[0-9]+\.[0-9]+(?:[-.][a-zA-Z0-9]+)?)\/([0-9]{1,12})\/(.{10,80})$/);
    if (!match) throw new UploadError(503, 'scanner_unavailable');
    // ClamAV's official image uses UTC. Do not interpret its unzoned stamp in the Node host's local timezone.
    const stamp = /(?:GMT|UTC|[+-]\d{4})$/.test(match[3]) ? match[3] : match[3] + ' UTC';
    const date = Date.parse(stamp), age = this.now() - date;
    if (!Number.isFinite(date) || age < -300000 || age > 48 * 60 * 60 * 1000) throw new UploadError(503, 'scanner_signatures_stale');
    return { engine: 'ClamAV ' + match[1], signatureVersion: match[2], signatureDate: new Date(date).toISOString() };
  }

  async scan(bytes) {
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 5 * 1024 * 1024) throw new UploadError(413, 'file_too_large');
    const before = await this.version();
    const result = await this.exchange('INSTREAM', bytes);
    if (/^stream: [^\r\n\0]{1,200} FOUND$/.test(result)) throw new UploadError(422, 'file_rejected');
    if (result !== 'stream: OK') throw new UploadError(503, 'scanner_unavailable');
    const after = await this.version();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new UploadError(503, 'scanner_changed');
    return { ...after, scannedAt: new Date(this.now()).toISOString() };
  }
}
