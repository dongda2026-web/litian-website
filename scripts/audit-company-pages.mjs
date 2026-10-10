import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parse} from 'parse5';
import {nodes,attribute,plainText} from './build-product-pages.mjs';
import './build-company-pages.mjs';
const client=resolve('dist/client'),core=globalThis.DongDaCompany,routes=JSON.parse(await readFile(join(client,'content/company-routes.json'),'utf8')),site=JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8')),sitemap=await readFile(join(client,'sitemap.xml'),'utf8');
assert.equal(routes.routes.length,6);assert.equal(routes.version,core.version);assert.equal(site.company_version,core.version);
for(const route of routes.routes){
  const document=parse(await readFile(join(client,route.path,'index.html'),'utf8')),active=nodes(document,n=>attribute(n,'class')==='page on');assert.equal(active.length,1);assert.equal(attribute(active[0],'id'),route.kind==='history'?'page-company-history':'page-about');
  assert.equal(attribute(nodes(document,n=>attribute(n,'rel')==='canonical')[0],'href'),routes.origin+route.path);assert.equal(attribute(nodes(document,n=>attribute(n,'name')==='robots')[0],'content'),'noindex,follow');assert.equal(sitemap.includes('<loc>'+routes.origin+route.path+'</loc>'),false);assert.equal(nodes(document,n=>attribute(n,'id')==='company-seo').length,0);
  if(route.kind==='history'){assert.equal(nodes(active[0],n=>attribute(n,'class')==='company-milestone').length,20);assert.equal(plainText(nodes(active[0],n=>n.tagName==='h1')[0]),core.text('history',route.language));}
  else assert.ok(plainText(nodes(active[0],n=>attribute(n,'id')==='about-body')[0]).length>50);
  assert.equal(nodes(document,n=>attribute(n,'class')==='tl-item').length,20);assert.equal(attribute(nodes(document,n=>attribute(n,'id')==='skip-main')[0],'href'),route.path+'#main-content');
  for(const language of core.languages)assert.ok(nodes(document,n=>attribute(n,'hreflang')===language&&attribute(n,'href')===routes.origin+core.path(route.kind,language)).length);
  for(const file of ['company-core','company-data','company-ui'])await access(join(client,'assets/js/'+file+'.js'));
  for(const node of nodes(document,n=>n.tagName==='script'&&attribute(n,'type')!=='application/ld+json'&&!attribute(n,'src')))new Function(plainText(node));
}
for(const file of site.pages){const document=parse(await readFile(join(client,file),'utf8')),language=attribute(nodes(document,n=>n.tagName==='html')[0],'lang');for(const link of nodes(document,n=>attribute(n,'data-company-link')!==undefined))assert.equal(attribute(link,'href'),core.path(attribute(link,'data-company-link'),language),file);}
const worker=(await import(pathToFileURL(resolve('dist/server/index.js')).href)).default,env={ASSETS:{fetch:async request=>{const path=new URL(request.url).pathname,exists=path==='/404.html'||routes.routes.some(route=>path===route.path+'index.html');return new Response(request.method==='HEAD'?null:exists?'STATIC':'MISSING',{status:exists?200:404});}}};
for(const route of routes.routes){assert.equal((await worker.fetch(new Request(routes.origin+route.path),env)).status,200);assert.equal(await(await worker.fetch(new Request(routes.origin+route.path,{method:'HEAD'}),env)).text(),'');for(const path of [route.path.slice(0,-1),route.path+'index.html']){const result=await worker.fetch(new Request(routes.origin+path+'?period=2020'),env);assert.equal(result.status,301);assert.equal(result.headers.get('location'),routes.origin+route.path+'?period=2020');}}
assert.equal((await worker.fetch(new Request(routes.origin+'/zh/company/missing/'),env)).status,404);assert.equal((await worker.fetch(new Request(routes.origin+'/zh/company/',{method:'POST'}),env)).status,405);
process.stdout.write(`Company audit passed: 6 physical routes, 20 milestones, ${site.pages.length} localized documents, noindex, 301/404/HEAD/405.\n`);
