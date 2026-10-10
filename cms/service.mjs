import { createServer } from 'node:http';
import { timingSafeEqual, createHash } from 'node:crypto';
import path from 'node:path';
import { CmsError, ReleaseStore } from './release-store.mjs';
import { staticPreview } from '../server/static-preview.mjs';
export const maxExportBytes = 1024 * 1024;

export function createCmsServer(store, secret) {
  if (typeof secret !== 'string' || secret.length < 32) throw new TypeError('Private CMS bridge key required');
  const hash = value => createHash('sha256').update(value).digest();
  return createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'private, no-store'); response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (request.url !== '/api/cms') throw new CmsError('Not found', 404);
      if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); throw new CmsError('Method not allowed', 405); }
      if (!timingSafeEqual(hash(request.headers.authorization || ''), hash('Bearer ' + secret))) throw new CmsError('Unauthorized', 401);
      if (request.headers.origin) throw new CmsError('Server-to-server only', 403);
      if (request.headers['content-type']?.split(';')[0] !== 'application/json') throw new CmsError('JSON required', 415);
      let size = 0, body = '';
      for await (const chunk of request) { size += chunk.length; if (size > 16384) throw new CmsError('Request too large', 413); body += chunk.toString(); }
      let data; try { data = JSON.parse(body); } catch { throw new CmsError('Invalid JSON'); }
      if (!data || Array.isArray(data) || Object.keys(data).some(key => !['action','actor','scope','releaseId','expectedRevision','kind','contentId','language'].includes(key)) || !/^[0-9]{1,12}$/.test(data.actor || '')) throw new CmsError('Invalid CMS request');
      let result;
      if (data.action === 'status') result = await store.status();
      else if (data.action === 'build') result = await store.build(data.scope, data.actor);
      else if (data.action === 'activate' || data.action === 'rollback') result = await store.move(data.releaseId, data.expectedRevision, data.actor, data.action === 'rollback');
      else if (data.action === 'preview') result = await store.preview(data.releaseId, data.kind, data.contentId, data.language);
      else throw new CmsError('Unknown action');
      response.writeHead(200); response.end(JSON.stringify(result));
    } catch (error) { response.writeHead(error instanceof CmsError ? error.status : error instanceof TypeError ? 422 : 500); response.end(JSON.stringify({ error: error instanceof CmsError || error instanceof TypeError ? error.message : 'CMS operation failed; reload release state' })); }
  });
}
export function createReleasedSiteServer(store) {
  return createServer(async (request, response) => {
    try {
      const state = await store.state(); if (!state.current) { response.writeHead(503, { 'Content-Type': 'text/plain' }); response.end('No activated local CMS release'); return; }
      await staticPreview(path.join(store.directory(state.current), 'client'))(request, response);
    } catch { response.writeHead(500); response.end('Release unavailable'); }
  });
}
export function wordpressReader({ url, username, applicationPassword, local = false }) {
  const site = new URL(url);
  if (site.username || site.password || site.search || site.hash || (site.protocol !== 'https:' && !(local && site.protocol === 'http:' && ['127.0.0.1','localhost'].includes(site.hostname)))) throw new TypeError('CMS requires configured HTTPS origin or explicit loopback local mode');
  if (!username || !applicationPassword) throw new TypeError('Read-only CMS identity required');
  return async scope => {
    const endpoint = new URL('/?rest_route=/dongda/v1/export', site); endpoint.searchParams.set('scope', scope);
    const response = await fetch(endpoint, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: 'Basic ' + Buffer.from(username + ':' + applicationPassword).toString('base64') } });
    if (!response.ok) throw new CmsError('WordPress export unavailable', 502);
    if (Number(response.headers.get('content-length')) > maxExportBytes) throw new CmsError('CMS export too large', 413);
    let size = 0; const chunks = [];
    for await (const chunk of response.body) { size += chunk.length; if (size > maxExportBytes) throw new CmsError('CMS export too large', 413); chunks.push(chunk); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };
}
