import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { composeExport, digest } from './content-contract.mjs';
import { releaseBuildScript } from './build-mode.mjs';
import { assessPublication, requirePublication, reviewVersion } from '../scripts/publication-review-core.mjs';
import { readonlyPreview, previewLimits } from './preview-document.mjs';

export class CmsError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const sourceItems = ['index.html','404.html','assets','public','_headers','_redirects','robots.txt','sitemap.xml','site-manifest.json','DEPLOYMENT.md','ALIYUN_DEPLOYMENT.md','ALIYUN_DYNAMIC_API.md','content','workers','.openai','package.json','package-lock.json','scripts','server','tests','cms','aliyun'];
const releasePattern = /^cms-[0-9]{13}-[a-f0-9-]{36}$/;
async function fileIndex(root) {
  const files = [];
  async function walk(directory, prefix = '') {
    for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix + entry.name, absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new CmsError('Unexpected symlink in release inputs', 409);
      if (entry.isDirectory()) await walk(absolute, relative + '/');
      else files.push({ path: relative, sha256: digest(await fs.readFile(absolute, 'base64')) });
    }
  }
  await walk(root); return files;
}
async function sourceIndex(root) {
  const files = [];
  for (const item of sourceItems) {
    const absolute = path.join(root, item), stat = await fs.lstat(absolute);
    if (stat.isSymbolicLink()) throw new CmsError('Unexpected source symlink', 409);
    if (stat.isDirectory()) files.push(...(await fileIndex(absolute)).map(file => ({ ...file, path: item + '/' + file.path })));
    else files.push({ path: item, sha256: digest(await fs.readFile(absolute, 'base64')) });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
export async function runBuild(directory, {scope='published'}={}) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', releaseBuildScript(scope)], { cwd: directory, env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_NO_WARNINGS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; const append = chunk => { output = (output + chunk.toString()).slice(-256 * 1024); };
    child.stdout.on('data', append); child.stderr.on('data', append); child.on('error', reject);
    child.on('exit', code => resolve({ passed: code === 0, log: output }));
  });
}
export class ReleaseStore {
  constructor({ sourceRoot, storageRoot, readExport, builder = runBuild, publicationAssessor = assessPublication, assetOrigin = 'https://cn-dongda.com' }) {
    if (!path.isAbsolute(sourceRoot) || !path.isAbsolute(storageRoot) || sourceRoot === storageRoot || storageRoot.startsWith(path.join(sourceRoot, 'dist') + path.sep)) throw new CmsError('Private absolute storage required');
    this.sourceRoot = sourceRoot; this.storageRoot = storageRoot; this.readExport = readExport; this.builder = builder; this.publicationAssessor = publicationAssessor;
    const url = new URL(assetOrigin); if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || (url.protocol !== 'https:' && !['127.0.0.1','localhost'].includes(url.hostname))) throw new CmsError('Invalid preview asset origin');
    this.assetOrigin = url.origin;
  }
  async initialize() { await fs.mkdir(path.join(this.storageRoot, 'releases'), { recursive: true, mode: 0o700 }); }
  async lock(action) {
    await this.initialize(); let handle;
    try { handle = await fs.open(path.join(this.storageRoot, 'operation.lock'), 'wx', 0o600); } catch (error) { if (error.code === 'EEXIST') throw new CmsError('Another CMS operation is running; current version unchanged', 409); throw error; }
    try { await handle.writeFile(JSON.stringify({ pid: process.pid, operationId: randomUUID() })); return await action(); }
    finally { await handle.close(); await fs.unlink(path.join(this.storageRoot, 'operation.lock')); }
  }
  async state() { try { return JSON.parse(await fs.readFile(path.join(this.storageRoot, 'state.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; return { current: null, previous: null, revision: 0 }; } }
  directory(id) { if (!releasePattern.test(id || '')) throw new CmsError('Invalid release identity'); return path.join(this.storageRoot, 'releases', id); }
  async manifest(id) { try { return JSON.parse(await fs.readFile(path.join(this.directory(id), 'release.json'), 'utf8')); } catch (error) { if (error.code === 'ENOENT') throw new CmsError('Release not found', 404); throw error; } }
  async writeManifest(manifest) { await fs.writeFile(path.join(this.directory(manifest.id), 'release.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 }); }
  async status() {
    await this.initialize(); const releases = [];
    for (const entry of await fs.readdir(path.join(this.storageRoot, 'releases'))) if (releasePattern.test(entry)) {
      const { id, scope, status, createdAt, changedRecords, error } = await this.manifest(entry); releases.push({ id, scope, status, createdAt, changedRecords, ...(error ? { error } : {}) });
    }
    return { state: await this.state(), releases: releases.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30) };
  }
  async baseline() {
    const read = async name => JSON.parse(await fs.readFile(path.join(this.sourceRoot, 'content', name + '.json'), 'utf8'));
    return {products: await read('products'), industries: await read('industries'), companyHistory: await read('company-history'), companyProfile: await read('company-profile'), editorial: {insights: await read('insights'), resources: await read('resources')}};
  }
  async build(scope, actor) {
    if (!['published', 'preview'].includes(scope)) throw new CmsError('Invalid content scope');
    return this.lock(async () => {
      const envelope = await this.readExport(scope), baseline = await this.baseline();
      const content = composeExport(envelope, baseline.products, baseline.industries, scope, baseline.companyHistory, baseline.editorial, baseline.companyProfile);
      const inputs = await sourceIndex(this.sourceRoot), id = `cms-${Date.now()}-${randomUUID()}`, directory = this.directory(id), workspace = path.join(directory, 'source');
      const manifest = { id, scope, status: 'building', createdAt: new Date().toISOString(), actor, sourceHash: digest(inputs), contentFingerprint: content.fingerprint, changedRecords: content.changedRecords };
      await fs.mkdir(workspace, { recursive: true, mode: 0o700 }); await this.writeManifest(manifest);
      try {
        for (const item of sourceItems) await fs.cp(path.join(this.sourceRoot, item), path.join(workspace, item), { recursive: true });
        await fs.symlink(path.join(this.sourceRoot, 'node_modules'), path.join(workspace, 'node_modules'), 'dir');
        await fs.writeFile(path.join(workspace, 'content/products.json'), JSON.stringify(content.products, null, 2) + '\n');
        await fs.writeFile(path.join(workspace, 'content/industries.json'), JSON.stringify(content.industries, null, 2) + '\n');
        await fs.writeFile(path.join(workspace, 'content/company-history.json'), JSON.stringify(content.companyHistory, null, 2) + '\n');
        await fs.writeFile(path.join(workspace, 'content/company-profile.json'), JSON.stringify(content.companyProfile, null, 2) + '\n');
        await fs.writeFile(path.join(workspace, 'content/insights.json'), JSON.stringify(content.insights, null, 2) + '\n');
        await fs.writeFile(path.join(workspace, 'content/resources.json'), JSON.stringify(content.resources, null, 2) + '\n');
        const result = await this.builder(workspace,{scope}); await fs.writeFile(path.join(directory, 'gates.log'), result.log, { mode: 0o600 });
        if (!result.passed) throw new CmsError('Build gates failed; current version unchanged', 422);
        if (digest(await sourceIndex(this.sourceRoot)) !== manifest.sourceHash) throw new CmsError('Source changed during build; rebuild required', 409);
        const client = path.join(workspace, 'dist/client');
        const siteManifestPath = path.join(client, 'site-manifest.json'), siteManifest = JSON.parse(await fs.readFile(siteManifestPath, 'utf8'));
        siteManifest.release_id = id; siteManifest.cms_content_fingerprint = content.fingerprint;
        await fs.writeFile(siteManifestPath, JSON.stringify(siteManifest, null, 2) + '\n');
        const artifacts = await fileIndex(client);
        if (artifacts.some(file => /(?:^|\/)(?:cms|server|admin|var|private-review|\.env|node_modules|\.git)(?:\/|$)|\.(?:sqlite|db|pem|key)$/.test(file.path))) throw new CmsError('Private content found in public artifact', 422);
        await fs.rename(client, path.join(directory, 'client'));
        manifest.status = 'ready'; manifest.artifactHash = digest(artifacts); manifest.artifacts = artifacts; manifest.candidateSourceHash = digest(await sourceIndex(workspace));
        await this.writeManifest(manifest); return { id, scope, status: 'ready' };
      } catch (error) { manifest.status = 'failed'; manifest.error = error instanceof CmsError ? error.message : 'Build failed; current version unchanged'; await this.writeManifest(manifest); throw error; }
    });
  }
  async verified(id, allowPreview = false) {
    const manifest = await this.manifest(id);
    if (manifest.status !== 'ready' || (!allowPreview && manifest.scope !== 'published')) throw new CmsError('Draft or failed releases cannot be activated', 403);
    if (digest(await fileIndex(path.join(this.directory(id), 'client'))) !== manifest.artifactHash) throw new CmsError('Release artifact integrity mismatch', 409);
    if(!allowPreview){
      const candidate=path.join(this.directory(id),'source');
      if(!manifest.candidateSourceHash||digest(await sourceIndex(candidate))!==manifest.candidateSourceHash)throw new CmsError('Release source integrity mismatch',409);
      try{requirePublication(await this.publicationAssessor(candidate,{reviewRoot:this.sourceRoot}));}catch{throw new CmsError('Publication review required; current version unchanged',422);}
      const metadata=JSON.parse(await fs.readFile(path.join(this.directory(id),'client/site-manifest.json'),'utf8'));
      if(metadata.publication_review?.version!==reviewVersion||metadata.publication_review?.publishable!==true||metadata.publication_review?.status!=='review-records-valid')throw new CmsError('Artifact is not cleared for publication',422);
    }
    return manifest;
  }
  async move(id, expectedRevision, actor, rollback = false) {
    return this.lock(async () => {
      const state = await this.state();
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== state.revision) throw new CmsError('Release changed; reload before publishing', 409);
      if (rollback) { if (!state.previous) throw new CmsError('No previous release'); id = state.previous; }
      const manifest = await this.verified(id);
      if (state.current === id) throw new CmsError('Release already active', 409);
      if (!rollback) {
        if (digest(await sourceIndex(this.sourceRoot)) !== manifest.sourceHash) throw new CmsError('Source changed; rebuild required', 409);
        const baseline = await this.baseline(), currentContent = composeExport(await this.readExport('published'), baseline.products, baseline.industries, 'published', baseline.companyHistory, baseline.editorial, baseline.companyProfile);
        if (currentContent.fingerprint !== manifest.contentFingerprint) throw new CmsError('Approved content changed; rebuild required', 409);
      }
      const next = { current: id, previous: state.current, revision: state.revision + 1, actor, updatedAt: new Date().toISOString(), action: rollback ? 'rollback' : 'activate' };
      const temporary = path.join(this.storageRoot, `state-${randomUUID()}.tmp`), final = path.join(this.storageRoot, 'state.json');
      const handle = await fs.open(temporary, 'wx', 0o600); try { await handle.writeFile(JSON.stringify(next) + '\n'); await handle.sync(); } finally { await handle.close(); }
      await fs.rename(temporary, final);
      await fs.appendFile(path.join(this.storageRoot, 'events.jsonl'), JSON.stringify(next) + '\n', { mode: 0o600 });
      return { state: next };
    });
  }
  async preview(id, kind, contentId, language) {
    if (!['company-profile','product','industry','history','insight','resource','resource-field'].includes(kind) || !/^[a-z][a-z0-9-]{0,79}$/.test(contentId || '') || !['zh','en','ru'].includes(language)) throw new CmsError('Invalid preview route');
    const manifest = await this.verified(id, true);
    const client = path.join(this.directory(id), 'client');
    const artifacts = new Map(manifest.artifacts.map(row => [row.path, row.sha256])), root = await fs.realpath(client);
    const readArtifact = async (relative, limit) => {
      if (typeof relative !== 'string' || relative.startsWith('/') || relative.includes('\\') || relative.split('/').some(part => !part || part === '.' || part === '..') || !artifacts.has(relative)) throw new CmsError('Preview asset not found', 404);
      const absolute = path.join(client, relative), handle = await fs.open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size < 1 || stat.size > limit || !(await fs.realpath(absolute)).startsWith(root + path.sep)) throw new CmsError('Preview asset unavailable', 422);
        const buffer = Buffer.alloc(limit + 1); let length = 0;
        while (length < buffer.length) { const result = await handle.read(buffer, length, buffer.length - length, length); if (!result.bytesRead) break; length += result.bytesRead; }
        const bytes = buffer.subarray(0, length);
        if (length > limit || digest(bytes.toString('base64')) !== artifacts.get(relative)) throw new CmsError('Preview asset integrity mismatch', 409);
        return bytes;
      } finally { await handle.close(); }
    };
    const readContent = async name => JSON.parse((await readArtifact('content/' + name + '.json', 1024 * 1024)).toString('utf8'));
    let route, wanted;
    if(kind==='company-profile'){
      const profile=globalThis.DongDaCompanyProfile.create(await readContent('company-profile'));
      if(profile.data.id!==contentId)throw new CmsError('Preview company profile not found',404);
      route=`/${language}/company/`;wanted='page-about';
    } else if (['insight','resource','resource-field'].includes(kind)) {
      const catalog = globalThis.DongDaCatalog.create(await readContent('products'));
      const data = await readContent(kind === 'insight' ? 'insights' : 'resources');
      const registry = kind === 'insight' ? globalThis.DongDaInsights.create(data, catalog) : globalThis.DongDaResources.create(data, catalog);
      const entry = kind === 'resource-field' ? registry.fields.some(field => field.id === contentId) && registry.entries.find(item => item.fieldIds.includes(contentId)) : registry.resolve(contentId);
      if (!entry) throw new CmsError('Preview content not found', 404);
      route = kind === 'insight' ? globalThis.DongDaInsights.path(entry, language) : globalThis.DongDaResources.path(entry, language);
      wanted = kind === 'insight' ? 'page-insight-detail' : 'page-resource-detail';
    } else {
      route = kind === 'history' ? `/${language}/company/history/` : `/${language}/${kind === 'product' ? 'products' : 'industries'}/${contentId}/`;
      wanted = kind === 'history' ? 'page-company-history' : kind === 'product' ? 'page-product-detail' : 'page-industry-detail';
    }
    const file = path.join(client, route, 'index.html');
    let source; try { source = (await readArtifact(path.relative(client, file), previewLimits.html)).toString('utf8'); } catch (error) { if (error.code === 'ENOENT') throw new CmsError('Preview not found', 404); throw error; }
    if (kind === 'history') {
      const data = await readContent('company-history');
      if (!globalThis.DongDaCompany.create(data).resolve(contentId)) throw new CmsError('Preview milestone not found', 404);
    }
    try { const result = await readonlyPreview({ source, wanted, readAsset: (asset, limit) => readArtifact(asset.slice(1), limit) }); return { html: result.html }; }
    catch (error) { if (error instanceof CmsError) throw error; throw new CmsError('Readonly preview validation failed', 422); }
  }
}
