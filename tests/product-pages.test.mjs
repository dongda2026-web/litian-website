import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { parse } from 'parse5';
import { renderProductDocument, nodes, attribute, plainText } from '../scripts/build-product-pages.mjs';
import { staticPreview } from '../server/static-preview.mjs';

const products=JSON.parse(await readFile(new URL('../content/products.json',import.meta.url),'utf8'));
const catalog=globalThis.DongDaCatalog.create(products), core=globalThis.DongDaProductPage;
const source=await readFile(new URL('../index.html',import.meta.url),'utf8');
const origin='https://cn-dongda.com';

test('product routes bind canonical IDs to supported locales and retain old aliases',()=>{
  assert.equal(core.path(catalog.resolve('fibc'),'zh'),'/zh/products/fibc-bulk-bags/');
  assert.equal(core.path(catalog.resolve('fibc'),'kk'),'/en/products/fibc-bulk-bags/');
  assert.equal(core.parsePath('/ru/products/vacuum/',catalog).path,'/ru/products/fibc-bulk-bags/');
  assert.equal(core.parsePath('/en/products/fibc-bulk-bags',catalog).language,'en');
  for(const path of ['/zh/products/no-product/','/ru/products/materials-construction/','/kk/products/fibc/','/en/products/%2f/','/en/products/fibc/extra','//en/products/fibc/'])assert.equal(core.parsePath(path,catalog),null);
  assert.throws(()=>core.path(catalog.resolve('materials-construction'),'en'));
  assert.throws(()=>core.path({id:"a');alert(1)",kind:'product'},'en'));
});
test('publication origin cannot embed credentials, query parameters or non-HTTPS schemes',()=>{
  assert.equal(core.origin(origin+'/'),origin);
  for(const invalid of ['http://cn-dongda.com','javascript:alert(1)','https://x:y@cn-dongda.com/','https://cn-dongda.com/path','https://cn-dongda.com/?token=test','https://cn-dongda.com/#x'])assert.throws(()=>core.origin(invalid));
});
test('three-language SEO is truthful, canonical and does not invent offers or certification',()=>{
  for(const product of catalog.search({}))for(const language of core.languages){
    const info=core.metadata(product,language,origin);
    assert.equal(info.title,product.name[language]+' | DongDa');
    assert.equal(info.description,product.summary[language]);
    assert.equal(info.canonical,origin+core.path(product,language));
    assert.equal(info.alternates.length,3);
    assert.equal(info.robots,product.mediaRole==='production-reference'?'noindex,follow':'index,follow');
    assert.equal(info.image===null,product.mediaRole==='production-reference');
    assert.equal(info.schema.offers,undefined);assert.equal(info.schema.aggregateRating,undefined);assert.equal(info.schema.certification,undefined);
  }
});
test('shared product body includes reviewed media roles, request links, procurement questions and honest file state',()=>{
  for(const product of catalog.search({}))for(const language of core.languages){
    const content=core.sections(product,language);
    assert.ok(content.specs.includes(globalThis.DongDaCatalogCopy.text('review',language)));
    assert.ok(content.aside.includes('/#quote/'+product.id));assert.ok(content.aside.includes('/#inquiry/'+product.id));
    assert.ok(content.support.includes(globalThis.DongDaCatalogCopy.text('documentsNote',language)));
    assert.equal(content.media.includes('<img'),product.mediaRole!=='production-reference');
    if(product.mediaRole==='production-reference')assert.ok(!content.media.includes(product.image));
  }
  assert.throws(()=>core.sections({...products[0],image:'javascript:alert(1)'},'en'));
});
test('all 18 prerendered product documents have visible localized HTML before JavaScript',()=>{
  for(const product of catalog.search({}))for(const language of core.languages){
    const document=parse(renderProductDocument(source,product,language,origin));
    const id=value=>nodes(document,n=>attribute(n,'id')===value)[0];
    assert.equal(attribute(nodes(document,n=>n.tagName==='html')[0],'lang'),language);
    assert.equal(plainText(id('pd-name')),product.name[language]);
    assert.equal(plainText(id('pd-desc')),product.summary[language]);
    assert.equal(plainText(id('nav-lang-btn')),{en:'EN',zh:'中',ru:'RU'}[language]);
    assert.equal(plainText(nodes(document,n=>attribute(n,'data-nav')==='products')[0]),{en:'Products',zh:'产品',ru:'Продукция'}[language]);
    assert.equal(attribute(id('page-product-detail'),'class'),'page on');
    assert.equal(attribute(id('page-home'),'class'),'page');
    assert.ok(attribute(id('pageLoader'),'class').includes('hide'));
    for(const spec of product.specs)assert.ok(plainText(id('pd-specs')).includes(spec.value[language]));
    assert.equal(nodes(id('pd-support'),n=>n.tagName==='details').length,2);
    assert.deepEqual(JSON.parse(plainText(id('product-seo'))),core.metadata(product,language,origin).schema);
  }
});
test('HTML rendering escapes untrusted copy, including closing script tags in JSON-LD',()=>{
  const product=structuredClone(products[0]);product.name.en='A <img src=x onerror=alert(1)> & "test"';product.summary.en='</script><script>alert(1)</script>';
  const document=parse(renderProductDocument(source,product,'en',origin));
  const id=value=>nodes(document,n=>attribute(n,'id')===value)[0];
  assert.equal(plainText(id('pd-name')),product.name.en);
  assert.equal(nodes(id('pd-name'),n=>n.tagName==='img').length,0);
  assert.equal(plainText(id('pd-desc')),product.summary.en);
  assert.equal(JSON.parse(plainText(id('product-seo'))).description,product.summary.en);
  assert.equal(nodes(document,n=>n.tagName==='script'&&plainText(n)==='alert(1)').length,0);
});
test('shared related cards expose crawlable language URLs without unverified product photos',()=>{
  for(const product of catalog.search({}))for(const language of core.languages){
    const document=parse(core.card(product,language));
    assert.equal(attribute(nodes(document,n=>n.tagName==='a')[0],'href'),core.path(product,language));
    assert.equal(nodes(document,n=>n.tagName==='img').length,product.mediaRole==='production-reference'?0:1);
    assert.ok(plainText(document).includes(product.name[language]));
  }
});
test('static delivery supports directory/index normalization, true 404, HEAD and traversal isolation',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'dongda-pages-')),root=join(folder,'public');
  await mkdir(join(root,'en/products/fibc-bulk-bags'),{recursive:true});
  await writeFile(join(root,'index.html'),'ROOT');await writeFile(join(root,'404.html'),'DONGDA-NOT-FOUND');
  await writeFile(join(root,'en/products/fibc-bulk-bags/index.html'),'PRODUCT');await writeFile(join(root,'.env'),'PRIVATE');
  await writeFile(join(folder,'private.txt'),'PRIVATE');await symlink(join(folder,'private.txt'),join(root,'leak.txt'));
  const server=createServer(staticPreview(root,html=>html+'-LOCAL-ENDPOINT'));
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
    const product=await fetch(base+'/en/products/fibc-bulk-bags/');assert.equal(product.status,200);assert.equal(await product.text(),'PRODUCT-LOCAL-ENDPOINT');
    const bare=await fetch(base+'/en/products/fibc-bulk-bags?x=1',{redirect:'manual'});assert.equal(bare.status,301);assert.equal(bare.headers.get('location'),'/en/products/fibc-bulk-bags/?x=1');
    const index=await fetch(base+'/en/products/fibc-bulk-bags/index.html',{redirect:'manual'});assert.equal(index.status,301);assert.equal(index.headers.get('location'),'/en/products/fibc-bulk-bags/');
    const head=await fetch(base+'/en/products/fibc-bulk-bags/',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
    for(const path of ['/en/products/missing/','/assets/missing.png','/%2eenv','/.env','/%2e%2e%2fprivate.txt','/leak.txt','/%00']){const r=await fetch(base+path);assert.equal(r.status,404,path);assert.equal(await r.text(),'DONGDA-NOT-FOUND');}
    const write=await fetch(base+'/',{method:'POST'});assert.equal(write.status,405);assert.equal(write.headers.get('allow'),'GET, HEAD');
  }finally{await new Promise(resolve=>server.close(resolve));await rm(folder,{recursive:true,force:true});}
});
