import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parse as parseScript} from 'acorn';
import {runInNewContext} from 'node:vm';
import {parse} from 'parse5';
import {nodes,attribute,renderProductDocument} from '../scripts/build-product-pages.mjs';
import '../assets/js/product-inspection-core.js';
const core=globalThis.DongDaProductInspectionCore,catalog=globalThis.DongDaCatalog.create(JSON.parse(await readFile(new URL('../content/products.json',import.meta.url)))),page=globalThis.DongDaProductPage;
test('inspection resolves only canonical public sample/customer images, including old aliases',()=>{
  for(const product of catalog.all){
    const allowed=product.kind==='product'&&['sample','customer-example'].includes(product.mediaRole);
    for(const id of [product.id,...product.aliases])assert.equal(core.resolve(catalog,id)?.id||null,allowed?product.id:null);
  }
  for(const value of ['missing','../private',null,42])assert.equal(core.resolve(catalog,value),null);
});
test('inspection rejects unsafe, private and external paths even with a misleading role',()=>{
  for(const image of ['https://x.invalid/a.jpg','/private/a.jpg','assets/img/../secret.jpg','assets/img/a.jpg?token=x','assets/img/a.svg','assets/img/a.jpg#x'])assert.throws(()=>core.resolve({resolve:()=>({kind:'product',mediaRole:'sample',image})},'x'),TypeError);
});
test('inspection geometry preserves aspect ratio, contains all edges and gives exact native pixels',()=>{
  for(const dims of [[1920,1080,1200,700],[1080,1920,296,620],[320,200,1200,700],[2048,2048,768,620]]){
    const [w,h,aw,ah]=dims,frame=core.frame(...dims);
    assert.ok(frame.width<=aw&&frame.height<=ah);assert.ok(Math.abs(frame.width/frame.height-w/h)<1e-9);
    assert.ok(Math.abs(frame.width*frame.actualScale-w)<1e-9);assert.ok(Math.abs(frame.height*frame.actualScale-h)<1e-9);
    assert.ok(frame.maxScale>=frame.actualScale);assert.equal(frame.minScale,1);assert.ok(Object.isFrozen(frame));
  }
  assert.deepEqual(core.frame(320,200,1200,700),{width:320,height:200,actualScale:1,minScale:1,maxScale:4});
});
test('inspection rejects unavailable, excessive and non-finite geometry',()=>{
  for(const value of [0,-1,NaN,Infinity,32001,'100',null])for(let index=0;index<4;index++){const args=[100,100,100,100];args[index]=value;assert.throws(()=>core.frame(...args),TypeError);}
});
test('inspection bounds scale without changing fit or native pixel identities',()=>{
  const frame=core.frame(1920,1080,296,620);assert.equal(core.scale(-100,frame),1);assert.equal(core.scale(999,frame),frame.maxScale);assert.equal(core.scale(frame.actualScale,frame),frame.actualScale);
  for(const value of [NaN,Infinity,'2',null])assert.throws(()=>core.scale(value,frame),TypeError);
  for(const frame of [null,{maxScale:0},{maxScale:NaN}])assert.throws(()=>core.scale(2,frame),TypeError);
});
test('inspection labels are complete in three languages with English fallback and strict keys',()=>{
  for(const locale of ['en','zh','ru','kk'])for(const key of ['view','zoomIn','zoomOut','fit','actual','loading','failed','retry','close'])assert.ok(core.text(key,locale));
  assert.equal(core.text('view','kk'),core.text('view','en'));assert.throws(()=>core.text('missing','en'),TypeError);
});
test('product media renders exact native image links, provenance and no pending photo triggers',()=>{
  for(const product of catalog.search({}))for(const locale of page.languages){
    const body=parse(page.sections(product,locale).media),links=nodes(body,n=>attribute(n,'data-product-inspection')!==undefined);
    if(product.mediaRole==='production-reference'){assert.equal(links.length,0);assert.equal(nodes(body,n=>n.tagName==='img').length,0);continue;}
    assert.equal(links.length,1);assert.equal(attribute(links[0],'href'),'/'+product.image);assert.equal(attribute(links[0],'data-product-inspection'),product.id);
    assert.equal(attribute(links[0],'aria-label'),core.text('view',locale)+': '+product.name[locale]);assert.equal(attribute(links[0],'onclick'),undefined);
    assert.ok(nodes(body,n=>n.tagName==='figcaption').length===1);assert.equal(attribute(nodes(body,n=>n.tagName==='img')[0],'src'),'/'+product.image);
  }
});
test('inspection escapes names without emitting executable elements',()=>{
  const product=structuredClone(catalog.resolve('fibc-bulk-bags'));product.name.en='\"><img src=x onerror=alert(1)>';
  const body=parse(page.sections(product,'en').media);assert.equal(nodes(body,n=>n.tagName==='img').length,1);assert.equal(nodes(body,n=>attribute(n,'onerror')!==undefined).length,0);
});
test('physical product documents contain the shared dialog and dependency order without new modal framework',async()=>{
  const source=await readFile(new URL('../index.html',import.meta.url),'utf8');
  for(const product of catalog.search({}))for(const locale of page.languages){
    const doc=parse(renderProductDocument(source,product,locale,'https://cn-dongda.com'));
    assert.equal(nodes(doc,n=>attribute(n,'id')==='lbx').length,1);assert.equal(nodes(doc,n=>attribute(n,'id')==='product-inspection').length,1);
    const scripts=nodes(doc,n=>n.tagName==='script'&&attribute(n,'src')).map(n=>attribute(n,'src'));
    assert.ok(scripts.indexOf('assets/js/product-inspection-core.js')<scripts.indexOf('assets/js/product-page-core.js'));
    assert.ok(scripts.indexOf('assets/js/public-accessibility.js')<scripts.indexOf('assets/js/product-inspection-ui.js'));
    assert.ok(scripts.indexOf('assets/js/panzoom.js')<scripts.indexOf('assets/js/product-inspection-ui.js'));
  }
  assert.ok(source.includes("if(lbMode==='product')return;"));assert.ok(source.includes('DongDaProductInspection.prepareLegacy()'));
});
test('pinned Panzoom distribution and MIT license keep their vendor identities',async()=>{
  const record=JSON.parse(await readFile(new URL('../assets/js/panzoom-provenance.json',import.meta.url)));
  assert.equal(record.version,'4.6.2');assert.equal(record.license,'MIT');assert.equal(record.distributionModified,false);assert.equal(record.scriptsExecuted,false);
  for(const file of record.files){const bytes=await readFile(new URL('../'+file.path,import.meta.url));assert.equal(bytes.length,file.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);}
});
async function functionSource(name){
  const source=await readFile(new URL('../assets/js/product-inspection-ui.js',import.meta.url),'utf8'),ast=parseScript(source,{ecmaVersion:'latest'});let found;
  function visit(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&node.id.name===name)found=node;for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}}
  visit(ast);assert.ok(found);return source.slice(found.start,found.end);
}
test('actual UI update preserves modal focus when a zoom boundary disables the active button',async()=>{
  const source=await functionSource('update');
  for(const [scale,action,expected]of [[1,'zoomOut','zoomIn'],[4,'zoomIn','zoomOut'],[2,'fit','fit']]){
    const document={activeElement:null},controls=['zoomOut','zoomIn','fit','actual'].map(action=>({dataset:{inspectionAction:action},disabled:false,focus(){document.activeElement=this;}})),focused=controls.find(c=>c.dataset.inspectionAction===action);document.activeElement=focused;
    let disabled=false;Object.defineProperty(focused,'disabled',{get:()=>disabled,set:value=>{disabled=value;if(value&&document.activeElement===focused)document.activeElement={};}});
    runInNewContext(source+';update();',{document,controls,panzoom:{getScale:()=>scale},geometry:{actualScale:2,maxScale:4},viewport:{dataset:{}},output:{}});
    assert.equal(document.activeElement.dataset.inspectionAction,expected);
  }
});
test('actual retry loading state moves focus off the hidden retry button to modal close',async()=>{
  const document={activeElement:null},retry={hidden:false},close={focus(){document.activeElement=this;}};document.activeElement=retry;
  runInNewContext((await functionSource('state'))+";state('loading');",{document,retry,dialog:{querySelector:()=>close},panel:{dataset:{}},status:{},core,locale:()=> 'en',output:{},controls:[],viewport:{}});
  assert.equal(retry.hidden,true);assert.equal(document.activeElement,close);
});
