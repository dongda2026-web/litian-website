import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {parse} from 'parse5';
import {renderFaqDocument,localizeFaqLinks} from '../scripts/build-faq-pages.mjs';
import {nodes,attribute,plainText} from '../scripts/build-product-pages.mjs';
const input={};for(const key of ['products','industries','resources','insights','faqs'])input[key]=JSON.parse(await readFile(new URL('../content/'+key+'.json',import.meta.url),'utf8'));
const core=globalThis.DongDaFAQ,catalog=globalThis.DongDaCatalog.create(input.products),insights=globalThis.DongDaInsights.create(input.insights,catalog),registry=core.create(input.faqs,catalog,insights),origin='https://cn-dongda.com';
const source=await readFile(new URL('../index.html',import.meta.url),'utf8');
test('eight immutable FAQ entries resolve existing trilingual answers without duplicate copy',()=>{
  assert.equal(registry.entries.length,8);assert.equal(new Set(registry.entries.map(entry=>entry.id)).size,8);
  for(const entry of registry.entries){assert.equal(entry.reviewStatus,'editorial-review-pending');assert.equal(entry.technicalReviewer,null);assert.ok(Object.isFrozen(entry.answer));assert.throws(()=>entry.answer.en='change');for(const locale of core.languages){assert.ok(entry.question[locale]);assert.ok(entry.answer[locale]);if(entry.sourceId)assert.equal(entry.answer[locale],insights.resolve(entry.sourceId).faq[entry.source.index].answer[locale]);else assert.equal(entry.answer[locale],globalThis.DongDaCatalogCopy.text(entry.source.key+'Answer',locale));}}
  assert.equal(registry.resolve('unknown'),null);
});
test('strict schema rejects malformed, missing and unknown envelope/entry/source fields',()=>{
  for(const value of [null,[],{}, {...input.faqs,secret:true},{...input.faqs,entries:[null]}])assert.throws(()=>core.create(value,catalog,insights));
  for(const mutate of [x=>x.reviewStatus='approved',x=>x.technicalReviewer='AI',x=>x.schemaVersion='v2',x=>delete x.entries[0].topic,x=>x.entries[0].id='../admin',x=>x.entries[0].approved=true,x=>x.entries[0].source.key='capacity',x=>x.entries[0].source.secret='x',x=>x.entries[2].source.index=-1,x=>x.entries[2].source.index=0.5,x=>x.entries[2].source.insightId='unknown',x=>x.entries[2].topic='samples',x=>x.entries[0].productIds=['fibc'],x=>x.entries[0].productIds.push('materials-construction'),x=>x.entries[1].id=x.entries[0].id,x=>x.entries.pop()]){const value=structuredClone(input.faqs);mutate(value);assert.throws(()=>core.create(value,catalog,insights));}
  const inherited=Object.create(input.faqs);assert.throws(()=>core.create(inherited,catalog,insights));
  const repeated=structuredClone(input.faqs);repeated.entries[1].source={key:'faqRequest',type:'catalog-copy'};assert.throws(()=>core.create(repeated,catalog,insights));
});
test('upstream missing translations and changed mappings fail closed',()=>{
  const broken={resolve(id){const entry=structuredClone(insights.resolve(id));delete entry.faq[0].answer.ru;return entry;}};assert.throws(()=>core.create(input.faqs,catalog,broken));
  const value=structuredClone(input.faqs);value.entries[2].productIds.reverse();assert.throws(()=>core.create(value,catalog,insights));
});
test('multilingual AND search intersects product and procurement topic',()=>{
  assert.equal(registry.search({topic:'samples'}).length,2);assert.equal(registry.search({product:'non-woven-bags'}).length,2);
  assert.equal(registry.search({topic:'samples',product:'custom-printed-bags'}).length,0);
  assert.ok(registry.search({q:'sample 样品',topic:'samples'}).length);assert.equal(registry.search({q:'sample missingxyz'}).length,0);
  assert.deepEqual(registry.search({}),registry.entries);assert.equal(registry.search({q:'ＦＩＢＣ'}).length,8);
});
test('selection and physical routes bound queries and reject unsafe anchors',()=>{
  assert.deepEqual(registry.selection({product:'fibc',topic:'../x',q:{private:1}}),{q:'',product:'all',topic:'all'});assert.equal(registry.selection({q:'x'.repeat(200)}).q.length,160);assert.equal(registry.selection({q:'a\u0000b'}).q,'a b');
  for(const locale of core.languages){assert.equal(registry.parsePath(core.path(locale)).language,locale);assert.equal(registry.parsePath(core.path(locale).slice(0,-1)).language,locale);}
  for(const path of ['/kk/faq/','/en/faq/unknown/','//en/faq/','/en/faq/?q=x'])assert.equal(registry.parsePath(path),null);
  assert.throws(()=>core.path('en','../x'));assert.equal(core.path('kk'),'/en/faq/');
});
test('physical FAQ includes all native answers, source and product links with no approval schema',()=>{
  for(const locale of core.languages){const document=parse(renderFaqDocument(source,locale,origin,{catalog,registry})),active=nodes(document,n=>attribute(n,'class')==='page on')[0];assert.equal(attribute(active,'id'),'page-faq');assert.equal(nodes(active,n=>n.tagName==='details').length,8);for(const entry of registry.entries)assert.ok(plainText(active).includes(entry.answer[locale]));assert.equal(attribute(nodes(active,n=>n.tagName==='form')[0],'action'),core.path(locale));const meta=core.metadata(locale,origin);assert.equal(meta.robots,'noindex,follow');assert.equal(meta.schema['@type'],'WebPage');for(const key of ['offers','review','author','datePublished','acceptedAnswer'])assert.equal(meta.schema[key],undefined);assert.equal(meta.canonical,origin+core.path(locale));}
  const document=parse('<div id="page-news"><section class="insight-heading W"><h1>Retain me</h1><p>Retain body</p></section></div>');localizeFaqLinks(document,'zh');localizeFaqLinks(document,'zh');assert.ok(plainText(document).includes('Retain me'));assert.ok(plainText(document).includes('Retain body'));assert.equal(nodes(document,n=>attribute(n,'data-faq-link')!==undefined).length,1);
});
test('FAQ text and metadata are escaped, not executable markup',()=>{
  const data=structuredClone(input.insights);data.entries[0].faq[0].question.en='<img src=x onerror=alert(1)>';data.entries[0].faq[0].answer.en='</script><script>alert(1)</script>';
  const reg=core.create(input.faqs,catalog,globalThis.DongDaInsights.create(data,catalog)),document=parse(renderFaqDocument(source,'en',origin,{catalog,registry:reg})),active=nodes(document,n=>attribute(n,'id')==='page-faq')[0];assert.ok(plainText(active).includes(data.entries[0].faq[0].answer.en));assert.equal(nodes(active,n=>n.tagName==='img').length,0);assert.equal(nodes(document,n=>n.tagName==='script'&&plainText(n)==='alert(1)').length,0);assert.throws(()=>core.metadata('en','https://user:password@example.com'));
});
test('search retains the four-source compatibility path and adds eight exact FAQ anchor results',()=>{
  const search=globalThis.DongDaSiteSearch.create(input);assert.equal(search.records.length,25);assert.equal(search.search({type:'faq'},'en').length,8);
  for(const entry of registry.entries){const row=search.resolve('faq:'+entry.id);assert.deepEqual(row.title,entry.question);assert.deepEqual(row.summary,entry.answer);assert.equal(row.image,null);for(const locale of core.languages)assert.equal(row.languagePaths[locale],core.path(locale,entry.id));}
  const legacy={...input};delete legacy.faqs;assert.equal(globalThis.DongDaSiteSearch.create(legacy).records.length,17);assert.throws(()=>globalThis.DongDaSiteSearch.create({...input,faqs:null}));
});
test('FAQ UI restores URL state, rejects filtered anchors, and uses existing navigation without storage/network',async()=>{
  const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',value:'',textContent:'',hidden:false,disabled:false,querySelectorAll:()=>[],focus(){this.focused=true;},classList:{contains:()=>id==='page-faq'}});return elements.get(id);};
  const history=[],calls=[],context={faqRegistry:registry,catalog,DongDaFAQ:core,DongDaSiteSearch:globalThis.DongDaSiteSearch,DongDaProductPage:globalThis.DongDaProductPage,DONGDA_PUBLIC_SEO:{canonical:origin},lang:'en',routeRestoring:false,location:{pathname:'/en/faq/',search:'?topic=samples&product=valve-bags',hash:'#question-sample-approval'},URLSearchParams,document:{getElementById:element,querySelector:()=>element('reset'),querySelectorAll:()=>[]},history:{replaceState:(_a,_b,path)=>history.push(path)},nav:page=>calls.push(page),setTimeout(){},updatePublicPageSeo:meta=>{context.meta=meta;}};
  const ui=await readFile(new URL('../assets/js/faq-ui.js',import.meta.url),'utf8');runInNewContext(ui,context);context.restoreFaqPage(context.location.pathname);context.renderFaq();assert.equal(context.faqQuestion,'sample-approval');assert.ok(context.faqTarget().includes('topic=samples#question-sample-approval'));
  context.setFaqFilter('product','custom-printed-bags');assert.equal(context.faqQuestion,null);assert.equal(element('faq-empty').hidden,false);assert.equal(context.faqTarget().includes('#'),false);
  context.lang='ru';context.syncFaqLanguage();assert.ok(history.at(-1).startsWith('/ru/faq/'));assert.equal(context.meta.robots,'noindex,follow');context.resetFaqFilters();assert.equal(history.at(-1),'/ru/faq/');assert.equal(element('faq-query').focused,true);
  assert.equal(context.navFaqQuestion('unknown'),false);assert.equal(context.navFaqQuestion('sample-address'),true);assert.equal(context.faqState.product,'all');assert.equal(calls.at(-1),'faq');context.navRfqList();assert.equal(calls.at(-1),'rfq');
  assert.equal(/(?:local|session)Storage|fetch\(|submitInquiry|submitRfq|submitSample/.test(ui),false);
});
