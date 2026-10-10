import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'parse5';
import { nodes, attribute, plainText } from './build-product-pages.mjs';

const client = resolve('dist/client');
const manifest = JSON.parse(await readFile(join(client, 'content/product-routes.json'), 'utf8'));
const catalog = globalThis.DongDaCatalog.create(JSON.parse(await readFile(join(client, 'content/products.json'), 'utf8')));
const core = globalThis.DongDaProductPage;
const sitemap = await readFile(join(client, 'sitemap.xml'), 'utf8');
assert.equal(manifest.routes.length, catalog.search({}).length * core.languages.length);
assert.equal(new Set(manifest.routes.map(r => r.path)).size, manifest.routes.length);
for (const route of manifest.routes) {
  const product = catalog.resolve(route.productId), expected = core.metadata(product, route.language, manifest.origin);
  const document = parse(await readFile(join(client, route.path, 'index.html'), 'utf8'));
  const id = value => nodes(document, n => attribute(n, 'id') === value)[0];
  const head = nodes(document, n => n.tagName === 'head')[0];
  assert.equal(attribute(nodes(head, n => n.tagName === 'base')[0], 'href'), '/');
  assert.equal(attribute(nodes(document, n => n.tagName === 'html')[0], 'lang'), route.language);
  assert.equal(plainText(id('pd-name')), product.name[route.language]);
  assert.equal(plainText(id('pd-desc')), product.summary[route.language]);
  assert.equal(attribute(id('page-product-detail'), 'class'), 'page on');
  assert.equal(nodes(document, n => (attribute(n, 'class') || '').split(' ').includes('page') && (attribute(n, 'class') || '').split(' ').includes('on')).length, 1);
  for (const spec of product.specs) assert.ok(plainText(id('pd-specs')).includes(spec.value[route.language]));
  assert.equal(attribute(nodes(head, n => attribute(n, 'rel') === 'canonical')[0], 'href'), expected.canonical);
  assert.equal(attribute(nodes(head, n => n.tagName === 'meta' && attribute(n, 'name') === 'robots')[0], 'content'), expected.robots);
  for (const alternate of expected.alternates) assert.ok(nodes(head, n => attribute(n, 'hreflang') === alternate.language && attribute(n, 'href') === alternate.href).length === 1);
  assert.deepEqual(JSON.parse(plainText(id('product-seo'))), expected.schema);
  assert.equal(sitemap.includes('<loc>' + expected.canonical + '</loc>'), route.indexable);
  assert.equal(route.indexable, product.mediaRole !== 'production-reference');
  if (!route.indexable) assert.equal(nodes(id('pd-media'), n => n.tagName === 'img').length, 0);
  assert.ok(plainText(id('pd-support')).includes(globalThis.DongDaCatalogCopy.text('documentsNote', route.language)));
  assert.equal(nodes(id('rel-grid'), n=>n.tagName==='article').length,3);
  for (const node of nodes(document, n => n.tagName === 'script' && attribute(n, 'type') !== 'application/ld+json' && !attribute(n, 'src'))) new Function(plainText(node));
  for (const node of nodes(document, n => attribute(n, 'src') || n.tagName === 'link' && attribute(n, 'href'))) {
    const value = attribute(node, 'src') || attribute(node, 'href');
    if (/^(data:|https?:|#)/.test(value)) continue;
    const pathname = new URL(value, manifest.origin + '/').pathname;
    await access(join(client, pathname, pathname.endsWith('/') ? 'index.html' : ''));
  }
}
assert.ok(sitemap.includes(manifest.origin + '/'));
assert.ok(!sitemap.includes('china-litian.pages.dev'));
assert.ok((await readFile(join(client, 'robots.txt'), 'utf8')).includes('Disallow: /admin'));
assert.ok((await readFile(join(client, '_redirects'), 'utf8')).includes('/* /404.html 404'));
await access(join(client, '404.html'));
const worker=(await import(pathToFileURL(resolve('dist/server/index.js')).href)).default;
const assetPaths=new Set(['/index.html',...manifest.routes.map(r=>r.path+'index.html')]);
const env={ASSETS:{fetch:async request=>new Response(assetPaths.has(new URL(request.url).pathname)?'HTML':'NOT-FOUND',{status:assetPaths.has(new URL(request.url).pathname)||new URL(request.url).pathname==='/404.html'?200:404,headers:{'Content-Type':'text/html'}})}};
for(const route of manifest.routes){
  assert.equal((await worker.fetch(new Request(manifest.origin+route.path),env)).status,200);
  const redirect=await worker.fetch(new Request(manifest.origin+route.path.slice(0,-1)),env);assert.equal(redirect.status,301);assert.equal(redirect.headers.get('location'),manifest.origin+route.path);
}
assert.equal((await worker.fetch(new Request(manifest.origin+'/'),env)).status,200);
assert.equal((await worker.fetch(new Request(manifest.origin+'/en/products/not-real/'),env)).status,404);
assert.equal((await worker.fetch(new Request(manifest.origin+'/missing.css'),env)).status,404);
assert.equal((await worker.fetch(new Request(manifest.origin+'/',{method:'POST'}),env)).status,405);
process.stdout.write(`Product page audit passed: ${manifest.routes.length} localized routes, ${manifest.routes.filter(r=>r.indexable).length} indexable product entries; shared body, metadata, assets and pending-photo exclusions verified.\n`);
