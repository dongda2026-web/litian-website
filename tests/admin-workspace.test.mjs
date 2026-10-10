import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AdminSessions } from '../server/admin-sessions.mjs';
import { InquiryStore, createInquiryServer, validateLead } from '../server/inquiry-service.mjs';

const lead = company => validateLead({ type: 'inquiry', company, contact: 'Synthetic Contact', email: 'qa@example.test', product: 'FIBC', productId: 'fibc', quantity: '1000 pcs' });
async function fixture(t, preview = false) {
  const directory = await mkdtemp(join(tmpdir(), 'dongda-admin-')), path = join(directory, 'inquiries.sqlite');
  const store = new InquiryStore(path), origin = preview ? 'http://localhost:4190' : 'https://cn-dongda.com';
  const config = { adminToken: randomBytes(32).toString('hex'), rateSalt: randomBytes(32).toString('hex'), allowedOrigins: [origin], localPreview: preview };
  const server = createInquiryServer(store, config); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); await rm(directory, { recursive: true, force: true }); });
  const request = (path, options = {}) => fetch(base + path, { ...options, headers: { Origin: origin, ...options.headers } });
  const login = async () => {
    const response = await request('/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preview ? { preview: true } : { token: config.adminToken }) });
    return { response, session: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  return { directory, path, store, config, origin, base, request, login };
}

test('short-lived sessions expire, rotate, revoke, and use secure production cookies', () => {
  let now = 1000;
  const sessions = new AdminSessions({ allowedOrigins: ['https://cn-dongda.com'] }, () => now);
  const first = sessions.issue(), request = { headers: { cookie: first.cookie.split(';')[0] } };
  assert.match(first.cookie, /__Secure-dd_admin=/); assert.match(first.cookie, /HttpOnly; SameSite=Strict/); assert.match(first.cookie, /; Secure$/);
  assert.equal(sessions.find(request).expiresAt, now + 1800000);
  assert.equal(sessions.find({ headers: { cookie: request.headers.cookie + '; ' + request.headers.cookie } }), null);
  assert.notEqual(sessions.issue().cookie, first.cookie);
  now += 1800000; assert.equal(sessions.find(request), null);
  const active = sessions.issue(), secondRequest = { headers: { cookie: active.cookie.split(';')[0] } };
  assert.match(sessions.revoke(secondRequest), /Max-Age=0/); assert.equal(sessions.find(secondRequest), null);
});

test('production token login, cookie readback, CSRF write, logout and cookie replay', async t => {
  const f = await fixture(t), id = f.store.receive(lead('Synthetic Buyer'), randomBytes(16).toString('hex')).id;
  const { response, session, cookie } = await f.login();
  assert.equal(response.status, 200); assert.equal(session.authenticated, true); assert.equal(session.localPreview, false);
  assert.match(response.headers.get('set-cookie'), /; Secure$/);
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  const detail = await f.request('/api/admin/inquiries/' + id, { headers }); assert.equal(detail.status, 200);
  assert.equal((await detail.json()).inquiry.lead.company, 'Synthetic Buyer');
  const path = '/api/admin/inquiries/' + id + '/followups', body = JSON.stringify({ status: 'contacted', owner: 'Sales A', note: 'Synthetic followup', expectedRevision: 0 });
  assert.equal((await f.request(path, { method: 'POST', headers, body })).status, 403);
  assert.equal((await f.request(path, { method: 'POST', headers: { ...headers, 'X-CSRF-Token': 'wrong' }, body })).status, 403);
  const csrfHeaders = { ...headers, 'X-CSRF-Token': session.csrfToken };
  assert.equal((await fetch(f.base + path, { method: 'POST', headers: csrfHeaders, body })).status, 403);
  assert.equal((await f.request(path, { method: 'POST', headers: { ...csrfHeaders, Origin: 'https://evil.example' }, body })).status, 403);
  const saved = await f.request(path, { method: 'POST', headers: csrfHeaders, body }); assert.equal(saved.status, 200);
  const inquiry = (await saved.json()).inquiry; assert.equal(inquiry.owner, 'Sales A'); assert.equal(inquiry.revision, 1); assert.equal(inquiry.followups[0].actor, 'site-administrator');
  assert.equal((await f.request(path, { method: 'POST', headers: csrfHeaders, body })).status, 409);
  assert.equal(f.store.get(id).followups.length, 1);
  assert.equal((await f.request('/api/admin/session', { method: 'DELETE', headers })).status, 403);
  const logout = await f.request('/api/admin/session', { method: 'DELETE', headers: csrfHeaders }); assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await f.request('/api/admin/inquiries', { headers })).status, 401);
});

test('loopback preview login is opt-in and cannot authenticate production', async t => {
  const production = await fixture(t), preview = await fixture(t, true);
  assert.equal((await production.request('/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preview: true }) })).status, 401);
  const signedIn = await preview.login(); assert.equal(signedIn.response.status, 200); assert.equal(signedIn.session.localPreview, true);
  assert.equal(signedIn.response.headers.get('set-cookie').includes('; Secure'), false);
  assert.throws(() => createInquiryServer(production.store, { ...production.config, localPreview: true }), /loopback/);
  assert.equal((await fetch(production.base + '/api/admin/inquiries', { headers: { Cookie: signedIn.cookie } })).status, 401);
});

test('login throttling, malformed requests and cross-origin rejection do not leak credentials', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 5; i++) {
    const response = await f.request('/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'wrong' }) });
    assert.equal(response.status, 401); assert.equal((await response.text()).includes(f.config.adminToken), false);
  }
  const response = await f.request('/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: f.config.adminToken }) });
  assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '60');
  const session = await (await f.request('/api/admin/session')).json(); assert.equal(session.authenticated, false); assert.equal(session.csrfToken, undefined);
});

test('list search/filter and keyset pagination handle tied timestamps and literal input', async t => {
  const f = await fixture(t), ids = [];
  for (let i = 0; i < 5; i++) ids.push(f.store.receive(lead(i === 0 ? '<img src=x onerror=alert(1)>' : `Buyer ${i}`), randomBytes(16).toString('hex')).id);
  f.store.db.prepare('UPDATE inquiries SET received_at = ?').run('2026-10-08T12:00:00.000Z');
  f.store.followUp(ids[1], { status: 'contacted', owner: 'Sales West', note: '', expectedRevision: 0 });
  f.store.db.prepare("UPDATE notifications SET status = 'failed' WHERE inquiry_id = ?").run(ids[1]);
  const { cookie } = await f.login(), headers = { Cookie: cookie };
  const first = await (await f.request('/api/admin/inquiries?limit=2', { headers })).json();
  const second = await (await f.request('/api/admin/inquiries?limit=2&cursor=' + first.nextCursor, { headers })).json();
  const third = await (await f.request('/api/admin/inquiries?limit=2&cursor=' + second.nextCursor, { headers })).json();
  assert.equal(new Set([...first.inquiries, ...second.inquiries, ...third.inquiries].map(row => row.id)).size, 5); assert.equal(third.nextCursor, null);
  assert.deepEqual(first.summary, { total: 5, new: 4, pending: 4, failed: 1 });
  const filtered = await (await f.request('/api/admin/inquiries?q=West&status=contacted&notification=failed', { headers })).json();
  assert.equal(filtered.total, 1); assert.equal(filtered.inquiries[0].id, ids[1]);
  const none = await (await f.request('/api/admin/inquiries?q=' + encodeURIComponent("' OR 1=1 --"), { headers })).json(); assert.equal(none.total, 0);
  const html = await (await f.request('/api/admin/inquiries?q=' + encodeURIComponent('<img'), { headers })).json(); assert.equal(html.inquiries[0].company, '<img src=x onerror=alert(1)>');
  for (const query of ['cursor=invalid', 'q=' + 'x'.repeat(121), 'status=fake', 'notification=delivered', 'limit=1.5']) assert.equal((await f.request('/api/admin/inquiries?' + query, { headers })).status, 422);
});

test('additive migration preserves existing inquiries and followups across reopening', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dongda-admin-migration-')), path = join(directory, 'inquiries.sqlite');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const db = new DatabaseSync(path), id = 'DD-00000000-0000-4000-8000-000000000001';
  db.exec(`CREATE TABLE inquiries (id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, digest TEXT NOT NULL, payload TEXT NOT NULL, received_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', owner TEXT NOT NULL DEFAULT '') STRICT;
    CREATE TABLE followups (id INTEGER PRIMARY KEY, inquiry_id TEXT NOT NULL REFERENCES inquiries(id), created_at TEXT NOT NULL, status TEXT NOT NULL, owner TEXT NOT NULL, note TEXT NOT NULL) STRICT;`);
  db.prepare('INSERT INTO inquiries (id,request_key,digest,payload,received_at) VALUES (?,?,?,?,?)').run(id, 'migration-key', 'digest', JSON.stringify(lead('Legacy Buyer')), '2026-10-08T12:00:00.000Z');
  db.prepare('INSERT INTO followups (inquiry_id,created_at,status,owner,note) VALUES (?,?,?,?,?)').run(id, '2026-10-08T12:10:00.000Z', 'new', '', 'Existing note'); db.close();
  const migrated = new InquiryStore(path); migrated.db.prepare('INSERT INTO notifications (inquiry_id) VALUES (?)').run(id);
  assert.equal(migrated.get(id).lead.company, 'Legacy Buyer'); assert.equal(migrated.get(id).revision, 0); assert.equal(migrated.get(id).followups[0].note, 'Existing note');
  migrated.followUp(id, { status: 'qualified', owner: 'Sales', note: 'Migration verification', expectedRevision: 0 }, 'site-administrator'); migrated.close();
  const reopened = new InquiryStore(path); assert.equal(reopened.get(id).revision, 1); assert.equal(reopened.get(id).followups.length, 2); reopened.close();
});

test('admin resources have CSP/no-store/noindex; no server or database file is exposed', async t => {
  const f = await fixture(t);
  for (const path of ['/admin', '/admin/', '/admin/workspace.js', '/admin/workspace.css', '/admin/icons.json', '/admin/logo.png']) {
    const response = await f.request(path); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/); assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.equal((await response.arrayBuffer()).byteLength > 0, true);
  }
  for (const path of ['/admin/inquiry-service.mjs', '/admin/var/inquiries.sqlite', '/server/admin-ui/index.html', '/var/preview-inquiries.sqlite']) assert.equal((await f.request(path)).status, 404);
  const html = await (await f.request('/admin')).text(); assert.equal(html.includes(f.config.adminToken), false); assert.equal(html.includes('Synthetic Contact'), false);
  const head = await f.request('/admin', { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
  assert.equal((await f.request('/admin', { method: 'POST' })).status, 405);
  const js = await readFile(new URL('../server/admin-ui/workspace.js', import.meta.url), 'utf8'); assert.equal(/localStorage|sessionStorage|innerHTML/.test(js), false);
  const syntax = spawnSync(process.execPath, ['--check', fileURLToPath(new URL('../server/admin-ui/workspace.js', import.meta.url))], { timeout: 5000, encoding: 'utf8' }); assert.equal(syntax.status, 0, syntax.stderr);
});
