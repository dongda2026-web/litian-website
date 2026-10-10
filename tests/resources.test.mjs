import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { parse } from 'parse5';
import { renderResourceDocument } from '../scripts/build-resource-pages.mjs';
import { nodes, attribute, plainText } from '../scripts/build-product-pages.mjs';

const products=JSON.parse(await readFile(new URL('../content/products.json',import.meta.url),'utf8'));
const data=JSON.parse(await readFile(new URL('../content/resources.json',import.meta.url),'utf8'));
const source=await readFile(new URL('../index.html',import.meta.url),'utf8');
const core=globalThis.DongDaResources,catalog=globalThis.DongDaCatalog.create(products),registry=core.create(data,catalog),origin='https://cn-dongda.com';

test('resource registry is trilingual, canonical, immutable and contains only buyer checklists',()=>{
  assert.deepEqual(core.validate(data,catalog),[]);assert.equal(registry.entries.length,4);
  assert.ok(Object.isFrozen(registry.entries[0].title));assert.throws(()=>registry.entries[0].title.en='changed');
  for(const entry of registry.entries){assert.equal(entry.kind,'request-checklist');assert.equal(catalog.resolve(entry.productId).id,entry.productId);assert.equal(entry.fieldIds.length,6);}
});
test('malformed envelopes, fields and translations fail without crashing validation',()=>{
  const invalid=[null,[],{}, {...data,secret:'private'}, {...data,fields:[null]}, {...data,entries:[null]}];
  for(const value of invalid){assert.ok(core.validate(value,catalog).length);assert.throws(()=>core.create(value,catalog));}
  for(const mutate of [x=>delete x.fields[0].label.ru,x=>x.fields[0].hint.en='a\nline',x=>x.fields[0].id='../x',x=>x.fields.push(x.fields[0]),x=>x.fields[0].extra=true,x=>x.entries[0].title.en='',x=>x.entries[0].summary.zh='x'.repeat(801)]){const value=structuredClone(data);mutate(value);assert.ok(core.validate(value,catalog).length);}
});
test('aliases, production references, duplicate IDs, unknown flags and invalid field references cannot be published',()=>{
  for(const mutate of [x=>x.entries[0].productId='fibc',x=>x.entries[0].productId='non-woven-bags',x=>x.entries[0].productId='materials-construction',x=>x.entries[0].productId='missing',x=>x.entries[0].approved=true,x=>x.entries[0].fieldIds.push('unknown'),x=>x.entries[0].fieldIds.push('size'),x=>x.entries.push(x.entries[0]),x=>x.entries[0].kind='certificate',x=>x.entries[0].version='2.0',x=>x.entries[0].updatedAt='2026-02-30',x=>x.entries[0].id="x');alert(1)"]){const value=structuredClone(data);mutate(value);assert.throws(()=>core.create(value,catalog));}
});
test('multilingual AND search intersects canonical product filters and preserves missing-resource empty state',()=>{
  assert.equal(registry.search({q:'FIBC размер'},'zh').length,1);
  assert.equal(registry.search({q:'阀口 灌装',product:'valve-bags'},'ru').length,1);
  assert.equal(registry.search({q:'FIBC',product:'valve-bags'},'en').length,0);
  assert.equal(registry.search({product:'non-woven-bags'},'en').length,0);
  assert.equal(registry.search({q:'不存在'},'zh').length,0);
  assert.equal(registry.selection({product:'fibc',q:'x'.repeat(200),sort:'bad'}).product,'fibc-bulk-bags');
  assert.equal(registry.selection({q:'x'.repeat(200)}).q.length,160);
  assert.equal(registry.selection({product:'../../',sort:'bad'}).sort,'newest');
  assert.equal(registry.search({sort:'name'},'en')[0].id,'printed-bag-request-checklist');
});
test('physical routes and real download paths allow only canonical entries and supported locales',()=>{
  for(const entry of registry.entries)for(const locale of core.languages){const path=core.path(entry,locale);assert.equal(registry.parsePath(path).entry.id,entry.id);assert.equal(registry.parsePath(path.slice(0,-1)).language,locale);assert.ok(core.filePath(entry,locale).endsWith('-'+locale+'-v1.txt'));}
  assert.equal(core.path(null,'kk'),'/en/resources/');
  for(const path of ['/en/resources/missing/','//en/resources/','/en/resources/%2f/','/kk/resources/','/en/resources/a/extra'])assert.equal(registry.parsePath(path),null);
  assert.throws(()=>core.path({id:'../secret'},'en'));assert.throws(()=>core.filePath({id:'safe',version:'bad'},'en'));
});
test('metadata remains noindex without invented certificates, offers or reviews',()=>{
  for(const entry of [null,...registry.entries])for(const locale of core.languages){const meta=core.metadata(entry,locale,origin,catalog);assert.equal(meta.robots,'noindex,follow');assert.equal(meta.alternates.length,3);assert.equal(meta.canonical,origin+core.path(entry,locale));assert.equal(meta.schema['@type'],'WebPage');assert.equal(meta.schema.offers,undefined);assert.equal(meta.schema.certification,undefined);}
  assert.throws(()=>core.metadata(null,'en','https://user:pass@example.com',catalog));
});
test('15 prerendered documents expose complete localized resource content and real files before scripts',()=>{
  for(const entry of [null,...registry.entries])for(const locale of core.languages){
    const doc=parse(renderResourceDocument(source,entry,locale,origin,catalog,registry));
    const active=nodes(doc,n=>attribute(n,'class')==='page on');assert.equal(active.length,1);
    assert.equal(attribute(active[0],'id'),entry?'page-resource-detail':'page-resources');
    assert.equal(plainText(nodes(active[0],n=>n.tagName==='h1')[0]),entry?entry.title[locale]:core.text('title',locale));
    assert.ok(plainText(active[0]).includes(core.text('notice',locale)));
    assert.equal(attribute(nodes(doc,n=>attribute(n,'name')==='robots')[0],'content'),'noindex,follow');
    assert.equal(attribute(nodes(doc,n=>attribute(n,'rel')==='canonical')[0],'href'),origin+core.path(entry,locale));
    assert.equal(nodes(doc,n=>attribute(n,'hreflang')).length,4);
    assert.equal(nodes(active[0],n=>attribute(n,'download')!==undefined).length,entry?1:4);
    if(entry){assert.equal(nodes(active[0],n=>n.tagName==='li').length,6);assert.ok(plainText(active[0]).includes(registry.fields[0].hint[locale]));}
  }
});
test('checklist files have exact localized prompts, stable version and no fabricated commercial approval',()=>{
  for(const entry of registry.entries)for(const locale of core.languages){const content=core.downloadText(entry,locale,registry);assert.ok(content.startsWith('DongDa / '));assert.ok(content.includes(entry.title[locale]));assert.ok(content.includes(core.text('notice',locale)));assert.equal(content.split(core.text('blank',locale)).length-1,6);assert.ok(content.endsWith('\n'));assert.equal(/leadId|SMTP|token=|ISO 21898|free sample/i.test(content),false);}
});
test('untrusted HTML and JSON-LD are escaped rather than executed',()=>{
  const value=structuredClone(data);value.entries[0].title.en='<img src=x onerror=alert(1)> & test';value.entries[0].summary.en='</script><script>alert(1)</script>';
  const reg=core.create(value,catalog),doc=parse(renderResourceDocument(source,reg.entries[0],'en',origin,catalog,reg));
  const active=nodes(doc,n=>attribute(n,'id')==='page-resource-detail')[0];assert.equal(nodes(active,n=>n.tagName==='img').length,1);assert.equal(plainText(nodes(active,n=>n.tagName==='h1')[0]),value.entries[0].title.en);
  assert.equal(nodes(doc,n=>n.tagName==='script'&&plainText(n)==='alert(1)').length,0);
  assert.equal(JSON.parse(plainText(nodes(doc,n=>attribute(n,'id')==='resource-seo')[0])).description,value.entries[0].summary.en);
});
test('public scripts parse, retain company milestones and remove fake download actions',async()=>{
  for(const doc of [parse(source),parse(core.overview('en',registry,catalog))])for(const node of nodes(doc,n=>n.tagName==='script'&&attribute(n,'type')!=='application/ld+json'&&!attribute(n,'src')))new Function(plainText(node));
  new Function(await readFile(new URL('../assets/js/resource-ui.js',import.meta.url),'utf8'));
  const document=parse(source),history=nodes(document,n=>attribute(n,'class')==='company-history-detail')[0];assert.equal(nodes(history,n=>attribute(n,'class')==='tl-item').length,20);
  const esg=nodes(document,n=>attribute(n,'data-i')==='sus_lnk')[0];assert.equal(attribute(esg,'onclick'),"nav('inquiry')");
  assert.ok(!source.includes("code:'DL',n:'Downloads',d:'Catalogs & documents',pg:'products'"));
});
test('resource URL restoration, filtering, reset and language updates reuse page navigation without storing personal data',async()=>{
  const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,focus(){this.focused=true;},classList:{contains:()=>id==='page-resources'}});return elements.get(id);};
  const history=[],links=[{}],context={resourceRegistry:registry,catalog,DongDaResources:core,DongDaProductPage:globalThis.DongDaProductPage,DONGDA_PUBLIC_SEO:{canonical:origin},lang:'en',routeRestoring:false,location:{pathname:'/en/resources/',search:'?product=fibc&q=FIBC&sort=name'},URLSearchParams,document:{getElementById:element,querySelector:()=>element('reset'),querySelectorAll:()=>links},history:{replaceState:(_a,_b,path)=>history.push(path)},nav:page=>{context.page=page;},updatePublicPageSeo:(meta)=>{context.meta=meta;}};
  runInNewContext(await readFile(new URL('../assets/js/resource-ui.js',import.meta.url),'utf8'),context);
  context.restoreResourcePage(context.location.pathname);assert.equal(context.resourceState.product,'fibc-bulk-bags');context.renderResourceLibrary();assert.ok(element('resource-rows').innerHTML.includes('fibc-request-checklist'));
  context.setResourceFilter('q','missing');assert.equal(element('resource-empty').hidden,false);assert.ok(history.at(-1).includes('q=missing'));
  context.lang='ru';context.syncResourceLanguage();assert.ok(history.at(-1).startsWith('/ru/resources/'));assert.ok(context.meta.canonical.endsWith('/ru/resources/'));assert.equal(element('resource-search').value,'missing');
  context.resetResourceFilters();assert.equal(element('resource-search').focused,true);assert.equal(context.resourceState.product,'all');assert.equal(history.at(-1),'/ru/resources/');
  context.navResources('valve-bags');assert.equal(context.page,'resources');context.navResource('valve-bag-request-checklist');assert.equal(context.page,'resource-detail');
  context.restoreResourcePage('/zh/resources/valve-bag-request-checklist/');assert.equal(context.openResource,'valve-bag-request-checklist');
  const ui=await readFile(new URL('../assets/js/resource-ui.js',import.meta.url),'utf8');assert.equal(/(?:local|session)Storage|fetch\(/.test(ui),false);
});
