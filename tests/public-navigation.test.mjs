import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import vm from 'node:vm';
import {parse as parseJavaScript} from 'acorn';
import {parse} from 'parse5';
import {nodes,attribute,plainText} from '../scripts/build-product-pages.mjs';
import {localizeAccessibility} from '../scripts/build-public-accessibility.mjs';
import {auditNavigationDocument} from '../scripts/audit-public-navigation.mjs';

const core=globalThis.DongDaAccessibility,source=await readFile(join(process.cwd(),'index.html'),'utf8'),controller=await readFile(join(process.cwd(),'assets/js/public-accessibility.js'),'utf8');
test('back-to-top has immutable zh/en/ru labels and explicit existing language fallback',()=>{
  assert.equal(core.navigationVersion,'2026.10.09-navigation-v1');assert.ok(Object.isFrozen(core));
  for(const locale of ['zh','en','ru'])assert.ok(core.text('backToTop',locale).trim());
  for(const locale of ['kk','ky','tg','tk','uz','constructor','__proto__',null])assert.equal(core.text('backToTop',locale),'Back to top');
  assert.throws(()=>core.text('unknown-top','en'),TypeError);
});
test('every static locale owns one native ArrowUp action and the same six dialogs',()=>{
  for(const locale of ['zh','en','ru','kk','ky','tg','tk','uz']){const document=localizeAccessibility(parse(source),locale);assert.deepEqual(auditNavigationDocument(document,locale),{locale,backToTop:1,dialogs:6});}
});
function fixture(activePage=true){
  const document={activeElement:null},elements={},events=[];
  function element(id){const classes=new Set();return elements[id]={id,isConnected:true,tabIndex:0,hidden:false,inert:false,open:false,attributes:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,force){force?classes.add(x):classes.delete(x);}},setAttribute(name,value){this.attributes[name]=value;},getClientRects(){return this.hidden?[]:[{}];},closest(){return this.hidden||this.inert?this:null;},contains(node){return node===this;},focus(options){document.activeElement=this;events.push({kind:'focus',id,preventScroll:options.preventScroll});},scrollIntoView(options){events.push({kind:'scroll',id,block:options.block,behavior:options.behavior});},addEventListener(){},querySelector(){return elements.trigger;},querySelectorAll(){return[];},showModal(){this.open=true;},close(){this.open=false;}};}
  for(const id of [...Object.keys(core.dialogs),'nav-hamburger','nl-menu','nav-lang-btn','nav-lang-switch','ai-panel','ai-input','ai-fab','skip-main','main-content','heading','trigger','page'])element(id);
  document.activeElement=elements.trigger;document.body={style:{overflow:''}};document.getElementById=id=>elements[id];document.querySelectorAll=()=>[];document.addEventListener=()=>{};
  document.querySelector=selector=>selector==='.ai-fab'?elements['ai-fab']:selector==='.page.on'?activePage?elements.page:null:selector==='.page.on h1'?activePage?elements.heading:null:null;
  const window={DongDaAccessibility:core};vm.runInNewContext(controller,{window,document,location:{pathname:'/'},queueMicrotask:fn=>fn(),lang:'en'},{timeout:500});events.length=0;
  return{api:window.DongDaPublicAccessibility,document,elements,events};
}
test('actual shared controller scrolls the active page instantly without moving focus',()=>{
  const item=fixture();item.api.scrollPage();assert.deepEqual(item.events,[{kind:'scroll',id:'page',block:'start',behavior:'instant'}]);assert.equal(item.document.activeElement.id,'trigger');
  assert.doesNotMatch(controller,/\b(?:fetch|localStorage|sessionStorage|XMLHttpRequest)\b/);
});
test('explicit top action returns to active page and then focuses its heading without extra scroll',()=>{
  const item=fixture(),draft={notes:'synthetic unsent requirement',items:['fibc-bulk-bags']},before=structuredClone(draft);item.api.backToTop();
  assert.deepEqual(item.events,[{kind:'scroll',id:'page',block:'start',behavior:'instant'},{kind:'focus',id:'heading',preventScroll:true}]);assert.equal(item.document.activeElement.id,'heading');assert.deepEqual(draft,before);assert.equal(item.elements.heading.attributes.tabindex,'-1');
});
test('missing active page is safe and heading focus falls back to existing main content',()=>{
  const item=fixture(false);item.api.scrollPage();assert.deepEqual(item.events,[]);item.api.backToTop();assert.deepEqual(item.events,[{kind:'focus',id:'main-content',preventScroll:true}]);
});
let navSource;
for(const script of nodes(parse(source),n=>n.tagName==='script'&&!attribute(n,'src')&&attribute(n,'type')!=='application/ld+json')){const code=plainText(script),fn=parseJavaScript(code,{ecmaVersion:'latest'}).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='nav');if(fn)navSource=code.slice(fn.start,fn.end);}
function navigationFixture(restoring=false,withController=true){
  const events=[],qState={prodId:'',step:1,notes:'existing quote draft'},rfqListState={items:['synthetic line']},api={closeForNavigation:()=>events.push('close'),focusPage:()=>events.push('focus'),scrollPage:()=>events.push('scroll')};
  const document={querySelectorAll:()=>[],getElementById:()=>({classList:{contains:value=>value==='page',add:()=>events.push('activate')}}),querySelector:()=>null};
  const context={document,window:withController?{DongDaPublicAccessibility:api}:{scrollTo:options=>events.push(['fallback',options.top,options.behavior])},DongDaPublicAccessibility:api,qState,rfqListState,openProd:null,routeRestoring:restoring,dynamicContent:{pendingInquiryProductId:''},sampleState:{productId:''},location:{pathname:'/old',search:'',hash:''},history:{pushState:(_,__,target)=>events.push(['push',target]),replaceState:(_,__,target)=>events.push(['replace',target])},updateCatalogSeo:()=>{},catalog:{resolve:()=>null},renderRfqList:()=>events.push('rfq-render'),renderSampleRequest:()=>{},initQuotePage:()=>{},buildProdL2:()=>{},applyPendingInquiryProduct:()=>{},obs:()=>{},setTimeout:(_,time)=>events.push(['timer',time])};
  assert.ok(navSource);vm.runInNewContext(navSource,context,{timeout:500});return{events,nav:context.nav,qState,rfqListState};
}
test('actual router activates before instant top navigation and retains procurement drafts',()=>{
  for(const page of ['home','products','inquiry','quote','rfq']){const item=navigationFixture();item.nav(page);assert.ok(item.events.indexOf('activate')<item.events.indexOf('scroll'));assert.ok(item.events.indexOf('focus')<item.events.indexOf('scroll'));assert.equal(item.qState.notes,'existing quote draft');assert.deepEqual(item.rfqListState.items,['synthetic line']);assert.ok(item.events.some(row=>Array.isArray(row)&&row[0]==='push'));}
});
test('route restoration keeps its original replace/no-focus policy and pre-init fallback is instant',()=>{
  const restored=navigationFixture(true);restored.nav('home');assert.ok(restored.events.some(row=>Array.isArray(row)&&row[0]==='replace'));assert.equal(restored.events.includes('focus'),false);assert.ok(restored.events.includes('scroll'));
  const fallback=navigationFixture(false,false);fallback.nav('home');assert.ok(fallback.events.some(row=>Array.isArray(row)&&row[0]==='fallback'&&row[1]===0&&row[2]==='instant'));
});
test('transparent wrapper keeps real assistant surfaces interactive and top button notice-aware',async()=>{
  const css=await readFile(join(process.cwd(),'assets/css/public-accessibility.css'),'utf8');assert.match(css,/\.ai-widget\{[^}]*pointer-events:none/);assert.match(css,/\.ai-widget :is\(\.ai-fab,\.ai-panel\)\{pointer-events:auto/);assert.match(css,/\.back-to-top\{right:94px;bottom:calc\(20px \+ var\(--dd-consent-height,0px\)\)/);
  assert.match(source,/classList\.toggle\('show',window\.scrollY>400\)\},\{passive:true\}/);assert.match(controller,/event\.preventDefault\(\);backToTop\(\)/);
});
