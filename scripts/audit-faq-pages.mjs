import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parse} from 'parse5';
import {nodes,attribute,plainText} from './build-product-pages.mjs';
import {loadFaq} from './build-faq-pages.mjs';

const client=resolve('dist/client'),core=globalThis.DongDaFAQ,data=await loadFaq(client);
const manifest=JSON.parse(await readFile(join(client,'content/faq-routes.json'),'utf8')),site=JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8'));
assert.equal(manifest.version,core.version);assert.equal(manifest.routes.length,3);assert.equal(site.faq_version,core.version);assert.equal(site.build_version,core.version);
const sitemap=await readFile(join(client,'sitemap.xml'),'utf8');
for(const route of manifest.routes){
  const document=parse(await readFile(join(client,route.path,'index.html'),'utf8')),active=nodes(document,n=>attribute(n,'class')==='page on');
  assert.equal(active.length,1);assert.equal(attribute(active[0],'id'),'page-faq');assert.equal(plainText(nodes(active[0],n=>n.tagName==='h1')[0]),core.text('title',route.language));
  assert.equal(nodes(active[0],n=>n.tagName==='details').length,8);assert.equal(attribute(nodes(active[0],n=>n.tagName==='form')[0],'action'),route.path);
  const meta=core.metadata(route.language,manifest.origin);assert.equal(attribute(nodes(document,n=>attribute(n,'rel')==='canonical')[0],'href'),meta.canonical);assert.equal(attribute(nodes(document,n=>attribute(n,'name')==='robots')[0],'content'),'noindex,follow');assert.equal(sitemap.includes('<loc>'+meta.canonical+'</loc>'),false);assert.deepEqual(JSON.parse(plainText(nodes(document,n=>attribute(n,'id')==='faq-seo')[0])),meta.schema);
  for(const entry of data.registry.entries){const question=nodes(document,n=>attribute(n,'id')==='question-'+entry.id);assert.equal(question.length,1);assert.equal(plainText(nodes(question[0],n=>n.tagName==='summary')[0]),entry.question[route.language]);assert.ok(plainText(question[0]).includes(entry.answer[route.language]));assert.equal(entry.technicalReviewer,null);for(const id of entry.productIds)await access(join(client,globalThis.DongDaProductPage.path(data.catalog.resolve(id),route.language),'index.html'));}
  assert.equal(attribute(nodes(document,n=>attribute(n,'id')==='skip-main')[0],'href'),route.path+'#main-content');
  for(const node of nodes(document,n=>n.tagName==='script'&&attribute(n,'type')!=='application/ld+json'&&!attribute(n,'src')))new Function(plainText(node));
}
for(const file of site.pages){const document=parse(await readFile(join(client,file),'utf8')),locale=attribute(nodes(document,n=>n.tagName==='html')[0],'lang');assert.ok(nodes(document,n=>attribute(n,'data-faq-link')!==undefined&&attribute(n,'href')===core.path(locale)).length);}
const worker=(await import(pathToFileURL(resolve('dist/server/index.js')).href)).default;
const env={ASSETS:{fetch:async request=>{const url=new URL(request.url);const exists=url.pathname==='/404.html'||manifest.routes.some(route=>url.pathname===route.path+'index.html');return new Response(request.method==='HEAD'?null:exists?'STATIC':'MISSING',{status:exists?200:404});}}};
for(const route of manifest.routes){assert.equal((await worker.fetch(new Request(manifest.origin+route.path),env)).status,200);for(const path of [route.path.slice(0,-1),route.path+'index.html']){const response=await worker.fetch(new Request(manifest.origin+path+'?topic=samples'),env);assert.equal(response.status,301);assert.equal(response.headers.get('location'),manifest.origin+route.path+'?topic=samples');}}
assert.equal((await worker.fetch(new Request(manifest.origin+'/en/faq/unknown/'),env)).status,404);assert.equal((await worker.fetch(new Request(manifest.origin+'/en/faq/',{method:'POST'}),env)).status,405);
process.stdout.write(`FAQ audit passed: 3 physical pages, 8 exact-source answers per locale, ${site.pages.length} localized entries, noindex and exact routes.\n`);
