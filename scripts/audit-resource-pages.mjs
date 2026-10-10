import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parse } from 'parse5';
import { nodes, attribute, plainText } from './build-product-pages.mjs';
import '../assets/js/resource-core.js';
import '../assets/js/resource-delivery-core.js';

const client=resolve('dist/client'),core=globalThis.DongDaResources;
const catalog=globalThis.DongDaCatalog.create(JSON.parse(await readFile(join(client,'content/products.json'),'utf8')));
const registry=core.create(JSON.parse(await readFile(join(client,'content/resources.json'),'utf8')),catalog);
const manifest=JSON.parse(await readFile(join(client,'content/resource-routes.json'),'utf8'));
const delivery=globalThis.DongDaResourceDelivery.create(JSON.parse(await readFile(join(client,'content/resource-files.json'),'utf8')),registry),files=delivery.files;
const sitemap=await readFile(join(client,'sitemap.xml'),'utf8');
assert.equal(manifest.routes.length,15);assert.equal(files.length,12);assert.equal(new Set(files.map(file=>file.path)).size,12);
for(const file of files){const entry=registry.resolve(file.resourceId),bytes=await readFile(join(client,file.path));assert.equal(file.productId,entry.productId);assert.equal(file.path,core.filePath(entry,file.language,delivery));assert.deepEqual(await readFile(join(client,file.legacyPath)),bytes);assert.equal(bytes.toString('utf8'),core.downloadText(entry,file.language,registry));assert.equal(bytes.length,file.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);}
assert.equal(JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8')).resource_delivery_version,delivery.version);
for(const route of manifest.routes){
  const entry=registry.resolve(route.resourceId),document=parse(await readFile(join(client,route.path,'index.html'),'utf8')),active=nodes(document,n=>attribute(n,'class')==='page on');
  assert.equal(active.length,1);assert.equal(plainText(nodes(active[0],n=>n.tagName==='h1')[0]),entry?entry.title[route.language]:core.text('title',route.language));
  const meta=core.metadata(entry,route.language,manifest.origin,catalog);assert.equal(attribute(nodes(document,n=>attribute(n,'rel')==='canonical')[0],'href'),meta.canonical);assert.equal(attribute(nodes(document,n=>attribute(n,'name')==='robots')[0],'content'),'noindex,follow');assert.equal(sitemap.includes('<loc>'+meta.canonical+'</loc>'),false);
  assert.deepEqual(JSON.parse(plainText(nodes(document,n=>attribute(n,'id')==='resource-seo')[0])),meta.schema);
  for(const link of nodes(active[0],n=>n.tagName==='a')){const href=attribute(link,'href');assert.ok(href&&!href.startsWith('javascript:'));const path=new URL(href,manifest.origin+'/').pathname;await access(join(client,path,path.endsWith('/')?'index.html':''));}
  for(const link of nodes(active[0],n=>attribute(n,'data-resource-download')!==undefined))assert.equal(attribute(link,'href'),delivery.resolve(attribute(link,'data-resource-download'),route.language).path);
  for(const node of nodes(document,n=>n.tagName==='script'&&attribute(n,'type')!=='application/ld+json'&&!attribute(n,'src')))new Function(plainText(node));
}
const worker=(await import(pathToFileURL(resolve('dist/server/index.js')).href)).default;
const env={ASSETS:{fetch:async request=>{const path=new URL(request.url).pathname;return new Response(path==='/404.html'?'NOT FOUND':'STATIC',{status:path==='/404.html'||manifest.routes.some(route=>path===route.path+'index.html')||files.some(file=>path===file.path||path===file.legacyPath)||path==='/assets/js/catalog-data.js'?200:404});}}};
for(const file of files){assert.equal((await worker.fetch(new Request(manifest.origin+file.path),env)).headers.get('cache-control'),'public, max-age=31536000, immutable');assert.equal((await worker.fetch(new Request(manifest.origin+file.legacyPath),env)).headers.get('cache-control'),'no-store');}
assert.equal((await worker.fetch(new Request(manifest.origin+'/assets/js/catalog-data.js'),env)).headers.get('cache-control'),'no-store');
for(const route of manifest.routes){assert.equal((await worker.fetch(new Request(manifest.origin+route.path),env)).status,200);for(const path of [route.path.slice(0,-1),route.path+'index.html']){const response=await worker.fetch(new Request(manifest.origin+path+'?product=fibc-bulk-bags'),env);assert.equal(response.status,301);assert.equal(response.headers.get('location'),manifest.origin+route.path+'?product=fibc-bulk-bags');}}
assert.equal((await worker.fetch(new Request(manifest.origin+'/en/resources/missing/'),env)).status,404);
assert.equal((await worker.fetch(new Request(manifest.origin+'/en/resources/',{method:'POST'}),env)).status,405);
for(const privatePath of ['server/inquiry-service.mjs','cms/service.env','var/inquiries.sqlite','.env'])await assert.rejects(access(join(client,privatePath)));
process.stdout.write('Resource audit passed: 15 localized HTML pages, 12 content-addressed TXT files and identical legacy aliases, noindex, synthetic worker routing/cache contracts and no private service assets. Cloud cache remains unverified.\n');
