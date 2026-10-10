import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext, Script } from 'node:vm';
import { parse } from 'parse5';
import { renderIndustryDocument } from '../scripts/build-industry-pages.mjs';
import { nodes, attribute, plainText } from '../scripts/build-product-pages.mjs';
import { staticPreview } from '../server/static-preview.mjs';

const products=JSON.parse(await readFile(new URL('../content/products.json',import.meta.url),'utf8'));
const entries=JSON.parse(await readFile(new URL('../content/industries.json',import.meta.url),'utf8'));
const source=await readFile(new URL('../index.html',import.meta.url),'utf8');
const catalog=globalThis.DongDaCatalog.create(products),core=globalThis.DongDaIndustry,industries=core.create(entries,catalog),origin='https://cn-dongda.com';

test('industry schema requires complete translations, exact application mappings and sample heroes',()=>{
  assert.deepEqual(core.validate(entries,catalog),[]);
  const mutations=[
    rows=>rows[1].id=rows[0].id,rows=>rows.pop(),rows=>rows[0].id='../cement',rows=>delete rows[0].name.ru,
    rows=>rows[0].summary.zh='x'.repeat(601),rows=>rows[0].publication='approved',rows=>rows[0].price='1',
    rows=>rows[0].productIds=['pp-woven-bags'],rows=>rows[0].productIds=['materials-construction'],
    rows=>rows[0].productIds=['vacuum'],rows=>rows[0].productIds.push(rows[0].productIds[0]),
    rows=>rows[0].heroProductId='custom-printed-bags',rows=>rows[0].heroProductId='non-woven-bags',
    rows=>rows[0].requirements[0].certificate='verified',rows=>rows[0].requirements[0].body.ru='',rows=>rows[0].requirements=[]
  ];
  for(const mutate of mutations){const rows=structuredClone(entries);mutate(rows);assert.ok(core.validate(rows,catalog).length);assert.throws(()=>core.create(rows,catalog));}
  for(const value of [null,{},[],[null]])assert.ok(core.validate(value,catalog).length);
});
test('immutable industry registry binds only supported physical routes and retains fallback language',()=>{
  assert.ok(Object.isFrozen(industries.entries));assert.ok(Object.isFrozen(industries.entries[0].requirements[0]));
  assert.throws(()=>{industries.entries[0].productIds.push('unknown');});
  for(const locale of core.languages){
    assert.equal(industries.parsePath('/'+locale+'/industries/').entry,null);
    assert.equal(industries.parsePath('/'+locale+'/industries/cement').path,'/'+locale+'/industries/cement/');
  }
  assert.equal(core.path(entries[0],'kk'),'/en/industries/cement/');
  for(const pathname of ['/kk/industries/cement/','/en/industries/nope/','/en/industries/cement/extra','/en/industries/%2f/','//en/industries/'])assert.equal(industries.parsePath(pathname),null);
  assert.throws(()=>core.path({id:"a');alert(1)"},'en'));
});
test('industry metadata preserves all locale alternatives and noindex until business review',()=>{
  for(const entry of [null,...entries])for(const locale of core.languages){
    const info=core.metadata(entry,locale,origin,catalog);
    assert.equal(info.canonical,origin+core.path(entry,locale));assert.equal(info.robots,'noindex,follow');
    assert.equal(info.alternates.length,3);assert.equal(info.schema.inLanguage,locale);
    assert.equal(info.schema['@type'],entry?'WebPage':'CollectionPage');
    for(const field of ['offers','certification','aggregateRating','foundingDate'])assert.equal(info.schema[field],undefined);
    assert.equal(info.image,entry?origin+'/'+catalog.resolve(entry.heroProductId).image:null);
  }
  assert.throws(()=>core.metadata(entries[0],'en','https://x:y@cn-dongda.com/',catalog));
});
test('industry bodies link actual product families, individual RFQ additions and native procurement FAQ',()=>{
  for(const entry of entries)for(const locale of core.languages){
    const document=parse(core.body(entry,locale,catalog,industries.entries));
    assert.equal(nodes(document,n=>n.tagName==='h1').length,1);
    assert.equal(nodes(document,n=>n.tagName==='details').length,2);
    assert.equal(nodes(document,n=>n.tagName==='article').length,entry.productIds.length);
    const image=nodes(document,n=>n.tagName==='img')[0];assert.equal(attribute(image,'src'),'/'+catalog.resolve(entry.heroProductId).image);
    for(const id of entry.productIds){
      assert.ok(nodes(document,n=>n.tagName==='a'&&attribute(n,'href')===globalThis.DongDaProductPage.path(catalog.resolve(id),locale)).length);
      assert.ok(nodes(document,n=>n.tagName==='button'&&attribute(n,'onclick')===`addRfqProduct('${id}')`).length);
    }
    assert.ok(plainText(document).includes(core.text('sample',locale)));assert.ok(plainText(document).includes(core.text('a1',locale)));
  }
  const applications=parse(globalThis.DongDaProductPage.sections(products[0],'ru').applications);
  for(const id of products[0].industries)assert.ok(nodes(applications,n=>attribute(n,'href')===core.path(industries.resolve(id),'ru')).length);
});
test('all fifteen industry documents have localized static bodies, correct SEO and only one active page',()=>{
  for(const entry of [null,...entries])for(const locale of core.languages){
    const document=parse(renderIndustryDocument(source,entry,locale,origin,catalog,industries)),info=core.metadata(entry,locale,origin,catalog);
    const id=value=>nodes(document,n=>attribute(n,'id')===value)[0];
    const active=id(entry?'page-industry-detail':'page-industries');
    assert.equal(attribute(active,'class'),'page on');
    assert.equal(nodes(document,n=>(attribute(n,'class')||'').split(' ').includes('page')&&(attribute(n,'class')||'').split(' ').includes('on')).length,1);
    assert.equal(plainText(nodes(active,n=>n.tagName==='h1')[0]),entry?entry.name[locale]:core.text('title',locale));
    assert.equal(attribute(nodes(document,n=>n.tagName==='html')[0],'lang'),locale);
    assert.equal(attribute(nodes(document,n=>attribute(n,'rel')==='canonical')[0],'href'),info.canonical);
    assert.deepEqual(JSON.parse(plainText(id('industry-seo'))),info.schema);
    assert.equal(nodes(document,n=>attribute(n,'hreflang')==='x-default'&&attribute(n,'href')===origin+core.path(entry,'en')).length,1);
    assert.equal(nodes(id('industry-entry-grid'),n=>n.tagName==='a').length,4);
    assert.ok(attribute(id('pageLoader'),'class').includes('hide'));
    const organization=nodes(document,n=>n.tagName==='script'&&attribute(n,'type')==='application/ld+json'&&!attribute(n,'id'))[0];
    assert.equal(JSON.parse(plainText(organization)).foundingDate,undefined);
  }
});
test('industry copy is escaped in HTML and JSON-LD instead of executing markup',()=>{
  const entry=structuredClone(entries[0]);entry.name.en='<img src=x onerror=alert(1)>';entry.summary.en='</script><script>alert(1)</script>';entry.requirements[0].body.en='<iframe src=javascript:alert(1)>';
  const document=parse(renderIndustryDocument(source,entry,'en',origin,catalog,industries));
  const active=nodes(document,n=>attribute(n,'id')==='page-industry-detail')[0];
  assert.equal(plainText(nodes(active,n=>n.tagName==='h1')[0]),entry.name.en);
  assert.equal(nodes(active,n=>n.tagName==='iframe').length,0);
  assert.equal(nodes(document,n=>n.tagName==='script'&&plainText(n)==='alert(1)').length,0);
  assert.equal(JSON.parse(plainText(nodes(document,n=>attribute(n,'id')==='industry-seo')[0])).description,entry.summary.en);
});
test('industry frontend navigation and localization share the existing page and SEO workflows',async()=>{
  const ui=await readFile(new URL('../assets/js/industry-ui.js',import.meta.url),'utf8'),elements=new Map(),calls=[];
  const context={industryCatalog:industries,lang:'zh',catalog,DongDaIndustry:core,DongDaProductPage:globalThis.DongDaProductPage,DongDaCatalog:globalThis.DongDaCatalog,DongDaCatalogCopy:globalThis.DongDaCatalogCopy,DONGDA_PUBLIC_SEO:{canonical:origin},
    nav:page=>calls.push(page),updatePublicPageSeo:(info,type,id,defaultHref)=>calls.push({info,type,id,defaultHref}),document:{getElementById(id){if(!elements.has(id))elements.set(id,{innerHTML:''});return elements.get(id);},querySelectorAll(){return [];}}};
  new Script(ui);runInNewContext(ui,context);context.renderIndustryEntrypoints();context.navIndustry('cement');
  assert.equal(context.openIndustry,'cement');assert.equal(calls.at(-1),'industry-detail');
  assert.ok(elements.get('page-industry-detail').innerHTML.includes(entries[0].name.zh));
  context.lang='ru';context.renderIndustryDetail('cement');assert.ok(elements.get('page-industry-detail').innerHTML.includes(entries[0].name.ru));
  context.updateIndustrySeo(entries[0]);assert.equal(calls.at(-1).info.canonical,origin+'/ru/industries/cement/');
  context.navIndustry('missing');assert.equal(calls.at(-1),'industries');
  context.openIndustry=null;
  const restored=context.restoreIndustryPage('/ru/industries/cement/');assert.equal(restored.entry.id,'cement');assert.equal(context.openIndustry,'cement');
  context.renderIndustryDetail(context.openIndustry);assert.ok(elements.get('page-industry-detail').innerHTML.includes(entries[0].name.ru));
  assert.match(source,/var initialIndustryPage=restoreIndustryPage\(location.pathname\);/);
  context.restoreIndustryPage('/ru/industries/');assert.equal(context.openIndustry,null);
});
test('generated browser content matches the canonical industry seed without private editorial fields',async()=>{
  const seed=await readFile(new URL('../assets/js/catalog-data.js',import.meta.url),'utf8'),context={};runInNewContext(seed,context);
  assert.equal(JSON.stringify(context.DONGDA_INDUSTRY_DATA),JSON.stringify(entries));
  assert.deepEqual(core.validate(context.DONGDA_INDUSTRY_DATA,catalog),[]);
});
test('industry HTTP paths normalize directories and index files, retain query and return real missing-page errors',async t=>{
  const root=await mkdtemp(join(tmpdir(),'dongda-industries-'));const entry=entries[0],path=core.path(entry,'zh');
  await mkdir(join(root,path),{recursive:true});await writeFile(join(root,path,'index.html'),renderIndustryDocument(source,entry,'zh',origin,catalog,industries));await writeFile(join(root,'404.html'),'NOT-FOUND');
  const server=createServer(staticPreview(root));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});});
  const page=await fetch(base+path);assert.equal(page.status,200);assert.ok((await page.text()).includes(entry.name.zh));
  for(const pathname of [path.slice(0,-1),path+'index.html']){const response=await fetch(base+pathname+'?source=test',{redirect:'manual'});assert.equal(response.status,301);assert.equal(response.headers.get('location'),path+'?source=test');}
  assert.equal((await fetch(base+path,{method:'HEAD'})).status,200);assert.equal(await (await fetch(base+path,{method:'HEAD'})).text(),'');
  assert.equal((await fetch(base+'/zh/industries/missing/')).status,404);assert.equal((await fetch(base+path,{method:'POST'})).status,405);
});
