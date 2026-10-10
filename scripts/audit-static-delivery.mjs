import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parse} from 'parse5';
import {htmlFiles,linkedAssets} from './build-static-delivery.mjs';
import {attribute} from './build-product-pages.mjs';
import {loadStaticDelivery} from './load-static-delivery.mjs';
import {validateAssetManifest,deliveryVersion,digest} from './static-delivery-core.mjs';
import {loadFontDelivery,fontDeliveryVersion,fontStylesheet} from './font-delivery.mjs';

export async function auditStaticDelivery(root=process.cwd()) {
  const client=join(root,'dist/client'),manifest=validateAssetManifest(JSON.parse(await readFile(join(client,'content/asset-files.json')))),options=await loadStaticDelivery(client);
  const site=JSON.parse(await readFile(join(client,'site-manifest.json')));assert.equal(site.static_delivery_version,deliveryVersion);
  const fonts=await loadFontDelivery(client);assert.equal(site.font_delivery_version,fontDeliveryVersion);
  assert.equal(manifest.files.find(file=>file.originalPath===fontStylesheet)?.sha256,fonts.manifest.stylesheet.sha256);
  const used=new Set(),pages=await htmlFiles(client);let references=0;
  for(const path of pages){
    const document=parse(await readFile(join(client,path),'utf8'));
    assert.doesNotMatch(await readFile(join(client,path),'utf8'),/https:\/\/fonts\.(googleapis|gstatic)\.com/,'Remote font dependency in '+path);
    for(const {node,key} of linkedAssets(document)){
      const url=new URL(attribute(node,key),'https://static.invalid/');if(url.origin!=='https://static.invalid')continue;
      const file=manifest.files.find(file=>file.path===url.pathname);assert.ok(file,'Unversioned local executable/style reference in '+path);assert.equal(url.search,'');assert.equal(url.hash,'');assert.equal(attribute(node,'integrity'),file.integrity);used.add(file.path);references++;
    }
  }
  assert.equal(used.size,manifest.files.length);
  for(const file of manifest.files){const alias=await readFile(join(client,file.originalPath));assert.equal(digest(alias),file.sha256);assert.equal(alias.length,file.size);}
  const actual=[];
  async function walk(prefix){for(const entry of await readdir(join(client,prefix),{withFileTypes:true})){const path=prefix+'/'+entry.name;assert.equal(entry.isSymbolicLink(),false);if(entry.isDirectory())await walk(path);else actual.push(path);}}
  await walk('/assets/releases');assert.deepEqual(actual.sort(),manifest.files.map(file=>file.path).sort());
  const headers=await readFile(join(client,'_headers'),'utf8');assert.doesNotMatch(headers,/\/assets\/\*\s+Cache-Control:.*immutable/);assert.match(headers,/\/assets\/releases\/\*\s+Cache-Control: public, max-age=31536000, immutable/);assert.match(headers,/\/assets\/js\/\*\s+Cache-Control: no-store/);assert.match(headers,/\/assets\/css\/\*\s+Cache-Control: no-store/);
  for(const file of fonts.manifest.files)assert.ok(headers.includes(file.path+'\n  Cache-Control: public, max-age=31536000, immutable'));
  const actualFonts=(await readdir(join(client,'assets/fonts'))).filter(path=>path.endsWith('.woff2')).sort();assert.deepEqual(actualFonts,fonts.manifest.files.map(file=>file.path.split('/').at(-1)).sort());
  const documents=JSON.parse(await readFile(join(client,'content/resource-files.json')));for(const file of documents.files){assert.ok(headers.includes(file.path+'\n  Cache-Control: public, max-age=31536000, immutable'));assert.ok(headers.includes(file.legacyPath+'\n  Cache-Control: no-store'));}
  const source=await readFile(join(root,'dist/server/index.js'),'utf8'),worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
  for(const path of options.immutablePaths){
    const ok=await worker.fetch(new Request('https://static.invalid'+path),{ASSETS:{fetch:async()=>new Response('fixture',{status:200})}});assert.match(ok.headers.get('cache-control'),/immutable/);
    const missing=await worker.fetch(new Request('https://static.invalid'+path),{ASSETS:{fetch:async()=>new Response('fixture',{status:404,headers:{'Cache-Control':'immutable'}})}});assert.equal(missing.status,404);assert.equal(missing.headers.get('cache-control'),'no-store');
  }
  for(const path of ['/','/content/asset-files.json','/assets/js/catalog-data.js','/assets/css/resources.css','/assets/releases/unknown/a.js'])assert.equal((await worker.fetch(new Request('https://static.invalid'+path),{ASSETS:{fetch:async()=>new Response('fixture')}})).headers.get('cache-control'),'no-store');
  const result={passed:true,scope:'offline artifact and synthetic static worker, not cloud',version:deliveryVersion,fontVersion:fontDeliveryVersion,fontFiles:fonts.manifest.files.length,fontFaces:fonts.checks.faces,pages:pages.length,assets:manifest.files.length,references,documents:documents.files.length,unknownImmutableFiles:0};process.stdout.write(JSON.stringify(result)+'\n');return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await auditStaticDelivery();
