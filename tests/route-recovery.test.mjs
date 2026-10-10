import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parse as parseJs} from 'acorn';
import {parse} from 'parse5';
import {nodes,attribute,plainText} from '../scripts/build-product-pages.mjs';

const source=await readFile('index.html','utf8'),documentTree=parse(source),functions=new Map();
for(const script of nodes(documentTree,n=>n.tagName==='script'&&!attribute(n,'src')&&attribute(n,'type')!=='application/ld+json')){
  const code=plainText(script);for(const item of parseJs(code,{ecmaVersion:'latest'}).body)if(item.type==='FunctionDeclaration')functions.set(item.id.name,code.slice(item.start,item.end));
}
const copyContext={};vm.runInNewContext(await readFile('assets/js/public-procurement-core.js','utf8'),copyContext,{timeout:500});const copy=copyContext.DongDaPublicProcurement;
test('recovery copy is strict frozen trilingual text with existing other-language fallback',()=>{
  for(const key of ['missingTitle','missingDescription','missingProducts','missingInquiry']){
    for(const locale of ['zh','en','ru'])assert.ok(copy.text(key,locale).trim());
    for(const locale of ['kk','ky','tg','tk','uz','__proto__','constructor',null])assert.equal(copy.text(key,locale),copy.text(key,'en'));
  }assert.ok(Object.isFrozen(copy));assert.throws(()=>copy.text('missingUnknown','en'),{name:'TypeError'});
});
test('recovery owns one native page with real product/inquiry actions and no raw URL echo',()=>{
  const pages=nodes(documentTree,n=>attribute(n,'id')==='page-not-found');assert.equal(pages.length,1);assert.match(attribute(pages[0],'class'),/\bpage\b/);
  const actions=nodes(pages[0],n=>n.tagName==='a');assert.deepEqual(actions.map(n=>attribute(n,'href')),['/#products','/#inquiry']);
  assert.deepEqual(actions.map(n=>attribute(n,'onclick')),["nav('products');return false;","nav('inquiry');return false;"]);
  assert.equal(nodes(pages[0],n=>n.tagName==='h1').length,1);assert.equal(nodes(pages[0],n=>attribute(n,'data-route-copy')).length,4);assert.equal(nodes(pages[0],n=>attribute(n,'data-public-copy')).length,0);
  assert.doesNotMatch(functions.get('updateMissingRouteSeo'),/location\.|innerHTML|schema:/);assert.match(functions.get('updateMissingRouteSeo'),/robots:'noindex,follow'/);
});
function navFixture(){
  const events=[],pages=new Map(),qState={prodId:'',notes:'private unsent draft'},rfqListState={items:['independent rfq line']};
  for(const node of nodes(documentTree,n=>attribute(n,'class')?.split(/\s/).includes('page'))){const id=attribute(node,'id');pages.set(id,{id,classList:{contains:value=>value==='page',add:()=>events.push(['activate',id]),remove(){}}});}
  const api={closeForNavigation:()=>{},focusPage:()=>events.push(['focus']),scrollPage:()=>{}};
  const context={document:{getElementById:id=>pages.get(id)||null,querySelectorAll:()=>[...pages.values()],querySelector:selector=>{events.push(['selector',selector]);return null;}},window:{DongDaPublicAccessibility:api},DongDaPublicAccessibility:api,qState,rfqListState,lang:'en',routeRestoring:true,openProd:null,openIndustry:null,openResource:null,openInsight:null,dynamicContent:{pendingInquiryProductId:''},sampleState:{productId:''},location:{pathname:'/',search:'',hash:'#unavailable'},history:{replaceState:(_,__,target)=>events.push(['replace',target]),pushState:(_,__,target)=>events.push(['push',target])},updateMissingRouteSeo:()=>events.push(['unavailable-seo']),updateCatalogSeo:()=>{},updateIndustrySeo:()=>{},updateResourceSeo:()=>{},updateInsightSeo:()=>{},industryCatalog:{resolve:()=>null},resourceRegistry:{resolve:()=>null},insightRegistry:{resolve:()=>null},DongDaIndustry:{path:()=>'/en/industries/'},resourceTarget:()=>'/en/resources/',insightTarget:()=>'/en/insights/',renderInsightLibrary:()=>{},renderResourceLibrary:()=>{},obs:()=>{},buildProdL2:()=>{},setTimeout(){},catalog:{resolve:()=>null}};
  vm.runInNewContext(functions.get('nav'),context,{timeout:500});return {context,events,pages,qState,rfqListState};
}
test('actual router never interpolates unknown fragment into a selector or blanks all pages',()=>{
  for(const input of ['unknown', 'x"]<script>alert(1)</script>', '__proto__','constructor',null,{},'x'.repeat(2048)]){
    const fixture=navFixture();fixture.context.nav(input);assert.deepEqual(fixture.events.filter(e=>e[0]==='activate'),[['activate','page-not-found']]);
    assert.ok(fixture.events.some(e=>e[0]==='unavailable-seo'));assert.ok(fixture.events.filter(e=>e[0]==='selector').every(e=>e[1]==='[data-nav="not-found"]'));
    assert.equal(fixture.events.some(e=>e[0]==='push'||e[0]==='replace'),false);assert.equal(fixture.qState.notes,'private unsent draft');assert.deepEqual(fixture.rfqListState.items,['independent rfq line']);
  }
});
test('a non-page DOM ID and empty internal entities recover to genuine available surfaces',()=>{
  const fake=navFixture();fake.pages.set('page-fake',{classList:{contains:()=>false,remove(){}}});fake.context.nav('fake');assert.ok(fake.events.some(e=>e[1]==='page-not-found'));
  for(const [input,expected] of [['product-detail','products'],['industry-detail','industries'],['resource-detail','resources'],['insight-detail','news']]){const fixture=navFixture();fixture.context.nav(input);assert.ok(fixture.events.some(e=>e[0]==='activate'&&e[1]==='page-'+expected));}
});
function hashFixture(path='/',hash='#unavailable'){
  const events=[],context={routeRestoring:false,location:{pathname:path,search:'',hash},document:{getElementById:()=>null},nav:p=>events.push(['nav',p]),navProd:id=>events.push(['product',id]),focusRestoredPageAnchor:h=>events.push(['anchor',h]),setLangAll:l=>events.push(['language',l]),restoreCompanyPage:()=>null,restoreSelectionPage:()=>null,restoreFaqPage:()=>null,restoreResourcePage:()=>null,restoreInsightPage:()=>null,restoreSiteSearchPage:()=>null,DongDaProductPage:{parsePath:p=>p==='/en/products/fibc-bulk-bags/'?{language:'en',product:{id:'fibc-bulk-bags'}}:null},industryCatalog:{parsePath:()=>null},insightRegistry:{parsePath:()=>null},catalog:{resolve:()=>null}};
  vm.runInNewContext(functions.get('navFromHash'),context,{timeout:500});return {context,events};
}
test('actual hash restoration distinguishes missing root links from real physical entities',()=>{
  for(const hash of ['#unknown','#x%22%5D','#%E0%A4%A','#constructor']){const fixture=hashFixture('/',hash);fixture.context.navFromHash();assert.deepEqual(fixture.events,[['nav','not-found']]);assert.equal(fixture.context.routeRestoring,false);}
  const physical=hashFixture('/en/products/fibc-bulk-bags/','#pd-support');physical.context.navFromHash();assert.deepEqual(physical.events,[['language','en'],['product','fibc-bulk-bags'],['anchor','#pd-support']]);assert.equal(physical.context.routeRestoring,false);
  const home=hashFixture('/','');home.context.navFromHash();assert.deepEqual(home.events,[['nav','home']]);
});
test('legacy product identity hashes still resolve via the canonical existing router',()=>{
  const fixture=hashFixture('/','#product/FIBC');fixture.context.navFromHash();assert.deepEqual(fixture.events,[['product','FIBC']]);assert.equal(fixture.context.routeRestoring,false);
});
function anchorFixture({visible=true,belongs=true,connected=true}={}){
  const events=[],timers=[],page={contains:()=>belongs,classList:{contains:()=>true}},anchor={isConnected:connected,getClientRects:()=>visible?[{}]:[],scrollIntoView:options=>events.push(['scroll',options.block,options.behavior]),hasAttribute:()=>false,setAttribute:(k,v)=>events.push(['attribute',k,v]),focus:options=>events.push(['focus',options.preventScroll])};
  const context={document:{getElementById:id=>{events.push(['lookup',id]);return id==='pd-support'?anchor:null;},querySelector:()=>page},location:{pathname:'/en/products/fibc-bulk-bags/',search:'?source=synthetic'},history:{replaceState:(_,__,target)=>events.push(['replace',target])},setTimeout:fn=>timers.push(fn)};
  vm.runInNewContext(functions.get('focusRestoredPageAnchor'),context,{timeout:500});return {context,events,timers,page,anchor};
}
test('valid native anchors retain physical URL/query using replace and receive bounded focus',()=>{
  const fixture=anchorFixture();fixture.context.focusRestoredPageAnchor('#pd%2Dsupport');assert.ok(fixture.events.some(e=>e[0]==='replace'&&e[1]==='/en/products/fibc-bulk-bags/?source=synthetic#pd-support'));assert.equal(fixture.timers.length,1);fixture.timers[0]();assert.ok(fixture.events.some(e=>e[0]==='focus'&&e[1]===true));assert.ok(fixture.events.some(e=>e[0]==='scroll'&&e[2]==='instant'));
});
test('malformed, oversized, hidden and foreign anchors cannot change URL or focus',()=>{
  for(const input of [null,{},'#%E0%A4%A','#'+'x'.repeat(1024),'#__proto__','#x"]<script>']){const fixture=anchorFixture();fixture.context.focusRestoredPageAnchor(input);assert.equal(fixture.events.some(e=>e[0]==='replace'||e[0]==='focus'),false);}
  for(const options of [{visible:false},{belongs:false}]){const fixture=anchorFixture(options);fixture.context.focusRestoredPageAnchor('#pd-support');assert.equal(fixture.timers.length,0);assert.equal(fixture.events.some(e=>e[0]==='replace'),false);}
  const stale=anchorFixture({connected:false});stale.context.focusRestoredPageAnchor('#pd-support');stale.timers[0]();assert.equal(stale.events.some(e=>e[0]==='focus'),false);
  const switched=anchorFixture();switched.context.focusRestoredPageAnchor('#pd-support');switched.page.classList.contains=()=>false;switched.timers[0]();assert.equal(switched.events.some(e=>e[0]==='focus'),false);
});
test('shared actual SEO helper replaces every dynamic schema without removing the organization',async()=>{
  const ui=await readFile('assets/js/catalog-ui.js','utf8'),fn=parseJs(ui,{ecmaVersion:'latest'}).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='updatePublicPageSeo'),children=[],canonical={href:''};
  function node(tag,id=''){const n={tagName:tag,id,setAttribute(k,v){this[k]=v;},remove(){const i=children.indexOf(this);if(i>=0)children.splice(i,1);}};children.push(n);return n;}
  for(const id of ['product-seo','industry-seo','resource-seo','insight-seo','site-search-seo','faq-seo','company-seo','selection-seo','organization-original'])node('script',id);
  const head={querySelector:selector=>selector==='link[rel="canonical"]'?canonical:null,querySelectorAll:selector=>selector.startsWith('#')?children.filter(n=>selector.split(',').includes('#'+n.id)):children.filter(n=>n['data-product-alternate']!==undefined),appendChild(n){if(!children.includes(n))children.push(n);}};
  const context={document:{head,createElement:tag=>node(tag),title:''}};vm.runInNewContext(ui.slice(fn.start,fn.end),context,{timeout:500});
  const meta={title:'Synthetic available page',description:'Plain text',canonical:'https://cn-dongda.com/en/company/',locale:'en_US',image:null,robots:'noindex,follow',alternates:[],schema:{'@type':'WebPage'}};
  context.updatePublicPageSeo(meta,'website','company-seo',null);context.updatePublicPageSeo(meta,'website','company-seo',null);
  assert.equal(children.filter(n=>n.id==='company-seo').length,1);assert.equal(children.filter(n=>n.tagName==='script').length,2);assert.ok(children.some(n=>n.id==='organization-original'));
  context.updatePublicPageSeo({...meta,schema:null},'website',null,null);assert.deepEqual(children.filter(n=>n.tagName==='script').map(n=>n.id),['organization-original']);
});
