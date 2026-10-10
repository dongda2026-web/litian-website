import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { parse } from 'parse5';
import { nodes, attribute, plainText } from './build-product-pages.mjs';
import '../assets/js/resource-core.js';
import '../assets/js/insight-core.js';

const root=process.cwd(),client=join(root,'dist/client'),core=globalThis.DongDaInsights;
const catalog=globalThis.DongDaCatalog.create(JSON.parse(await readFile(join(root,'content/products.json'),'utf8')));
const registry=core.create(JSON.parse(await readFile(join(root,'content/insights.json'),'utf8')),catalog);
const manifest=JSON.parse(await readFile(join(client,'content/insight-routes.json'),'utf8'));
assert.equal(manifest.version,core.version);assert.equal(manifest.routes.length,(registry.entries.length+1)*3);
const sitemap=await readFile(join(client,'sitemap.xml'),'utf8');
for(const route of manifest.routes){
  const entry=registry.resolve(route.insightId),locale=route.language,html=await readFile(join(client,route.path,'index.html'),'utf8'),document=parse(html);
  assert.equal(route.path,core.path(entry,locale));assert.equal(route.indexable,false);assert.ok(!sitemap.includes(route.path));assert.ok(!html.includes('const NEWS_DATA='));
  const active=nodes(document,n=>attribute(n,'class')==='page on');assert.equal(active.length,1);
  assert.equal(attribute(active[0],'id'),entry?'page-insight-detail':'page-news');
  assert.equal(plainText(nodes(active[0],n=>n.tagName==='h1')[0]),entry?entry.title[locale]:core.text('title',locale));
  assert.equal(attribute(nodes(document,n=>attribute(n,'name')==='robots')[0],'content'),'noindex,follow');
  assert.equal(attribute(nodes(document,n=>attribute(n,'rel')==='canonical')[0],'href'),manifest.origin+route.path);
  assert.equal(nodes(document,n=>attribute(n,'hreflang')).length,4);
  for(const image of nodes(active[0],n=>n.tagName==='img'))await access(join(client,attribute(image,'src')));
  if(entry){for(const section of entry.sections)assert.ok(plainText(active[0]).includes(section.body[locale]));assert.equal(nodes(active[0],n=>n.tagName==='details').length,entry.faq.length);}
}
assert.deepEqual(JSON.parse(await readFile(join(client,'content/news.json'),'utf8')),[]);
const index=JSON.parse(await readFile(join(client,'content/content-index.json'),'utf8'));
assert.equal(index.counts.news,0);assert.equal(index.counts.insights,registry.entries.length);assert.equal(index.records.filter(record=>record.type==='news').length,0);
const data=await readFile(join(client,'assets/js/catalog-data.js'),'utf8');assert.ok(data.includes('DONGDA_INSIGHT_DATA='));assert.ok(!data.includes('High-strength valve bags pass cement industry certification'));
process.stdout.write(`Insights audit passed: ${manifest.routes.length} physical pages, exact bodies/metadata/images/FAQ; legacy news quarantined.\n`);
