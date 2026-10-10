import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import '../assets/js/catalog-core.js';
import '../assets/js/catalog-copy.js';
import '../assets/js/product-page-core.js';
import '../assets/js/resource-core.js';
import {resourceDeliveryData} from '../scripts/resource-delivery-data.mjs';

const catalog=globalThis.DongDaCatalog.create(JSON.parse(await readFile(new URL('../content/products.json',import.meta.url))));
const data=JSON.parse(await readFile(new URL('../content/resources.json',import.meta.url))),core=globalThis.DongDaResources;
const registry=core.create(data,catalog),deliveryCore=globalThis.DongDaResourceDelivery;
const manifest=resourceDeliveryData(registry),delivery=deliveryCore.create(manifest,registry),origin='https://cn-dongda.com';
const bytes=file=>Buffer.from(core.downloadText(registry.resolve(file.resourceId),file.language,registry));
const options=(file,overrides={})=>({origin,crypto:webcrypto,fetch:async()=>new Response(bytes(file),{headers:{'Content-Type':file.mediaType,'Content-Length':String(file.size)}}),...overrides});
const rejects=(file,code,overrides={},reg=registry)=>assert.rejects(deliveryCore.verifiedBytes(file,reg,options(file,overrides)),error=>error.code===code);

test('delivery registry binds all twelve immutable trilingual files and retained aliases',()=>{
  assert.equal(delivery.files.length,12);assert.ok(Object.isFrozen(delivery.files[0]));
  for(const file of delivery.files){assert.equal(file.legacyPath,core.filePath(registry.resolve(file.resourceId),file.language));assert.equal(file.path,core.filePath(registry.resolve(file.resourceId),file.language,delivery));assert.equal(file.size,bytes(file).length);assert.ok(file.path.includes(file.sha256));}
  assert.throws(()=>delivery.files[0].path='bad');assert.equal(delivery.resolve('missing','en'),null);
});
test('delivery rejects malformed envelopes, incomplete languages, wrong bindings and paths',()=>{
  for(const value of [null,{}, {...manifest,extra:1},{...manifest,version:'old'},{...manifest,files:manifest.files.slice(1)}])assert.throws(()=>deliveryCore.create(value,registry));
  for(const mutate of [f=>f.extra=1,f=>f.size=0,f=>f.size=131073,f=>f.sha256='x'.repeat(64),f=>f.path='https://evil.test/x',f=>f.legacyPath='../x',f=>f.productId='wrong',f=>f.language='kk',f=>f.updatedAt='2026-10-09',f=>f.version='2.0',f=>f.mediaType='text/html']){const copy=structuredClone(manifest);mutate(copy.files[0]);assert.throws(()=>deliveryCore.create(copy,registry));}
  const duplicate=structuredClone(manifest);duplicate.files[1]=duplicate.files[0];assert.throws(()=>deliveryCore.create(duplicate,registry));
});
test('editorial changes alter only affected fingerprints without claiming a technical edition',()=>{
  const changed=structuredClone(data);changed.entries[0].title.zh+=' 待复核';
  const next=resourceDeliveryData(core.create(changed,catalog));
  assert.notEqual(next.files[1].path,manifest.files[1].path);assert.equal(next.files[0].path,manifest.files[0].path);
  assert.equal(next.files[1].version,manifest.files[1].version);assert.equal(next.files[1].updatedAt,manifest.files[1].updatedAt);
  const summaryOnly=structuredClone(data);summaryOnly.entries[0].summary.zh+=' 待复核';
  assert.equal(resourceDeliveryData(core.create(summaryOnly,catalog)).files[1].path,manifest.files[1].path);
});
test('verified delivery returns exact canonical bytes for all twelve files and bounded chunks',async()=>{
  for(const file of delivery.files)assert.deepEqual(Buffer.from(await deliveryCore.verifiedBytes(file,registry,options(file))),bytes(file));
  const file=delivery.files[0],body=bytes(file);let cursor=0;
  const response=new Response(new ReadableStream({pull(controller){if(cursor===body.length){controller.close();return;}controller.enqueue(body.subarray(cursor,cursor+37));cursor=Math.min(body.length,cursor+37);}}),{headers:{'Content-Type':file.mediaType}});
  assert.deepEqual(Buffer.from(await deliveryCore.verifiedBytes(file,registry,options(file,{fetch:async()=>response}))),body);
});
test('request is same-origin anonymous no-store GET with no redirects',async()=>{
  const file=delivery.files[0];let observed;
  await deliveryCore.verifiedBytes(file,registry,options(file,{fetch:async(url,init)=>{observed={url,init};return new Response(bytes(file),{headers:{'Content-Type':file.mediaType}});}}));
  assert.equal(observed.url,origin+file.path);assert.equal(observed.init.credentials,'omit');assert.equal(observed.init.redirect,'error');assert.equal(observed.init.cache,'no-store');
  await rejects({...file,path:'https://evil.test/x'},'unavailable');await rejects(file,'unavailable',{origin:'not-url'});
});
test('HTTP status redirects wrong MIME and mismatched response URL fail closed',async()=>{
  const file=delivery.files[0];
  await rejects(file,'status',{fetch:async()=>new Response('missing',{status:404})});
  await rejects(file,'type',{fetch:async()=>new Response(bytes(file),{headers:{'Content-Type':'text/html'}})});
  for(const change of [{redirected:true},{url:'https://evil.test/file'}])await rejects(file,'status',{fetch:async()=>Object.assign({status:200,headers:new Headers({'Content-Type':file.mediaType}),body:new Response(bytes(file)).body},change)});
});
test('advertised missing truncated and oversized bytes fail with a stable error',async()=>{
  const file=delivery.files[0];
  for(const value of ['bad','0',String(file.size+1)])await rejects(file,'size',{fetch:async()=>new Response(bytes(file),{headers:{'Content-Type':file.mediaType,'Content-Length':value}})});
  for(const body of [bytes(file).subarray(1),Buffer.concat([bytes(file),Buffer.from('x')])])await rejects(file,'size',{fetch:async()=>new Response(body,{headers:{'Content-Type':file.mediaType}})});
  await rejects(file,'unavailable',{fetch:async()=>({status:200,headers:new Headers({'Content-Type':file.mediaType}),body:null})});
});
test('decoded compression bodies retain exact hash validation without comparing wire length to decoded size',async()=>{
  const file=delivery.files[0];
  for(const encoding of ['gzip','br','deflate',' GZIP ','identity']){
    const response=new Response(bytes(file),{headers:{'Content-Type':file.mediaType,'Content-Encoding':encoding,'Content-Length':String(encoding==='identity'?file.size:71)}});
    assert.deepEqual(Buffer.from(await deliveryCore.verifiedBytes(file,registry,options(file,{fetch:async()=>response}))),bytes(file));
  }
  for(const encoding of ['zstd','gzip, br','compress',''])await rejects(file,'encoding',{fetch:async()=>new Response(bytes(file),{headers:{'Content-Type':file.mediaType,'Content-Encoding':encoding||' '}})});
  for(const length of ['bad','0','263169','9007199254740992'])await rejects(file,'size',{fetch:async()=>new Response(bytes(file),{headers:{'Content-Type':file.mediaType,'Content-Encoding':'br','Content-Length':length}})});
  const corrupt=Buffer.from(bytes(file));corrupt[0]^=1;
  await rejects(file,'integrity',{fetch:async()=>new Response(corrupt,{headers:{'Content-Type':file.mediaType,'Content-Encoding':'gzip','Content-Length':'71'}})});
  await rejects(file,'size',{fetch:async()=>new Response(bytes(file).subarray(1),{headers:{'Content-Type':file.mediaType,'Content-Encoding':'br'}})});
});
test('same-length corruption and matching malicious digest still fail canonical content comparison',async()=>{
  const file=delivery.files[0],corrupt=Buffer.from(bytes(file));corrupt[0]^=1;
  const fetch=async()=>new Response(corrupt,{headers:{'Content-Type':file.mediaType}});
  await rejects(file,'integrity',{fetch});
  const sha=createHash('sha256').update(corrupt).digest('hex');
  await rejects({...file,sha256:sha,path:deliveryCore.filename(file.legacyPath,sha)},'stale',{fetch});
});
test('crypto unavailable digest errors and network errors never return bytes',async()=>{
  const file=delivery.files[0];
  await rejects(file,'unavailable',{crypto:{}});await rejects(file,'unavailable',{crypto:{subtle:{digest:async()=>{throw Error('private provider detail');}}}});
  await rejects(file,'network',{fetch:async()=>{throw Error('network');}});
});
test('abort stream faults and cancellation preserve fixed errors',async()=>{
  const file=delivery.files[0],controller=new AbortController();controller.abort();
  await rejects(file,'cancelled',{signal:controller.signal});
  await rejects(file,'network',{fetch:async()=>new Response(new ReadableStream({start(c){c.error(Error('fault'));}}),{headers:{'Content-Type':file.mediaType}})});
});
test('renderers expose exact fingerprints status hooks native fallback and unchanged noindex',()=>{
  const entry=registry.entries[0],html=core.detail(entry,'ru',registry,catalog,delivery);
  assert.ok(html.includes(delivery.resolve(entry.id,'ru').path));assert.ok(html.includes('aria-live="polite"'));assert.ok(html.includes('data-resource-download="'+entry.id+'"'));
  assert.equal(core.metadata(entry,'ru',origin,catalog).robots,'noindex,follow');
});

const uiSource=await readFile(new URL('../assets/js/resource-download-ui.js',import.meta.url),'utf8');
function fixture(verify) {
  const file=delivery.files[0],attrs={},status={textContent:'',setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];}};
  const link={dataset:{resourceDownload:file.resourceId,resourceLanguage:file.language},isConnected:true,getAttribute:()=>file.path,setAttribute(k,v){attrs[k]=v;},removeAttribute(k){delete attrs[k];},closest:()=>({querySelector:()=>status})};
  let clicks=0,created=0;const timers=new Map(),events={};
  const context={resourceDelivery:delivery,resourceRegistry:registry,DongDaResourceDelivery:{verifiedBytes:verify},location:{origin},AbortController,Blob,window:{fetch(){},addEventListener(k,v){events[k]=v;}},URL:{createObjectURL(){created++;return 'blob:bounded';},revokeObjectURL(){}},setTimeout(fn){const id=timers.size+1;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},document:{body:{appendChild(){}},createElement:()=>({click(){clicks++;},remove(){}}),addEventListener(k,v){events[k]=v;}}};
  runInNewContext(uiSource,context);return{context,link,status,attrs,timers,events,clicks:()=>clicks,created:()=>created};
}
test('public UI initiates one verified Blob download and clears busy state',async()=>{
  const f=fixture(async()=>bytes(delivery.files[0]));await f.context.startResourceDownload(f.link);
  assert.equal(f.clicks(),1);assert.equal(f.created(),1);assert.equal(f.attrs['aria-busy'],undefined);assert.match(f.status.textContent,/verified/);assert.equal(f.context.activeResourceDownload,null);
});
test('public UI failure and retry preserve link and never save invalid bytes',async()=>{
  let calls=0;const f=fixture(async()=>{if(!calls++){const error=Error('hidden provider secret');error.code='integrity';throw error;}return bytes(delivery.files[0]);});
  await f.context.startResourceDownload(f.link);assert.equal(f.created(),0);assert.match(f.status.textContent,/Reload/);assert.ok(!f.status.textContent.includes('secret'));
  await f.context.startResourceDownload(f.link);assert.equal(f.clicks(),1);
});
test('public UI navigation cancellation and duplicate click cannot start a stale download',async()=>{
  let finish,calls=0;const f=fixture(()=>{calls++;return new Promise(resolve=>finish=resolve);});
  const pending=f.context.startResourceDownload(f.link);await f.context.startResourceDownload(f.link);assert.equal(calls,1);
  f.context.cancelResourceDownloads();finish(bytes(delivery.files[0]));await pending;assert.equal(f.clicks(),0);assert.equal(f.status.textContent,'');assert.equal(f.attrs['aria-busy'],undefined);
});
test('public UI timeout reports fixed retry state and does not save',async()=>{
  const f=fixture((_file,_reg,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(Error('abort'),{code:'cancelled'})))));
  const pending=f.context.startResourceDownload(f.link);[...f.timers.values()][0]();await pending;assert.match(f.status.textContent,/timed out/);assert.equal(f.created(),0);
});
test('public UI missing delivery and modified clicks preserve native contract without claiming verification',async()=>{
  const f=fixture(async()=>{throw Error('should not run');});f.context.resourceDelivery=null;await f.context.startResourceDownload(f.link);assert.match(f.status.textContent,/Reload/);assert.equal(f.created(),0);
  let prevented=false;f.events.click({target:{closest:()=>f.link},button:0,ctrlKey:true,preventDefault(){prevented=true;}});assert.equal(prevented,false);
  assert.equal(/(?:local|session)Storage|inquir|leadId|innerHTML/.test(uiSource),false);
});
test('resource-only assistant positioning retains the existing control outside scrolling download rows',async()=>{
  const css=await readFile(new URL('../assets/css/resources.css',import.meta.url),'utf8');
  assert.match(css,/body:has\(#page-resources\.on,#page-resource-detail\.on\) \.ai-widget\{position:absolute;top:116px;bottom:auto!important\}/);
  assert.match(css,/\.ai-panel\{top:72px;bottom:auto/);assert.ok(!css.includes('.ai-widget{display:none'));
});
