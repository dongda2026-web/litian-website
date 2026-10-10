import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {parse} from 'parse5';
import {renderSelectionDocument} from '../scripts/build-selection-pages.mjs';
import {nodes,attribute,plainText} from '../scripts/build-product-pages.mjs';
import '../assets/js/procurement-core.js';
import '../assets/js/rfq-list-core.js';
const core=globalThis.DongDaSelection,products=JSON.parse(await readFile(new URL('../content/products.json',import.meta.url),'utf8')),catalog=globalThis.DongDaCatalog.create(products),engine=core.create(catalog);
const source=await readFile(new URL('../index.html',import.meta.url),'utf8'),ui=await readFile(new URL('../assets/js/selection-ui.js',import.meta.url),'utf8');
const ready={industry:'review',contents:'powder',filling:'spout',handling:'lifting',loadMode:'value',loadKg:'1000',barrier:'requested'};
test('selection strict keys, enums, types and independently validated load boundaries',()=>{
  assert.equal(core.validate(ready).loadKg,'1000');assert.equal(core.validate({...ready,loadKg:' 0.001 '}).loadKg,'0.001');
  for(const value of [null,[],{...ready,secret:'x'},{...ready,industry:'all'},{...ready,loadKg:10},Object.create(ready),new Date()])assert.throws(()=>core.validate(value));
  for(const loadKg of ['','0','-1','01','1e3','NaN','Infinity','1.0001','1000000','1,5','x'.repeat(25)])assert.throws(()=>core.validate({...ready,loadKg}),loadKg);
  assert.throws(()=>core.validate({...ready,loadMode:'review'}));assert.equal(core.errors(core.defaults,1).length,2);assert.ok(Object.isFrozen(core.validate(ready)));
});
test('all choice and error copy is trilingual, other languages fall back to English',()=>{
  for(const language of ['zh','en','ru']){assert.deepEqual(Object.keys(core.copy[language]).sort(),Object.keys(core.copy.en).sort());for(const[key,values]of Object.entries(core.options))for(const value of values)assert.notEqual(core.valueText(key,value,language),key+'_'+value);assert.ok(core.brief(ready,language).every(row=>row.label&&row.value));}
  assert.equal(core.path('kk'),'/en/selection/');assert.equal(core.text('title','kk'),core.text('title','en'));assert.throws(()=>core.copy.en.title='changed');
});
test('catalogue directions are stable structural candidates, never mass/barrier certifications',()=>{
  const rows=engine.directions(ready);assert.equal(rows.length,3);assert.equal(rows[0].product.id,'fibc-bulk-bags');assert.ok(rows.every(row=>row.product.homepage&&row.product.mediaRole!=='production-reference'));
  assert.deepEqual(engine.directions({...ready,barrier:'none'}).map(row=>row.product.id),rows.map(row=>row.product.id));
  assert.deepEqual(engine.directions({...ready,loadKg:'999999'}).map(row=>row.product.id),rows.map(row=>row.product.id));
  assert.deepEqual(engine.directions({...ready,contents:'review'}).map(row=>row.product.id),rows.map(row=>row.product.id));
  assert.ok(engine.clarifications({...ready,filling:'valve'}).includes('processReview'));assert.ok(engine.clarifications(ready).includes('loadReview'));assert.ok(engine.clarifications(ready).includes('barrierReview'));
  assert.equal(engine.clarifications({...ready,industry:'review',contents:'other',filling:'review',handling:'review',loadMode:'review',loadKg:'',barrier:'review'}).length,7);
  assert.throws(()=>core.create({all:catalog.all.filter(p=>p.family!=='bulk')}));assert.throws(()=>core.create({all:catalog.all.map(p=>p.homepage?{...p,mediaRole:'production-reference'}:p)}));
});
test('handoff preserves requirements, leaves quantity blank and uses exact existing configuration contract',()=>{
  for(const language of ['zh','en','ru'])for(const row of engine.directions(ready)){const demand=engine.handoff(ready,row.product.id,language);assert.equal(demand.productId,row.product.id);assert.equal(demand.customization.technicalAdvice,true);assert.equal(demand.customization.loadKg,'1000');assert.equal(demand.specifications.qty,undefined);assert.ok(demand.customization.notes.includes(core.text('barrier',language)));assert.deepEqual(globalThis.DongDaCustomization.validate(demand.customization),demand.customization);}
  assert.equal(engine.handoff(ready,'fibc-bulk-bags','en').specifications.capacity,'1000');assert.equal(engine.handoff({...ready,loadKg:'1000.001'},'fibc-bulk-bags','en').specifications.capacity,'review');
  assert.throws(()=>engine.handoff(ready,'non-woven-bags','en'));assert.throws(()=>engine.handoff(ready,'fibc','en'));
  const demand=engine.handoff(ready,'fibc-bulk-bags','en'),item={lineId:'line-12345678-1234-1234-1234-123456789012',...demand};
  const draft=globalThis.DongDaRfqList.draft([item],catalog);assert.equal(draft[0].specifications.qty,'');assert.throws(()=>globalThis.DongDaRfqList.items(draft,catalog,'en'));
  const serialized=globalThis.DongDaRfqList.serialize(draft,catalog);assert.equal(serialized.includes('customization'),false);assert.equal(serialized.includes(demand.customization.notes),false);
});
test('physical guide has native fallback links, exact locale metadata, no invented schema and original hooks',()=>{
  for(const language of ['en','zh','ru']){const html=renderSelectionDocument(source,language,'https://cn-dongda.com',catalog),document=parse(html),active=nodes(document,n=>attribute(n,'class')==='page on');assert.equal(active.length,1);assert.equal(attribute(active[0],'id'),'page-selection');assert.equal(plainText(nodes(active[0],n=>n.tagName==='h1')[0]),core.text('title',language));assert.equal(nodes(document,n=>attribute(n,'id')==='selection-seo').length,0);assert.equal(nodes(document,n=>attribute(n,'data-selection-link')!==undefined&&attribute(n,'href')===core.path(language)).length,2);const noScript=parse(html,{scriptingEnabled:false});assert.equal(nodes(noScript,n=>n.tagName==='noscript').flatMap(n=>nodes(n,x=>x.tagName==='a'&&(attribute(x,'href')||'').includes('/products/'))).length,3);assert.equal(core.metadata(language,'https://cn-dongda.com').robots,'noindex,follow');}
  for(const path of ['/kk/selection/','//zh/selection/','/zh/selection/missing/','/zh/selection/?load=1'])assert.equal(core.parsePath(path),null);assert.equal(core.parsePath('/ru/selection/index.html').language,'ru');assert.throws(()=>core.metadata('en','https://user:password@example.com'));
});
function fixture(){
  const elements=new Map(),calls=[],element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:'',hidden:false,focus(){this.focused=true;},removeAttribute(){},querySelector(){return element('button');}});return elements.get(id);};
  const context={DongDaSelection:core,DongDaSelectionView:globalThis.DongDaSelectionView,DongDaCustomization:globalThis.DongDaCustomization,DongDaRfqList:globalThis.DongDaRfqList,DongDaProductPage:globalThis.DongDaProductPage,DONGDA_PUBLIC_SEO:{canonical:'https://cn-dongda.com'},lang:'en',catalog,catalogState:{compare:[]},qState:{step:1,prodId:null,customization:{}},rfqListState:{items:[],busy:false},esc:globalThis.DongDaProductPage.escape,catalogIcon:()=>'<svg></svg>',fieldValue:id=>element(id).value,document:{getElementById:element,querySelectorAll:()=>[]},nav:page=>calls.push(page),qSelectProd:id=>{context.qState.prodId=id;},qNext:()=>{context.qState.step=2;},qReset:()=>{context.qState={step:1,prodId:null,customization:{}};calls.push('reset-quote');},addRfqProduct:(...args)=>calls.push(args),persistCatalogCompare:()=>calls.push('persist-compare'),renderCatalog(){},clearCatalogCompare(){context.catalogState.compare=[];},updatePublicPageSeo:meta=>{context.meta=meta;}};
  runInNewContext(ui,context);return{context,element,calls};
}
test('state flow rejects invalid steps, preserves language requirements and resets memory only',()=>{
  const{context:c,element}=fixture(),event={preventDefault(){}};c.nextSelectionStep(event);assert.equal(c.selectionState.step,1);assert.equal(element('selection-industry').focused,true);c.goSelectionStep(4);assert.equal(c.selectionState.step,1);
  for(const key of ['industry','contents'])c.setSelectionRequirement(key,ready[key]);c.nextSelectionStep(event);assert.equal(c.selectionState.step,2);
  for(const key of ['filling','handling'])c.setSelectionRequirement(key,ready[key]);c.nextSelectionStep(event);assert.equal(c.selectionState.step,3);
  for(const key of ['loadMode','barrier','loadKg'])c.setSelectionRequirement(key,ready[key]);c.nextSelectionStep(event);assert.equal(c.selectionState.step,4);c.nextSelectionStep(event);assert.equal(c.selectionState.step,4);
  c.lang='ru';c.renderSelection();assert.equal(c.selectionState.value.loadKg,'1000');assert.ok(element('page-selection').innerHTML.includes(core.text('results','ru')));c.goSelectionStep(1);c.setSelectionRequirement('industry','');c.goSelectionStep(4);assert.equal(c.selectionState.step,1);
  c.setSelectionRequirement('loadMode','review');assert.equal(c.selectionState.value.loadKg,'');c.resetSelection();assert.equal(c.selectionState.step,1);assert.equal(c.selectionState.value.industry,'');
  assert.equal(/(?:local|session)Storage|fetch\(|submitInquiry|submitRfq|submitSample/.test(ui),false);
});
test('existing quote draft keep/cancel/confirmed replace and busy guard preserve intent',()=>{
  const{context:c,element,calls}=fixture();c.selectionState.value={...ready};c.selectionState.step=4;c.renderSelection();c.qState.prodId='valve-bags';element('q-contact').value='Temporary fixture';c.prepareSelectionQuote('fibc-bulk-bags');assert.ok(c.selectionState.pendingQuote);assert.equal(c.qState.prodId,'valve-bags');assert.equal(calls.length,0);
  c.cancelSelectionQuote();assert.equal(c.selectionState.pendingQuote,null);assert.equal(element('q-contact').value,'Temporary fixture');c.prepareSelectionQuote('fibc-bulk-bags');c.keepSelectionQuote();assert.equal(c.selectionState.pendingQuote,null);assert.equal(c.qState.prodId,'valve-bags');assert.equal(calls.at(-1),'quote');
  c.prepareSelectionQuote('fibc-bulk-bags');c.qState.busy=true;c.confirmSelectionQuote();assert.equal(c.qState.prodId,'valve-bags');assert.ok(element('selection-status').textContent.includes(core.text('busy','en')));c.qState.busy=false;c.confirmSelectionQuote();assert.equal(c.qState.prodId,'fibc-bulk-bags');assert.equal(c.qState.qty,0);assert.equal(c.qState.specs.capacity,'1000');assert.equal(element('q-contact').value,'');assert.equal(c.qState.customization.technicalAdvice,true);assert.ok(calls.includes('reset-quote'));
});
test('RFQ appends through the existing engine, max/busy guards and comparison are shared',()=>{
  const{context:c,calls}=fixture();c.selectionState.value={...ready};c.selectionState.step=4;c.renderSelection();c.addSelectionRfq('fibc-bulk-bags');assert.equal(calls[0][0],'fibc-bulk-bags');assert.equal(calls[0][2].loadKg,'1000');assert.equal(c.rfqListState.items.length,0);
  c.rfqListState.busy=true;c.addSelectionRfq('fibc-bulk-bags');assert.equal(calls.length,1);c.rfqListState.busy=false;c.rfqListState.items=Array(20).fill({});c.addSelectionRfq('fibc-bulk-bags');assert.equal(calls.length,1);
  c.catalogState.compare=['custom-printed-bags','non-woven-bags','aluminum-foil-bags'];c.renderSelection();assert.ok(c.document.getElementById('page-selection').innerHTML.includes(engine.productName('custom-printed-bags','en')));c.clearSelectionCompare();assert.equal(c.catalogState.compare.length,0);c.toggleSelectionCompare('fibc-bulk-bags');assert.equal(c.catalogState.compare[0],'fibc-bulk-bags');assert.ok(calls.includes('persist-compare'));
  c.catalog={all:[]};c.renderSelection();assert.ok(c.document.getElementById('page-selection').innerHTML.includes(core.text('unavailable','en')));
});
