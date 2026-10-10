import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { historySchemaVersion as schemaVersion } from '../cms/content-contract.mjs';

// Only synthetic local identities are read; no credentials enter the report.
const root = path.resolve(import.meta.dirname, '..');
const identities = JSON.parse(await fs.readFile(path.join(root, 'var/cms/local-identities.json'), 'utf8'));
const checks = [];
async function call(user, route, method = 'GET', data) {
  const response = await fetch('http://127.0.0.1:4192/?rest_route=/dongda/v1/' + route, {
    method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { ...(user ? { Authorization: 'Basic ' + Buffer.from(user + ':' + identities.applicationPasswords[user]).toString('base64') } : {}), ...(data ? { 'Content-Type': 'application/json' } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {})
  });
  return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
}
async function status(name, user, route, expected, method, data) {
  const response = await call(user, route, method, data); assert.equal(response.status, expected, name);
  checks.push({ name, status: response.status, passed: true }); return response;
}
await status('Anonymous export denied', null, 'export', 401);
await status('Exporter cannot edit', 'dd-cms-exporter', 'records', 403);
const author = (await status('Author reads scoped records', 'dd-cms-author', 'records', 200)).body;
assert.equal(author.records.length, 31); assert.equal(author.reviewer, false);
assert.equal(author.records.filter(record => record.kind === 'history').length, 20);
const selected = author.records.find(record => record.id === 'fibc-bulk-bags');
const fields = Object.fromEntries(selected.editable.map(key => [key, key.split('.').reduce((value, part) => value[part], selected.data)]));
await status('Author cannot approve', 'dd-cms-author', `records/${selected.postId}`, 403, 'POST', { action: 'publish', expectedRevision: selected.revision, fields });
await status('Author cannot build approved release', 'dd-cms-author', 'release', 403, 'POST', { action: 'build', scope: 'published' });
await status('Author cannot activate', 'dd-cms-author', 'release', 403, 'POST', { action: 'activate', releaseId: 'not-used', expectedRevision: 0 });
await status('Author cannot restore revisions', 'dd-cms-author', `records/${selected.postId}/revisions`, 403);
await status('Unknown writable field denied', 'dd-cms-reviewer', `records/${selected.postId}`, 400, 'POST', { action: 'draft', expectedRevision: selected.revision, fields: { ...fields, id: 'tampered' } });
await status('Unknown request metadata denied', 'dd-cms-reviewer', `records/${selected.postId}`, 400, 'POST', { action: 'draft', expectedRevision: selected.revision, fields, tenantId: 'tampered' });
await status('HTML rejected', 'dd-cms-reviewer', `records/${selected.postId}`, 400, 'POST', { action: 'draft', expectedRevision: selected.revision, fields: { ...fields, 'summary.zh': '<script>alert(1)</script>' } });
await status('Stale content save conflicts', 'dd-cms-reviewer', `records/${selected.postId}`, 409, 'POST', { action: 'draft', expectedRevision: selected.revision + 20, fields });
await status('Invalid native revision rejected without PHP fatal', 'dd-cms-reviewer', `records/${selected.postId}`, 400, 'POST', { action: 'restore', expectedRevision: selected.revision, revisionId: 0 });
const after = (await call('dd-cms-reviewer', 'records')).body.records.find(record => record.postId === selected.postId);
assert.deepEqual(after, selected);
checks.push({ name: 'Rejected writes preserve payload and revision', passed: true });
const preview = await status('Private preview export', 'dd-cms-exporter', 'export&scope=preview', 200);
const published = await status('Published export excludes drafts', 'dd-cms-exporter', 'export&scope=published', 200);
assert.equal(preview.body.records.length, 31);
assert.equal(preview.body.schema, schemaVersion);
const milestone = author.records.find(record => record.kind === 'history');
const historyFields = Object.fromEntries(milestone.editable.map(key => [key, key.split('.').reduce((value, part) => value[part], milestone.data)]));
await status('History year is immutable', 'dd-cms-reviewer', `records/${milestone.postId}`, 400, 'POST', { action: 'draft', expectedRevision: milestone.revision, fields: { ...historyFields, year: 2026 } });
await status('History author cannot approve', 'dd-cms-author', `records/${milestone.postId}`, 403, 'POST', { action: 'publish', expectedRevision: milestone.revision, fields: historyFields });
assert.deepEqual((await call('dd-cms-reviewer', 'records')).body.records.find(record => record.postId === milestone.postId), milestone);
assert.ok(published.body.records.every(record => record.status === 'publish'));
const cacheDirectives = preview.cache.split(',').map(value => value.trim()); assert.ok(cacheDirectives.includes('private') && cacheDirectives.includes('no-store'));
const revisions = (await status('Native WordPress metadata revisions readable', 'dd-cms-reviewer', `records/${selected.postId}/revisions`, 200)).body;
assert.ok(revisions.some(revision => revision.data?.summary.zh));
const publicHtml = await (await fetch('http://127.0.0.1:4194/zh/products/fibc-bulk-bags/')).text();
assert.ok(!publicHtml.includes('本机CMS验收'));
for (const url of ['/cms/','/var/cms/local-identities.json','/state.json']) assert.equal((await fetch('http://127.0.0.1:4194' + url)).status, 404);
checks.push({ name: 'Public frontend hides synthetic draft and private storage', passed: true });
const health = await (await fetch('http://127.0.0.1:4191/api/health')).json();
assert.equal(health.crmConfigured, false); assert.equal(health.notificationConfigured, false);
const result = { checkedAt: new Date().toISOString(), environment: 'loopback-local-synthetic', passed: true, checks, records: preview.body.records.length, publishedRecords: published.body.records.length, revisions: revisions.length, health, cloudWrites: false, productionErpSynced: false };
if (process.argv[2]) await fs.writeFile(path.resolve(process.argv[2]), JSON.stringify(result, null, 2) + '\n');
process.stdout.write(JSON.stringify({ passed: true, checks: checks.length, records: result.records, revisions: result.revisions }) + '\n');
