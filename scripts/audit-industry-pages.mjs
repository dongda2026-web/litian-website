import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'parse5';
import { nodes, attribute, plainText } from './build-product-pages.mjs';
import '../assets/js/industry-core.js';

const client=resolve('dist/client');
const catalog=globalThis.DongDaCatalog.create(JSON.parse(await readFile(join(client,'content/products.json'),'utf8')));
const core=globalThis.DongDaIndustry,industries=core.create(JSON.parse(await readFile(join(client,'content/industries.json'),'utf8')),catalog);
const manifest=JSON.parse(await readFile(join(client,'content/industry-routes.json'),'utf8'));
const sitemap=await readFile(join(client,'sitemap.xml'),'utf8'),redirects=await readFile(join(client,'_redirects'),'utf8');
assert.equal(manifest.routes.length,(industries.entries.length+1)*core.languages.length);
assert.equal(new Set(manifest.routes.map(route=>route.path)).size,manifest.routes.length);
for(const route of manifest.routes){
  const entry=route.industryId?industries.resolve(route.industryId):null,info=core.metadata(entry,route.language,manifest.origin,catalog);
  const document=parse(await readFile(join(client,route.path,'index.html'),'utf8'));
  const id=value=>nodes(document,n=>attribute(n,'id')===value)[0],active=id(entry?'page-industry-detail':'page-industries');
  assert.equal(attribute(active,'class'),'page on');
  assert.equal(plainText(nodes(active,n=>n.tagName==='h1')[0]),entry?entry.name[route.language]:core.text('title',route.language));
  assert.equal(nodes(document,n=>(attribute(n,'class')||'').split(' ').includes('page')&&(attribute(n,'class')||'').split(' ').includes('on')).length,1);
  assert.equal(attribute(nodes(document,n=>attribute(n,'rel')==='canonical')[0],'href'),info.canonical);
  assert.equal(attribute(nodes(document,n=>attribute(n,'name')==='robots')[0],'content'),'noindex,follow');
  for(const alternate of info.alternates)assert.equal(nodes(document,n=>attribute(n,'hreflang')===alternate.language&&attribute(n,'href')===alternate.href).length,1);
  assert.deepEqual(JSON.parse(plainText(id('industry-seo'))),info.schema);
  assert.equal(route.indexable,false);assert.equal(sitemap.includes('<loc>'+info.canonical+'</loc>'),false);
  if(entry){
    assert.equal(nodes(active,n=>n.tagName==='details').length,2);
    assert.equal(nodes(active,n=>n.tagName==='article').length,entry.productIds.length);
    assert.equal(attribute(nodes(active,n=>n.tagName==='img')[0],'src'),'/'+catalog.resolve(entry.heroProductId).image);
    for(const requirement of entry.requirements)assert.ok(plainText(active).includes(requirement.body[route.language]));
  }
  assert.ok(redirects.includes(route.path.slice(0,-1)+' '+route.path+' 301'));
  for(const node of nodes(document,n=>n.tagName==='script'&&attribute(n,'type')!=='application/ld+json'&&!attribute(n,'src')))new Function(plainText(node));
  for(const node of nodes(document,n=>attribute(n,'src')||n.tagName==='link'&&attribute(n,'href')||n.tagName==='a'&&attribute(n,'data-industry-link')!==undefined||n.tagName==='a'&&attribute(n,'data-product-link')!==undefined)){
    const value=attribute(node,'src')||attribute(node,'href');if(/^(data:|https?:|#)/.test(value))continue;
    const pathname=new URL(value,manifest.origin+'/').pathname;await access(join(client,pathname,pathname.endsWith('/')?'index.html':''));
  }
}
const worker=(await import(pathToFileURL(resolve('dist/server/index.js')).href)).default;
const paths=new Set(manifest.routes.map(route=>route.path+'index.html'));
const env={ASSETS:{fetch:async request=>new Response(paths.has(new URL(request.url).pathname)?'INDUSTRY':'NOT-FOUND',{status:paths.has(new URL(request.url).pathname)||new URL(request.url).pathname==='/404.html'?200:404,headers:{'Content-Type':'text/html'}})}};
for(const route of manifest.routes){
  assert.equal((await worker.fetch(new Request(manifest.origin+route.path),env)).status,200);
  for(const pathname of [route.path.slice(0,-1),route.path+'index.html']){const response=await worker.fetch(new Request(manifest.origin+pathname+'?source=audit'),env);assert.equal(response.status,301);assert.equal(response.headers.get('location'),manifest.origin+route.path+'?source=audit');}
}
assert.equal((await worker.fetch(new Request(manifest.origin+'/en/industries/missing/'),env)).status,404);
process.stdout.write(`Industry audit passed: ${manifest.routes.length} localized HTML routes, exact product/application links, native FAQ, review-pending noindex and delivery semantics.\n`);
