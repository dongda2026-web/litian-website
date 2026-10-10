import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fontStylesheet,validateFontManifest,validateFontCss,validateWoff2,loadFontDelivery} from '../scripts/font-delivery.mjs';
import {digest,assetRecord,deliveryVersion} from '../scripts/static-delivery-core.mjs';
import {buildStaticDelivery} from '../scripts/build-static-delivery.mjs';
import {loadStaticDelivery} from '../scripts/load-static-delivery.mjs';
const source=new URL('../',import.meta.url).pathname,original=JSON.parse(await readFile(join(source,'assets/fonts/manifest.json'),'utf8'));
const families=['DM Serif Display','Inter','Noto Sans SC'],ids=['dmserifdisplay','inter','notosanssc'];
const files=ids.map(id=>original.files.find(file=>file.sourceUrl.includes('/s/'+id+'/')));
const text=files.map((file,i)=>`@font-face{font-family:"${families[i]}";font-style:normal;font-weight:400;font-display:swap;src:url(${file.path})format("woff2");unicode-range:U+0-FF}`).join('');
const manifest={...original,files,stylesheet:{path:fontStylesheet,size:Buffer.byteLength(text),sha256:digest(text)}};
async function fixture(run){
  const root=await mkdtemp(join(tmpdir(),'dongda-local-fonts-'));
  try{
    await mkdir(join(root,'assets/css'),{recursive:true});await mkdir(join(root,'assets/fonts'),{recursive:true});await mkdir(join(root,'content'),{recursive:true});
    for(const file of [...files,...manifest.licenses])await writeFile(join(root,file.path),await readFile(join(source,file.path)));
    await writeFile(join(root,fontStylesheet),text);await writeFile(join(root,'assets/fonts/manifest.json'),JSON.stringify(manifest));
    await writeFile(join(root,'index.html'),'<html><head><link rel="stylesheet" href="/assets/css/local-fonts.css"></head><body></body></html>');
    await writeFile(join(root,'_headers'),'/*\n  X-Content-Type-Options: nosniff\n');
    await writeFile(join(root,'site-manifest.json'),JSON.stringify({font_delivery_version:manifest.version}));
    const documents=Array.from({length:12},(_,i)=>{const bytes=Buffer.from('fixture '+i),sha256=digest(bytes);return{path:'/assets/documents/fixture-'+i+'-sha256-'+sha256+'.txt',size:bytes.length,sha256,bytes};});
    await mkdir(join(root,'assets/documents'),{recursive:true});for(const file of documents)await writeFile(join(root,file.path),file.bytes);
    await writeFile(join(root,'content/resource-files.json'),JSON.stringify({version:'2026.10.09-resource-delivery-v2',files:documents.map(({bytes,...file})=>file)}));
    return await run(root);
  }finally{await rm(root,{recursive:true,force:true});}
}
test('pinned original fonts and exact local CSS are verified without network',async()=>{
  const result=await loadFontDelivery(source);assert.equal(result.checks.faces,542);assert.equal(result.manifest.files.length,110);assert.equal(result.manifest.licenses.length,3);
  assert.equal(result.manifest.files.reduce((sum,file)=>sum+file.size,0),4754604);assert.doesNotMatch(await readFile(join(source,fontStylesheet),'utf8'),/https:|@import|local\(/);
});
test('font manifests reject extra keys, ambiguous paths, credentials, versions and missing license attribution',()=>{
  assert.deepEqual(validateFontManifest(manifest),manifest);
  for(const changed of [{...manifest,extra:1},{...manifest,version:'future'},{...manifest,licenses:[]},{...manifest,stylesheet:{...manifest.stylesheet,path:'/server/private.css'}},{...manifest,source:{...manifest.source,gitCommit:'main'}},{...manifest,files:[...files,files[0]]},{...manifest,files:files.map((file,i)=>i?file:{...file,sourceUrl:file.sourceUrl+'?token=x'})},{...manifest,files:files.map((file,i)=>i?file:{...file,path:'/assets/fonts/../private.woff2'})}])assert.throws(()=>validateFontManifest(changed));
});
test('font CSS is closed to imports, external or untracked bytes, scripts and non-font styling',()=>{
  assert.deepEqual(validateFontCss(text,manifest),{faces:3,files:3});
  for(const altered of ['@import "a.css";'+text,text+'body{color:red}',text.replace(files[0].path,'https://external.invalid/a.woff2'),text.replace(files[0].path,files[0].path+'?v=1'),text.replace('format("woff2")','format("truetype")'),text.replace('font-display:swap','font-display:block'),text.replace('font-weight:400','font-weight:100'),text.replace('font-style:normal','font-style:italic'),text.replace('font-family:"Inter"','font-family:"Replacement"'),text.replace('unicode-range:U+0-FF','unicode-range:???'),text.replace('font-style:normal','font-style:normal!important'),text.replace('src:url','src:local("Inter"),url'),text.replace('font-display:swap','font-display:swap;font-display:swap'),text.slice(0,text.lastIndexOf('@font-face'))])assert.throws(()=>validateFontCss(altered,manifest));
});
test('WOFF2 framing checks fail closed but do not claim full font decoding',async()=>{
  const bytes=await readFile(join(source,files[0].path));assert.equal(validateWoff2(bytes),bytes);
  for(const [offset,method,value]of[[0,'writeUInt32BE',0],[8,'writeUInt32BE',bytes.length+1],[12,'writeUInt16BE',0],[14,'writeUInt16BE',1],[16,'writeUInt32BE',33*1024*1024],[20,'writeUInt32BE',bytes.length]]){const bad=Buffer.from(bytes);bad[method](value,offset);assert.throws(()=>validateWoff2(bad));}
  for(const bad of [Buffer.alloc(10),Buffer.alloc(512*1024+1),'not bytes'])assert.throws(()=>validateWoff2(bad));
});
test('font files are content addressed and CSS SRI stays compatible with delivery v1',()=>fixture(async root=>{
  const assets=await buildStaticDelivery({client:root});assert.equal(assets.files.length,1);assert.equal(assets.files[0].sha256,manifest.stylesheet.sha256);
  const options=await loadStaticDelivery(root);for(const file of files)assert.ok(options.immutablePaths.includes(file.path));
  const headers=await readFile(join(root,'_headers'),'utf8');for(const file of files)assert.ok(headers.includes(file.path+'\n  Cache-Control: public, max-age=31536000, immutable'));
}));
test('missing, corrupted and symbolic font bytes cannot enable static delivery',async()=>{
  for(const mode of ['missing','corrupt','symlink','directory'])await fixture(async root=>{
    const path=join(root,files[0].path);
    if(mode==='corrupt'){const bytes=await readFile(path);bytes[bytes.length-1]^=1;await writeFile(path,bytes);}else{await rm(path);if(mode==='symlink')await symlink(join(source,files[0].path),path);if(mode==='directory')await mkdir(path);}
    await assert.rejects(loadFontDelivery(root));await assert.rejects(buildStaticDelivery({client:root}));
  });
});
test('font CSS, manifest and licenses must remain size and hash bound',async()=>{
  for(const path of [fontStylesheet,'assets/fonts/manifest.json',manifest.licenses[0].path])await fixture(async root=>{await writeFile(join(root,path),'invalid');await assert.rejects(loadFontDelivery(root));});
});
test('legacy static artifacts stay explicit; declared fonts cannot silently disappear',()=>fixture(async root=>{
  await buildStaticDelivery({client:root});await rm(join(root,'assets/fonts/manifest.json'));await assert.rejects(loadStaticDelivery(root));
  await writeFile(join(root,'site-manifest.json'),'{}');await assert.rejects(loadStaticDelivery(root));
  const bytes=Buffer.from('body{color:red}'),old=assetRecord('/assets/css/legacy.css',bytes);await mkdir(join(root,old.path,'..'),{recursive:true});await writeFile(join(root,old.path),bytes);
  await writeFile(join(root,'content/asset-files.json'),JSON.stringify({version:deliveryVersion,files:[old]}));assert.equal((await loadStaticDelivery(root)).delivery,true);
  await writeFile(join(root,'site-manifest.json'),JSON.stringify({font_delivery_version:'future'}));await assert.rejects(loadStaticDelivery(root));
}));
