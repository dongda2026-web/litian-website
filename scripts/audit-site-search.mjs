import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'parse5';
import { nodes, attribute, plainText } from './build-product-pages.mjs';
import { loadSiteSearch } from './build-site-search-pages.mjs';

const client=resolve('dist/client'),core=globalThis.DongDaSiteSearch,registry=await loadSiteSearch(client);
const manifest=JSON.parse(await readFile(join(client,'content/site-search-routes.json'),'utf8'));
const index=JSON.parse(await readFile(join(client,'content/site-search-index.json'),'utf8'));
assert.equal(manifest.routes.length,3);assert.deepEqual(index.records,registry.records);assert.equal(index.records.length,25);
assert.deepEqual(index.scope,core.types);assert.equal(index.version,core.version);
const sitemap=await readFile(join(client,'sitemap.xml'),'utf8');
for(const route of manifest.routes){
  const document=parse(await readFile(join(client,route.path,'index.html'),'utf8')),active=nodes(document,n=>attribute(n,'class')==='page on');
  assert.equal(active.length,1);assert.equal(attribute(active[0],'id'),'page-search');
  assert.equal(plainText(nodes(active[0],n=>n.tagName==='h1')[0]),core.text('title',route.language));
  assert.equal(nodes(active[0],n=>attribute(n,'class')==='site-search-row').length,25);
  const meta=core.metadata(route.language,manifest.origin);assert.equal(attribute(nodes(document,n=>attribute(n,'rel')==='canonical')[0],'href'),meta.canonical);
  assert.equal(attribute(nodes(document,n=>attribute(n,'name')==='robots')[0],'content'),'noindex,follow');assert.equal(sitemap.includes('<loc>'+meta.canonical+'</loc>'),false);
  assert.deepEqual(JSON.parse(plainText(nodes(document,n=>attribute(n,'id')==='site-search-seo')[0])),meta.schema);
  for(const record of registry.records){const href=record.languagePaths[route.language];assert.equal(nodes(active[0],n=>attribute(n,'href')===href).length,1);const [path,anchor]=href.split('#');await access(join(client,path,'index.html'));if(anchor){const target=parse(await readFile(join(client,path,'index.html'),'utf8'));assert.equal(nodes(target,n=>attribute(n,'id')===anchor).length,1);}if(record.image)await access(join(client,record.image));}
  for(const link of nodes(document,n=>attribute(n,'data-site-search')!==undefined)){assert.equal(attribute(link,'href'),route.path);assert.equal(attribute(link,'title'),core.text('search',route.language));}
  for(const node of nodes(document,n=>n.tagName==='script'&&attribute(n,'type')!=='application/ld+json'&&!attribute(n,'src')))new Function(plainText(node));
}
const worker=(await import(pathToFileURL(resolve('dist/server/index.js')).href)).default;
const env={ASSETS:{fetch:async request=>{const path=new URL(request.url).pathname;return new Response(request.method==='HEAD'?null:path==='/404.html'?'NOT FOUND':'STATIC',{status:path==='/404.html'||manifest.routes.some(route=>path===route.path+'index.html')?200:404});}}};
for(const route of manifest.routes){
  assert.equal((await worker.fetch(new Request(manifest.origin+route.path+'?q=cement'),env)).status,200);
  const head=await worker.fetch(new Request(manifest.origin+route.path,{method:'HEAD'}),env);assert.equal(head.status,200);assert.equal(await head.text(),'');
  for(const path of [route.path.slice(0,-1),route.path+'index.html']){const response=await worker.fetch(new Request(manifest.origin+path+'?q=cement&type=product'),env);assert.equal(response.status,301);assert.equal(response.headers.get('location'),manifest.origin+route.path+'?q=cement&type=product');}
}
assert.equal((await worker.fetch(new Request(manifest.origin+'/en/search/unknown/'),env)).status,404);
assert.equal((await worker.fetch(new Request(manifest.origin+'/en/search/',{method:'POST'}),env)).status,405);
for(const privatePath of ['server/inquiry-service.mjs','cms/service.env','var/inquiries.sqlite','.env'])await assert.rejects(access(join(client,privatePath)));
process.stdout.write('Search audit passed: 3 localized pages, 25 source-backed public records, native links/anchors/noindex and exact worker routing.\n');
