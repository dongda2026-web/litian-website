import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
export const equalSecret = (value, expected) => {
  const a = Buffer.from(typeof value === 'string' ? value : ''), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export class AdminSessions {
  constructor(config, now = Date.now) {
    this.preview = config.localPreview === true;
    if (this.preview && !config.allowedOrigins.every(origin => {
      const url = new URL(origin);
      return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && url.origin === origin;
    })) throw new Error('Preview login is restricted to explicit HTTP loopback origins');
    this.name = this.preview ? 'dd_preview_admin_' + (new URL(config.allowedOrigins[0]).port || '80') : '__Secure-dd_admin';
    this.now = now;
    this.ttl = 30 * 60 * 1000;
    this.sessions = new Map();
  }

  cookie(value, maxAge = this.ttl / 1000) {
    return `${this.name}=${value}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${this.preview ? '' : '; Secure'}`;
  }

  issue() {
    for (const [key, session] of this.sessions) if (session.expiresAt <= this.now()) this.sessions.delete(key);
    if (this.sessions.size >= 1000) throw new Error('Session capacity reached');
    const token = randomBytes(32).toString('hex');
    const session = { csrfToken: randomBytes(32).toString('hex'), expiresAt: this.now() + this.ttl, actor: this.preview ? 'local-preview' : 'site-administrator' };
    this.sessions.set(hash(token), session);
    return { session, cookie: this.cookie(token) };
  }

  find(request) {
    const parts = (request.headers.cookie || '').split(';').map(item => item.trim());
    const values = parts.filter(item => item.startsWith(this.name + '='));
    if (values.length !== 1) return null;
    const token = values[0].slice(this.name.length + 1);
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const key = hash(token), session = this.sessions.get(key);
    if (!session || session.expiresAt <= this.now()) { this.sessions.delete(key); return null; }
    return { ...session, key };
  }

  revoke(request) {
    const session = this.find(request);
    if (session) this.sessions.delete(session.key);
    return this.cookie('', 0);
  }
}
