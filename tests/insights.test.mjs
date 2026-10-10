import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { parse } from 'parse5';
import { renderInsightDocument } from '../scripts/build-insight-pages.mjs';
import { nodes, attribute, plainText } from '../scripts/build-product-pages.mjs';

const products=JSON.parse(await readFile(new URL('../content/products.json',import.meta.url),'utf8'));
const data=JSON.parse(await readFile(new URL('../content/insights.json',import.meta.url),'utf8'));
const source=await readFile(new URL('../index.html',import.meta.url),'utf8');
const core=globalThis.DongDaInsights,catalog=globalThis.DongDaCatalog.create(products),registry=core.create(data,catalog),origin='https://cn-dongda.com';

test('insight registry contains complete immutable trilingual buyer guides only',()=>{
  assert.deepEqual(core.validate(data,catalog),[]);assert.equal(registry.entries.length,3);
  for(const entry of registry.entries){assert.equal(entry.kind,'buyer-guide');assert.equal(entry.reviewStatus,'editorial-review-pending');assert.equal(entry.sections.length,4);assert.equal(entry.faq.length,2);assert.ok(Object.isFrozen(entry.sections[0].body));assert.throws(()=>entry.title.en='change');}
  assert.equal(core.create({...data,entries:[]},catalog).search({},'zh').length,0);
});
test('malformed insight envelopes and nested records fail closed without throwing in validation',()=>{
  for(const value of [null,[],{}, {...data,secret:true},{...data,entries:[null]}, {...data,entries:Array(51).fill(data.entries[0])}]){assert.ok(core.validate(value,catalog).length);assert.throws(()=>core.create(value,catalog));}
  for(const mutate of [x=>x.entries[0].sections=[null],x=>x.entries[0].faq=[null],x=>x.entries[0].productIds=null,x=>x.entries[0].sections=null,x=>x.entries[0].faq=null,x=>delete x.entries[0].title.ru,x=>x.entries[0].sections[0].body.zh='',x=>x.entries[0].faq[0].answer.en='x'.repeat(1001),x=>x.entries[0].title.en='a\nb',x=>x.entries[0].updatedAt='2026-02-30']){const value=structuredClone(data);mutate(value);assert.ok(core.validate(value,catalog).length);}
});
test('unknown publication flags, aliases and unsafe image bindings cannot be introduced',()=>{
  for(const mutate of [x=>x.entries[0].approved=true,x=>x.entries[0].kind='company-news',x=>x.entries[0].reviewStatus='approved',x=>x.entries[0].topic='certificate',x=>x.entries[0].productIds=['fibc'],x=>x.entries[0].productIds.push('missing'),x=>x.entries[0].productIds.push(x.entries[0].productIds[0]),x=>x.entries[0].heroProductId='non-woven-bags',x=>x.entries[0].heroProductId='valve',x=>x.entries[0].sections[0].id='../secret',x=>x.entries[0].sections[0].id='questions',x=>x.entries[0].sections.push(x.entries[0].sections[0]),x=>x.entries.push(x.entries[0]),x=>x.entries[0].id="x');alert(1)"]){const value=structuredClone(data);mutate(value);assert.throws(()=>core.create(value,catalog));}
});
test('AND search spans the three languages and intersects topics and sort',()=>{
  assert.equal(registry.search({q:'颜色 printing',topic:'customization'},'ru')[0].id,'describe-custom-packaging');
  assert.equal(registry.search({q:'recipient 样品',topic:'samples'},'en')[0].id,'plan-sample-request');
  assert.equal(registry.search({q:'recipient',topic:'procurement'},'en').length,0);
  assert.equal(registry.search({q:'不存在'},'zh').length,0);
  assert.equal(registry.selection({q:'x'.repeat(200),topic:'../private',sort:'bad'}).q.length,160);
  assert.equal(registry.selection({topic:'bad'}).topic,'all');
  assert.equal(registry.search({sort:'name'},'en')[0].id,'describe-custom-packaging');
});
test('insight paths are canonical and limited to supported locales and known IDs',()=>{
  for(const entry of [null,...registry.entries])for(const locale of core.languages){const path=core.path(entry,locale);assert.equal(registry.parsePath(path).entry?.id,entry?.id);assert.equal(registry.parsePath(path.slice(0,-1)).language,locale);}
  for(const path of ['/en/insights/unknown/','//en/insights/','/kk/insights/','/en/insights/%2f/','/en/insights/prepare-packaging-rfq/extra'])assert.equal(registry.parsePath(path),null);
  assert.equal(core.path(null,'kk'),'/en/insights/');assert.throws(()=>core.path({id:'../x'},'en'));
});
test('guide metadata is noindex with actual revision date but no fabricated event or author',()=>{
  for(const entry of [null,...registry.entries])for(const locale of core.languages){const meta=core.metadata(entry,locale,origin,catalog);assert.equal(meta.canonical,origin+core.path(entry,locale));assert.equal(meta.robots,'noindex,follow');assert.equal(meta.schema['@type'],'WebPage');assert.equal(meta.schema.dateModified,entry?.updatedAt);assert.equal(meta.alternates.length,3);for(const key of ['author','datePublished','offers','review','certification'])assert.equal(meta.schema[key],undefined);}
  assert.throws(()=>core.metadata(null,'en','https://user:password@example.com',catalog));
});
test('12 prerendered insight pages contain exact bodies, FAQ and native product/resource/TOC links',()=>{
  for(const entry of [null,...registry.entries])for(const locale of core.languages){
    const document=parse(renderInsightDocument(source,entry,locale,origin,catalog,registry)),active=nodes(document,n=>attribute(n,'class')==='page on');
    assert.equal(active.length,1);assert.equal(attribute(active[0],'id'),entry?'page-insight-detail':'page-news');
    assert.equal(plainText(nodes(active[0],n=>n.tagName==='h1')[0]),entry?entry.title[locale]:core.text('title',locale));
    assert.equal(attribute(nodes(document,n=>attribute(n,'rel')==='canonical')[0],'href'),origin+core.path(entry,locale));assert.equal(nodes(document,n=>attribute(n,'hreflang')).length,4);
    assert.ok(plainText(active[0]).includes(core.text('notice',locale)));
    if(entry){for(const section of entry.sections){assert.ok(plainText(active[0]).includes(section.body[locale]));const anchor=nodes(active[0],n=>attribute(n,'href')===core.path(entry,locale)+'#'+section.id);assert.equal(anchor.length,1);assert.equal(new URL(attribute(anchor[0],'href'),origin+'/').pathname,core.path(entry,locale));}
      assert.equal(nodes(active[0],n=>n.tagName==='details').length,entry.faq.length);
      for(const id of entry.productIds)assert.equal(nodes(active[0],n=>attribute(n,'href')===globalThis.DongDaProductPage.path(catalog.resolve(id),locale)).length,1);
      assert.equal(nodes(active[0],n=>attribute(n,'href')==='/'+locale+'/resources/').length,1);
    }else assert.equal(nodes(active[0],n=>attribute(n,'class')==='insight-card').length,3);
  }
});
test('untrusted guide text is escaped in body, attributes and JSON-LD',()=>{
  const value=structuredClone(data);value.entries[0].title.en='<img src=x onerror=alert(1)>';value.entries[0].sections[0].body.en='</script><script>alert(1)</script>';
  const reg=core.create(value,catalog),document=parse(renderInsightDocument(source,reg.entries[0],'en',origin,catalog,reg));
  const active=nodes(document,n=>attribute(n,'id')==='page-insight-detail')[0];assert.equal(nodes(active,n=>n.tagName==='img').length,1);assert.equal(plainText(nodes(active,n=>n.tagName==='h1')[0]),value.entries[0].title.en);
  assert.ok(plainText(active).includes(value.entries[0].sections[0].body.en));assert.equal(nodes(document,n=>n.tagName==='script'&&plainText(n)==='alert(1)').length,0);
  assert.equal(JSON.parse(plainText(nodes(document,n=>attribute(n,'id')==='insight-seo')[0])).name,value.entries[0].title.en);
});
test('old event runtime is removed while original company history and inquiry engine remain',()=>{
  assert.ok(!source.includes('const NEWS_DATA='));assert.ok(source.includes('function buildNews(){\n  renderInsightLibrary();'));
  const document=parse(source),history=nodes(document,n=>attribute(n,'class')==='company-history-detail')[0];assert.equal(nodes(history,n=>attribute(n,'class')==='tl-item').length,20);
  assert.ok(source.includes('restoreRfqList();'));assert.ok(source.includes('restoreSampleRequest();'));
  for(const node of nodes(document,n=>n.tagName==='script'&&attribute(n,'type')!=='application/ld+json'&&!attribute(n,'src')))new Function(plainText(node));
});
test('insight filter/reset/language/detail restoration reuse history and do not store contacts or submit data',async()=>{
  const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',hidden:false,disabled:false,focus(){this.focused=true;},classList:{contains:()=>id==='page-news'}});return elements.get(id);};
  const history=[],links=[{}],context={insightRegistry:registry,catalog,DongDaInsights:core,DongDaProductPage:globalThis.DongDaProductPage,DONGDA_PUBLIC_SEO:{canonical:origin},lang:'en',routeRestoring:false,location:{pathname:'/en/insights/',search:'?topic=samples&q=recipient&sort=name',hash:''},URLSearchParams,document:{getElementById:element,querySelector:()=>element('reset'),querySelectorAll:()=>links},history:{replaceState:(_a,_b,path)=>history.push(path)},nav:page=>{context.page=page;},updatePublicPageSeo:meta=>{context.meta=meta;}};
  const ui=await readFile(new URL('../assets/js/insight-ui.js',import.meta.url),'utf8');runInNewContext(ui,context);
  context.restoreInsightPage(context.location.pathname);context.renderInsightLibrary();assert.equal(context.insightState.topic,'samples');assert.ok(element('insight-rows').innerHTML.includes('plan-sample-request'));
  context.setInsightFilter('q','nothingmatches');assert.equal(element('insight-empty').hidden,false);assert.ok(history.at(-1).includes('q=nothingmatches'));
  context.lang='ru';context.syncInsightLanguage();assert.ok(history.at(-1).startsWith('/ru/insights/'));assert.equal(element('insight-search').value,'nothingmatches');assert.ok(context.meta.canonical.endsWith('/ru/insights/'));
  context.resetInsightFilters();assert.equal(element('insight-search').focused,true);assert.equal(history.at(-1),'/ru/insights/');
  context.navInsight('prepare-packaging-rfq');assert.equal(context.page,'insight-detail');context.navInsights();assert.equal(context.page,'news');
  context.location.pathname='/zh/insights/prepare-packaging-rfq/';context.location.hash='#configurations';context.restoreInsightPage(context.location.pathname);assert.equal(context.openInsight,'prepare-packaging-rfq');assert.equal(context.insightAnchor(registry.resolve(context.openInsight)),'#configurations');
  assert.equal(context.insightAnchor(registry.resolve('plan-sample-request')),'');context.location.hash='#unknown';assert.equal(context.insightAnchor(registry.resolve(context.openInsight)),'');
  assert.equal(/(?:local|session)Storage|fetch\(|submit/.test(ui),false);
});
