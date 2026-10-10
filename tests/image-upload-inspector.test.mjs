import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ImageUploadInspector, IMAGE_SELF_TEST, IMAGE_POLICY, IMAGE_DECODER, validateImageInspection } from '../server/image-upload-inspector.mjs';

const proof = (bytes, mimeType = 'image/png') => ({ ok: true, policy: IMAGE_POLICY, decoder: IMAGE_DECODER, mimeType, size: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'), width: 1, height: 1, frames: 1 });
const frame = result => { const data = Buffer.from(JSON.stringify(result)), length = Buffer.alloc(4); length.writeUInt32BE(data.length); return Buffer.concat([length, data]); };

async function fixture(t, reply, timeoutMs = 1000) {
  const directory = await mkdtemp(join(tmpdir(), 'dongda-image-client-')), socketPath = join(directory, 'inspector.sock'), connections = new Set(), requests = [];
  const server = createServer({ allowHalfOpen: true }, socket => {
    connections.add(socket); socket.on('error', () => {}); socket.on('close', () => connections.delete(socket));
    const chunks = []; socket.on('data', chunk => chunks.push(chunk));
    socket.on('end', () => {
      const data = Buffer.concat(chunks), size = data.readUInt32BE(0), job = JSON.parse(data.subarray(4, 4 + size));
      const request = { job, bytes: data.subarray(4 + size) }; requests.push(request);
      reply(socket, request);
    });
  });
  await new Promise(resolve => server.listen(socketPath, resolve));
  t.after(async () => { for (const socket of connections) socket.destroy(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  return { socketPath, requests, inspector: new ImageUploadInspector({ socketPath, timeoutMs }) };
}

test('private image client frames original bytes and independently validates readiness and exact identity', async t => {
  const f = await fixture(t, (socket, request) => socket.end(frame(proof(request.job.kind === 'ready' ? IMAGE_SELF_TEST : request.bytes))));
  assert.deepEqual(await f.inspector.ready(), proof(IMAGE_SELF_TEST));
  assert.deepEqual(await f.inspector.inspect(IMAGE_SELF_TEST, 'image/png'), proof(IMAGE_SELF_TEST));
  assert.deepEqual(f.requests[0], { job: { kind: 'ready' }, bytes: Buffer.alloc(0) });
  assert.deepEqual(f.requests[1], { job: { kind: 'inspect', size: IMAGE_SELF_TEST.length, mimeType: 'image/png' }, bytes: IMAGE_SELF_TEST });
});

test('private image proof rejects wrong hash, MIME, dimensions, decoder, policy, frames and unknown fields', () => {
  for (const change of [{ sha256: '0'.repeat(64) }, { mimeType: 'image/jpeg' }, { width: 8193 }, { height: 0 }, { width: 5000, height: 5000 },
    { decoder: 'other' }, { policy: 'other' }, { frames: 2 }, { size: 1 }, { width: true }, { extra: 'do-not-leak' }]) {
    assert.throws(() => validateImageInspection({ ...proof(IMAGE_SELF_TEST), ...change }, IMAGE_SELF_TEST, 'image/png'), error => error.code === 'image_inspection_unavailable' && error.status === 503);
  }
});

test('private image client rejects malformed, oversized, truncated and trailing output even after valid proof', async t => {
  for (const wire of [Buffer.from('not JSON'), Buffer.alloc(1029), frame(proof(IMAGE_SELF_TEST)).subarray(0, 20), Buffer.concat([frame(proof(IMAGE_SELF_TEST)), Buffer.from('extra')]), frame(null)]) {
    const f = await fixture(t, socket => socket.end(wire));
    await assert.rejects(f.inspector.ready(), error => error.code === 'image_inspection_unavailable' && error.status === 503);
  }
});

test('private image client maps fixed input rejection but sanitizes arbitrary service error text', async t => {
  for (const [code, status, expected] of [['image_content_not_allowed', 422, 'image_content_not_allowed'], ['image_complexity_limit', 422, 'image_complexity_limit'],
    ['image_inspection_busy', 503, 'image_inspection_unavailable'], ['image_inspection_timeout', 503, 'image_inspection_unavailable'], ['provider secret text', 503, 'image_inspection_unavailable']]) {
    const f = await fixture(t, socket => socket.end(frame({ ok: false, code })));
    await assert.rejects(f.inspector.inspect(IMAGE_SELF_TEST, 'image/png'), error => error.status === status && error.code === expected && !error.message.includes('secret'));
    await assert.rejects(f.inspector.ready(), error => error.status === 503 && error.code === 'image_inspection_unavailable');
  }
});

test('private image client absence, disconnect and parent deadline fail closed', async t => {
  const absent = new ImageUploadInspector({ socketPath: join(tmpdir(), 'missing-dongda-inspector.sock'), timeoutMs: 20 });
  await assert.rejects(absent.ready(), error => error.status === 503);
  for (const reply of [socket => socket.destroy(), () => {}]) {
    const f = await fixture(t, reply, 30);
    await assert.rejects(f.inspector.ready(), error => error.status === 503 && error.code === 'image_inspection_unavailable');
  }
});

test('private image client cannot target remote hosts, relative paths or invalid input sizes/types', () => {
  for (const options of [{}, { socketPath: 'relative' }, { socketPath: '/a\0b' }, { socketPath: '/valid', timeoutMs: 15001 }]) assert.throws(() => new ImageUploadInspector(options));
  const inspector = new ImageUploadInspector({ socketPath: '/private/example.sock' });
  for (const [bytes, mime] of [[Buffer.alloc(0), 'image/png'], [Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png'], [IMAGE_SELF_TEST, 'application/pdf']]) assert.throws(() => inspector.inspect(bytes, mime));
});
