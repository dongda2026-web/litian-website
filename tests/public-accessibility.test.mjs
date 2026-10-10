import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script,runInNewContext } from 'node:vm';
import { parse,serialize } from 'parse5';
import { nodes,attribute } from '../scripts/build-product-pages.mjs';
import { localizeAccessibility } from '../scripts/build-public-accessibility.mjs';
const core=globalThis.DongDaAccessibility;
const source=await readFile(new URL('../index.html',import.meta.url),'utf8');
test('public control copy is complete and immutable in zh/en/ru',()=>{
  assert.equal(core.version,'2026.10.08-accessibility-v1');assert.equal(Object.isFrozen(core),true);
  for(const locale of core.languages)for(const key of ['skip','home','menu','openMenu','language','close','previous','next','media','privacy','legal','assistant','openAssistant'])assert.ok(core.text(key,locale).trim());
  assert.throws(()=>core.dialogs.lbx='other',TypeError);
});
test('unsupported or inherited locale falls back without exposing object properties',()=>{
  for(const locale of ['kk','constructor','__proto__',null,undefined])assert.equal(core.text('close',locale),'Close');
  for(const key of ['constructor','__proto__','unknown',''])assert.throws(()=>core.text(key,'en'),TypeError);
});
test('physical accessibility localization preserves paths, business data and legal body',()=>{
  const original=parse(source),originalParagraphs=nodes(original,n=>n.tagName==='p').map(serialize);
  for(const locale of core.languages){
    const path='/'+locale+'/products/valve-bags/',document=localizeAccessibility(parse(source),locale,path);
    const id=value=>nodes(document,n=>attribute(n,'id')===value)[0];
    assert.equal(attribute(id('skip-main'),'href'),path+'#main-content');
    assert.equal(attribute(id('nav-hamburger'),'aria-label'),core.text('openMenu',locale));
    assert.equal(attribute(id('nav-lang-btn'),'aria-controls'),'nl-menu');
    assert.deepEqual(nodes(document,n=>n.tagName==='p').map(serialize),originalParagraphs);
    const close=nodes(document,n=>attribute(n,'data-a11y-icon')==='X');assert.ok(close.length>=5);
    for(const node of close)assert.ok(nodes(node,n=>n.tagName==='svg').length);
    assert.equal(nodes(document,n=>n.tagName==='main').length,1);
    assert.equal(nodes(document,n=>n.tagName==='dialog').length,6);
  }
});
test('all factory media have a keyboard trigger and closed dialogs are not exposed',()=>{
  const document=localizeAccessibility(parse(source),'en');
  const media=nodes(document,n=>/^lb\(/.test(attribute(n,'onclick')||''));assert.ok(media.length>=8);
  for(const node of media){assert.equal(attribute(node,'role'),'button');assert.equal(attribute(node,'tabindex'),'0');assert.equal(attribute(node,'aria-haspopup'),'dialog');}
  for(const id of Object.keys(core.dialogs)){const dialog=nodes(document,n=>attribute(n,'id')===id)[0];assert.equal(dialog.tagName,'dialog');assert.equal(attribute(dialog,'open'),undefined);assert.ok(nodes(dialog,n=>attribute(n,'data-dialog-focus')!==undefined).length);}
});
test('inline and public controller scripts compile without executing private services',async()=>{
  for(const script of nodes(parse(source),n=>n.tagName==='script'&&attribute(n,'src')===undefined&&attribute(n,'type')!=='application/ld+json'))new Script(script.childNodes.map(node=>node.value||'').join(''));
  new Script(await readFile(new URL('../assets/js/public-accessibility.js',import.meta.url),'utf8'));
  const scripts=nodes(parse(source),n=>n.tagName==='script'&&attribute(n,'src')).map(node=>attribute(node,'src'));
  const coreIndex=scripts.indexOf('assets/js/accessibility-core.js'),controllerIndex=scripts.indexOf('assets/js/public-accessibility.js');
  assert.ok(coreIndex>=0&&controllerIndex===coreIndex+1);
  assert.equal(scripts.filter(value=>value==='assets/js/public-accessibility.js').length,1);
  assert.ok(controllerIndex>scripts.indexOf('assets/js/catalog-data.js'));
});
test('focus controls do not introduce a second inquiry, storage or network path',async()=>{
  const controller=await readFile(new URL('../assets/js/public-accessibility.js',import.meta.url),'utf8');
  assert.doesNotMatch(controller,/\b(?:fetch|localStorage|sessionStorage|XMLHttpRequest)\b/);
  assert.match(controller,/dialog\.showModal\(\)/);assert.match(controller,/dialog\.close\(\)/);
  const document=parse(source),panel=nodes(document,n=>attribute(n,'id')==='ai-panel')[0];assert.equal(attribute(panel,'role'),'region');assert.equal(attribute(panel,'aria-live'),undefined);
  assert.equal(attribute(nodes(document,n=>attribute(n,'id')==='ai-messages')[0],'role'),'log');
});

async function controllerFixture(){
  const elements={},handlers={},document={activeElement:null};
  function element(id){
    const classes=new Set(),events={};
    return elements[id]={id,isConnected:true,tabIndex:0,open:false,hidden:false,inert:false,parent:null,attributes:{},controls:[],
      classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),contains:value=>classes.has(value),toggle(value,force){const next=force===undefined?!classes.has(value):force;next?classes.add(value):classes.delete(value);return next;}},
      setAttribute(name,value){this.attributes[name]=value;},getClientRects(){return this.hidden?[]:[{}];},closest(){return this.hidden||this.inert?this:null;},
      focus(){document.activeElement=this;},contains(node){return node===this||node?.parent===this;},querySelector(){return this.controls[0]||null;},querySelectorAll(){return this.controls;},addEventListener(name,handler){events[name]=handler;},
      showModal(){this.open=true;},close(){this.open=false;},events};
  }
  for(const id of [...Object.keys(core.dialogs),'nav-hamburger','nl-menu','nav-lang-btn','nav-lang-switch','ai-panel','ai-input','ai-fab','skip-main','main-content','heading','trigger'])element(id);
  for(const id of Object.keys(core.dialogs)){elements[id].controls=[element(id+'-first'),element(id+'-last')];for(const control of elements[id].controls)control.parent=elements[id];}
  elements['ai-input'].parent=elements['ai-panel'];elements['nl-menu'].parent=elements['nav-lang-switch'];
  document.body={style:{overflow:'scroll'}};document.activeElement=elements.trigger;document.getElementById=id=>elements[id];
  document.querySelector=selector=>selector==='.ai-fab'?elements['ai-fab']:selector==='.page.on h1'?elements.heading:null;
  document.querySelectorAll=()=>[];document.addEventListener=(name,handler)=>{(handlers[name]||=[]).push(handler);};
  const window={DongDaAccessibility:core};
  runInNewContext(await readFile(new URL('../assets/js/public-accessibility.js',import.meta.url),'utf8'),{window,document,location:{pathname:'/en/products/valve-bags/'},queueMicrotask:callback=>callback(),lang:'en'});
  return{api:window.DongDaPublicAccessibility,elements,document,handlers};
}
test('controller state double preserves scroll ownership, opener, single modal and navigation focus',async()=>{
  const {api,elements,document}=await controllerFixture();
  assert.throws(()=>api.open('unknown'),/Unknown public dialog/);assert.throws(()=>api.close('unknown'),/Unknown public dialog/);
  api.open('product-sheet');assert.equal(document.body.style.overflow,'hidden');assert.equal(document.activeElement.id,'product-sheet-first');
  api.close('nav-overlay');assert.equal(document.body.style.overflow,'hidden');
  api.open('legalModal');assert.equal(elements['product-sheet'].open,false);assert.equal(elements.legalModal.open,true);
  api.closeForNavigation();api.focusPage();assert.equal(document.body.style.overflow,'scroll');assert.equal(document.activeElement.id,'heading');
  document.activeElement=elements.trigger;api.open('nav-overlay');api.close('nav-overlay');assert.equal(document.activeElement.id,'trigger');assert.equal(elements['nav-hamburger'].attributes['aria-expanded'],'false');
});
test('controller state double tests first/last Tab boundary, filtering and native cancel cleanup',async()=>{
  const {api,elements,document,handlers}=await controllerFixture();api.open('product-sheet');
  const dialog=elements['product-sheet'];const hidden={tabIndex:0,closest:()=>({}),getClientRects:()=>[]};dialog.controls.push(hidden);
  let prevented=false;for(const handler of handlers.keydown)handler({key:'Tab',target:document.activeElement,shiftKey:true,preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(document.activeElement.id,'product-sheet-last');
  prevented=false;for(const handler of handlers.keydown)handler({key:'Tab',target:document.activeElement,shiftKey:false,preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(document.activeElement.id,'product-sheet-first');
  dialog.events.cancel({preventDefault(){}});assert.equal(dialog.open,false);assert.equal(document.activeElement.id,'trigger');
});
test('nonmodal disclosure and assistant state double keep hidden content inert and restore focus',async()=>{
  const {api,elements,document}=await controllerFixture();
  api.languageMenu(true,false);assert.equal(elements['nl-menu'].inert,false);assert.equal(elements['nav-lang-btn'].attributes['aria-expanded'],'true');
  document.activeElement=elements['nl-menu'];api.languageMenu(false,true);assert.equal(document.activeElement.id,'nav-lang-btn');assert.equal(elements['nl-menu'].hidden,true);
  api.assistant(true,false);assert.equal(document.activeElement.id,'ai-input');api.assistant(false,true);assert.equal(document.activeElement.id,'ai-fab');assert.equal(elements['ai-panel'].inert,true);
});
