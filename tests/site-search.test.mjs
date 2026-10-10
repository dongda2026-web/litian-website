import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { parse } from 'parse5';
import { renderSiteSearchDocument } from '../scripts/build-site-search-pages.mjs';
import { nodes, attribute, plainText } from '../scripts/build-product-pages.mjs';

const input={};
for(const key of ['products','industries','resources','insights'])input[key]=JSON.parse(await readFile(new URL('../content/'+key+'.json',import.meta.url),'utf8'));
const source=await readFile(new URL('../index.html',import.meta.url),'utf8');
const core=globalThis.DongDaSiteSearch,registry=core.create(input),origin='https://cn-dongda.com';

test('search composes 17 immutable canonical public entities without private or historical content',()=>{
  assert.equal(registry.records.length,17);assert.equal(new Set(registry.records.map(row=>row.id)).size,17);
  assert.deepEqual(core.types.map(type=>registry.search({type},'en').length),[6,4,4,3,0]);
  for(const row of registry.records){assert.ok(Object.isFrozen(row.languagePaths));assert.throws(()=>row.title.en='change');assert.equal(row.id,row.type+':'+row.entityId);assert.equal(Object.hasOwn(row,'contact'),false);}
  assert.equal(registry.resolve('product:technical-materials'),null);assert.equal(registry.resolve('news:legacy'),null);
});
test('strict envelope and upstream source validations reject unknown keys and translations',()=>{
  for(const value of [null,[],{}, {...input,private:true}])assert.throws(()=>core.create(value));
  for(const mutate of [x=>x.products[0].secret='x',x=>delete x.products[0].name.ru,x=>x.industries[0].publication='approved',x=>x.resources.entries[0].approved=true,x=>x.insights.entries[0].kind='company-news']){const value=structuredClone(input);mutate(value);assert.throws(()=>core.create(value));}
});
test('production-reference imagery is excluded and review states cannot imply approval',()=>{
  const pending=registry.records.filter(row=>row.reviewStatus==='supply-review-pending');assert.equal(pending.length,2);
  for(const row of pending){assert.equal(row.image,null);assert.equal(row.mediaRole,'production-reference');assert.ok(core.rows([row],'en').includes('Supply details / review pending'));assert.equal(core.rows([row],'en').includes('<img'),false);}
  assert.equal(registry.records.filter(row=>row.reviewStatus==='guidance-review-pending').length,11);
});
test('multilingual AND terms intersect content types and are deterministic',()=>{
  assert.equal(registry.search({q:'颜色 printing',type:'insight'},'ru')[0].entityId,'describe-custom-packaging');
  assert.equal(registry.search({q:'recipient 样品',type:'insight'},'en')[0].entityId,'plan-sample-request');
  assert.equal(registry.search({q:'recipient 样品',type:'product'},'en').length,0);
  assert.equal(registry.search({q:'nothingmatchesxyz'},'zh').length,0);
  assert.equal(registry.search({q:'ＦＩＢＣ',type:'product'},'zh')[0].entityId,'fibc-bulk-bags');
  assert.deepEqual(registry.search({},'ru'),registry.search({},'ru'));
});
test('relevance prefers exact title and explicit title sorting is localized',()=>{
  assert.equal(registry.search({q:'FIBC Bulk Bags'},'en')[0].id,'product:fibc-bulk-bags');
  for(const locale of core.languages){const records=registry.search({sort:'name'},locale);assert.deepEqual(records.map(row=>row.title[locale]),records.map(row=>row.title[locale]).sort((a,b)=>a.localeCompare(b,locale)));}
});
test('selection bounds text, strips controls, and rejects unsupported enum values',()=>{
  assert.equal(core.selection({q:'x'.repeat(200)}).q.length,160);assert.equal(core.selection({q:'a\u0000b\nc'}).q,'a b c');
  assert.deepEqual(core.selection({q:{secret:1},type:'../admin',sort:'bad'}),{q:'',type:'all',sort:'relevance'});
  assert.deepEqual(core.selection(null),{q:'',type:'all',sort:'relevance'});
});
test('search routing supports only canonical public locales and metadata excludes query state',()=>{
  for(const locale of core.languages){assert.equal(registry.parsePath(core.path(locale)).language,locale);assert.equal(registry.parsePath(core.path(locale).slice(0,-1)).language,locale);const meta=core.metadata(locale,origin);assert.equal(meta.canonical,origin+core.path(locale));assert.equal(meta.robots,'noindex,follow');assert.equal(meta.alternates.length,3);assert.equal(meta.schema['@type'],'WebPage');for(const key of ['offers','review','certification','author'])assert.equal(meta.schema[key],undefined);}
  for(const path of ['/kk/search/','//en/search/','/en/search/x','/en/search/%2f/','/en/search/?q=x'])assert.equal(registry.parsePath(path),null);
  assert.throws(()=>core.metadata('en','https://user:password@example.com'));assert.equal(core.path('kk'),'/en/search/');
});
test('three prerendered search pages retain all native entity links and form action',()=>{
  for(const locale of core.languages){const document=parse(renderSiteSearchDocument(source,locale,origin,registry)),active=nodes(document,n=>attribute(n,'class')==='page on');assert.equal(active.length,1);assert.equal(attribute(active[0],'id'),'page-search');assert.equal(plainText(nodes(active[0],n=>n.tagName==='h1')[0]),core.text('title',locale));assert.equal(nodes(active[0],n=>attribute(n,'class')==='site-search-row').length,17);assert.equal(attribute(nodes(active[0],n=>n.tagName==='form')[0],'action'),core.path(locale));for(const row of registry.records)assert.equal(nodes(active[0],n=>attribute(n,'href')===row.languagePaths[locale]).length,1);assert.equal(nodes(document,n=>attribute(n,'data-site-search')!==undefined).length,3);}
});
test('untrusted source text is escaped and never becomes markup or executable JSON-LD',()=>{
  const value=structuredClone(input);value.products[0].name.en='<img src=x onerror=alert(1)>';value.products[0].summary.en='</script><script>alert(1)</script>';
  const records=core.create(value),document=parse(renderSiteSearchDocument(source,'en',origin,records)),active=nodes(document,n=>attribute(n,'id')==='page-search')[0];
  assert.ok(plainText(active).includes(value.products[0].name.en));assert.ok(plainText(active).includes(value.products[0].summary.en));assert.equal(nodes(active,n=>n.tagName==='img'&&attribute(n,'src')==='x').length,0);assert.equal(nodes(document,n=>n.tagName==='script'&&plainText(n)==='alert(1)').length,0);
});
test('shared navigation parses and preserves company history and demand engines',()=>{
  const document=parse(source),history=nodes(document,n=>attribute(n,'class')==='company-history-detail')[0];assert.equal(nodes(history,n=>attribute(n,'class')==='tl-item').length,20);
  assert.ok(source.includes('restoreRfqList();'));assert.ok(source.includes('restoreSampleRequest();'));assert.ok(source.includes('initialSearchPage=restoreSiteSearchPage(location.pathname)'));
  for(const node of nodes(document,n=>n.tagName==='script'&&attribute(n,'type')!=='application/ld+json'&&!attribute(n,'src')))new Function(plainText(node));
});
test('UI filter/reset/submit/language and restoration preserve public URL state without storage or API',async()=>{
  const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',hidden:false,disabled:false,focus(){this.focused=true;},classList:{contains:()=>id==='page-search'}});return elements.get(id);};
  const history=[],links=[{classList:{contains:()=>false},setAttribute(){}}],calls=[];
  const context={siteSearchRegistry:registry,DongDaSiteSearch:core,DongDaProductPage:globalThis.DongDaProductPage,DONGDA_PUBLIC_SEO:{canonical:origin},lang:'en',routeRestoring:false,location:{pathname:'/en/search/',search:'?type=insight&q=recipient&sort=name'},URLSearchParams,document:{getElementById:element,querySelector:()=>element('reset'),querySelectorAll:()=>links},history:{replaceState:(_a,_b,path)=>history.push(path)},nav:page=>calls.push(['nav',page]),updatePublicPageSeo:meta=>{context.meta=meta;},navProd:id=>calls.push(['product',id]),navIndustry:id=>calls.push(['industry',id]),navResource:id=>calls.push(['resource',id]),navInsight:id=>calls.push(['insight',id])};
  const ui=await readFile(new URL('../assets/js/site-search-ui.js',import.meta.url),'utf8');runInNewContext(ui,context);
  context.restoreSiteSearchPage(context.location.pathname);context.renderSiteSearch();assert.equal(context.siteSearchState.type,'insight');assert.ok(element('site-search-results').innerHTML.includes('plan-sample-request'));
  context.setSiteSearchFilter('q','nothingmatches');assert.equal(element('site-search-empty').hidden,false);assert.ok(history.at(-1).includes('q=nothingmatches'));
  context.lang='ru';context.syncSiteSearchLanguage();assert.ok(history.at(-1).startsWith('/ru/search/'));assert.equal(element('site-search-query').value,'nothingmatches');assert.ok(context.meta.canonical.endsWith('/ru/search/'));
  element('site-search-query').value='  printing  ';let prevented=false;context.submitSiteSearch({preventDefault(){prevented=true;}});assert.ok(prevented);assert.equal(context.siteSearchState.q,'printing');
  context.resetSiteSearchFilters();assert.equal(history.at(-1),'/ru/search/');assert.equal(element('site-search-query').focused,true);context.navSiteSearch();assert.deepEqual(calls.at(-1),['nav','search']);
  for(const type of core.types){const row=registry.records.find(row=>row.type===type);if(!row)continue;assert.equal(context.openSiteSearchResult(row.id),true);assert.deepEqual(calls.at(-1),[type,row.entityId]);}assert.equal(context.openSiteSearchResult('unknown'),false);
  assert.equal(/(?:local|session)Storage|fetch\(|submitInquiry|submitRfq|submitSample/.test(ui),false);
});
