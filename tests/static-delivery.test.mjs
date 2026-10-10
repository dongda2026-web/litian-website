import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {gunzipSync,inflateSync,brotliDecompressSync} from 'node:zlib';
import {parse} from 'parse5';
import {assetRecord,validateAssetManifest,deliveryVersion,cacheControl,preferredEncoding,integrity} from '../scripts/static-delivery-core.mjs';
import {buildStaticDelivery,linkedAssets} from '../scripts/build-static-delivery.mjs';
import {attribute} from '../scripts/build-product-pages.mjs';
import {staticPreview} from '../server/static-preview.mjs';

const js=Buffer.from('(function(){globalThis.deliveryFixture=true;})();'),css=Buffer.from('body{color:#123456}');
test('public asset identity is bounded, deterministic and fully content addressed',()=>{
  const file=assetRecord('/assets/js/fixture.js',js),manifest={version:deliveryVersion,files:[file]};
  assert.equal(file.integrity,integrity(js));assert.deepEqual(validateAssetManifest(manifest),manifest);
  assert.notEqual(assetRecord(file.originalPath,Buffer.concat([js,Buffer.from(' ')] )).path,file.path);
  for(const path of ['../private.js','/server/admin.js','/assets/css/a.js','/assets/js/a.js?secret=x'])assert.throws(()=>assetRecord(path,js));
  for(const change of [{extra:1},{path:file.originalPath},{integrity:'sha256-invalid'},{size:0},{sha256:'A'.repeat(64)},{type:'style'}])assert.throws(()=>validateAssetManifest({version:deliveryVersion,files:[{...file,...change}]}));
  assert.throws(()=>validateAssetManifest({...manifest,files:[file,file]}));assert.throws(()=>validateAssetManifest({...manifest,extra:1}));
});
test('only exact known successful assets are immutable; mutable and missing files remain revalidatable',()=>{
  const file=assetRecord('/assets/js/fixture.js',js),known=[file.path];
  assert.match(cacheControl(file.path,200,known),/immutable/);
  for(const path of ['/assets/js/fixture.js','/content/asset-files.json','/','/assets/releases/unknown/a.js'])assert.equal(cacheControl(path,200,known),'no-store');
  for(const status of [404,500,301,206])assert.equal(cacheControl(file.path,status,known),'no-store');
  assert.equal(cacheControl('/assets/img/logo.jpg',200,known),'public, max-age=0, must-revalidate');
});
test('quality-aware compression selection rejects malformed and duplicate preferences',()=>{
  for(const [input,wanted] of [['br, gzip','br'],['gzip;q=1, br;q=0.5','gzip'],['deflate','deflate'],['br;q=0, gzip;q=0','identity'],['gzip;q=0.5, identity;q=1','identity'],['*;q=0.7','br'],['*;q=0','unacceptable'],['gzip;q=0, identity;q=0','unacceptable'],['gzip;q=2','identity'],['gzip, gzip','identity'],[undefined,'identity'],['','identity']])assert.equal(preferredEncoding(input),wanted);
});
async function fixture(run,override={}){
  const root=await mkdtemp(join(tmpdir(),'dongda-static-delivery-'));
  try{
    await mkdir(join(root,'assets/js'),{recursive:true});await mkdir(join(root,'assets/css'),{recursive:true});await mkdir(join(root,'content'),{recursive:true});
    await writeFile(join(root,'assets/js/fixture.js'),override.js||js);await writeFile(join(root,'assets/css/fixture.css'),override.css||css);
    await writeFile(join(root,'index.html'),'<html><head><link rel="stylesheet" media="screen" href="assets/css/fixture.css"><link rel="stylesheet" href="https://fonts.googleapis.com/example"></head><body><script defer src="assets/js/fixture.js"></script></body></html>');
    await writeFile(join(root,'404.html'),'<html><body>Not found</body></html>');await writeFile(join(root,'_headers'),'/*\n  X-Content-Type-Options: nosniff\n');
    await writeFile(join(root,'site-manifest.json'),JSON.stringify({publication:{publishable:false}}));await writeFile(join(root,'content/resource-files.json'),JSON.stringify({files:[]}));
    return await run(root);
  }finally{await rm(root,{recursive:true,force:true});}
}
test('final HTML fingerprinting preserves script/style ordering, attributes, aliases and pending publication',()=>fixture(async root=>{
  const manifest=await buildStaticDelivery({client:root}),html=parse(await readFile(join(root,'index.html'),'utf8')),refs=linkedAssets(html);
  assert.equal(refs.length,3);assert.ok(attribute(refs[0].node,'href').includes('/assets/releases/'));assert.equal(attribute(refs[0].node,'media'),'screen');assert.equal(attribute(refs[1].node,'href'),'https://fonts.googleapis.com/example');assert.equal(attribute(refs[2].node,'defer'),'');
  for(const file of manifest.files){assert.equal(attribute(refs[file.type==='script'?2:0].node,'integrity'),file.integrity);assert.deepEqual(await readFile(join(root,file.path)),await readFile(join(root,file.originalPath)));}
  assert.equal(JSON.parse(await readFile(join(root,'site-manifest.json'))).publication.publishable,false);
  await assert.rejects(buildStaticDelivery({client:root}),/Preexisting/);
}));
test('relative stylesheet and executable module/worker dependencies cannot silently change behavior',async()=>{
  for(const override of [{css:'@import "other.css";'}, {css:'body{background:url(a.png)}'}, {js:'new Worker("worker.js")'}, {js:'import("./module.js")'}, {js:'const a="assets/js/dependency.js"'}])await assert.rejects(fixture(root=>buildStaticDelivery({client:root}),override));
});
async function invoke(handler,url,method,encoding){
  let status,headers,data;await handler({url,method,headers:{'accept-encoding':encoding}},{writeHead(s,h){status=s;headers=h;},end(body){data=body;}});return{status,headers,data};
}
test('static profile returns real compressed bytes, HEAD metadata, correct caches and no public business APIs',()=>fixture(async root=>{
  const manifest=await buildStaticDelivery({client:root}),file=manifest.files.find(file=>file.type==='script'),handler=staticPreview(root,undefined,{delivery:true,immutablePaths:[file.path]});
  for(const [name,inflate] of [['gzip',gunzipSync],['deflate',inflateSync],['br',brotliDecompressSync]]){
    const response=await invoke(handler,file.path,'GET',name);assert.equal(response.status,200);assert.equal(response.headers['Content-Encoding'],name);assert.equal(response.headers['Content-Length'],response.data.length);assert.deepEqual(inflate(response.data),js);assert.match(response.headers['Cache-Control'],/immutable/);
    const head=await invoke(handler,file.path,'HEAD',name);assert.equal(head.data,undefined);assert.deepEqual(head.headers,response.headers);
  }
  const legacy=await invoke(handler,file.originalPath,'GET','gzip');assert.equal(legacy.headers['Cache-Control'],'no-store');
  for(const path of ['/api/inquiries','/api/admin','/api/sales/website-inquiries','/assets/releases/unknown/a.js','/%2eenv','/assets/%2e%2e/%2e%2e/secret']){const response=await invoke(handler,path,'GET','br');assert.equal(response.status,404);assert.equal(response.headers['Cache-Control'],'no-store');}
  assert.equal((await invoke(handler,'/','POST','br')).status,405);
  assert.equal((await invoke(handler,file.path,'GET','*;q=0')).status,406);
  const original=await invoke(staticPreview(root),file.path,'GET','br');assert.equal(original.headers['Content-Encoding'],undefined);assert.equal(original.headers['Cache-Control'],'no-store');assert.deepEqual(original.data,js);
}));
