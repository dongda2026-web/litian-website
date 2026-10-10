import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { Script, runInNewContext } from 'node:vm';
import '../assets/js/catalog-core.js';
import '../assets/js/procurement-core.js';
import { validateLead } from '../server/inquiry-service.mjs';

const products=JSON.parse(await readFile(new URL('../content/products.json',import.meta.url),'utf8'));
const core=globalThis.DongDaCatalog;
const catalog=core.create(products);
const clone=()=>structuredClone(products);

test('one catalog preserves six product families and the separate material module',()=>{
  assert.deepEqual(core.validate(products),[]);
  assert.equal(catalog.search({}).length,6);
  assert.equal(catalog.all.filter(product=>product.homepage).length,4);
  assert.equal(catalog.resolve('materials-construction').kind,'technical');
  assert.ok(Object.isFrozen(catalog.all[0].configuration[0].opts));
  assert.notEqual(catalog.all[0],products[0]);
});
test('all former detail/configurator identifiers resolve to stable inquiry IDs',()=>{
  for(const [alias,id] of Object.entries({vacuum:'fibc-bulk-bags',fibc:'fibc-bulk-bags',laminated:'valve-bags',valve:'valve-bags',woven:'pp-woven-bags',kraft:'non-woven-bags',nonwoven:'non-woven-bags',foil:'aluminum-foil-bags',custom:'custom-printed-bags'})) assert.equal(catalog.resolve(alias).id,id);
  assert.equal(catalog.resolve('not-a-product'),undefined);
});
test('multilingual search uses AND tokens and intersects family with application',()=>{
  assert.deepEqual(catalog.search({query:'FIBC bulk'}).map(product=>product.id),['fibc-bulk-bags']);
  assert.deepEqual(catalog.search({query:'吨袋'}).map(product=>product.id),['fibc-bulk-bags']);
  assert.deepEqual(catalog.search({query:'клапанные'}).map(product=>product.id),['valve-bags']);
  assert.deepEqual(catalog.search({query:'ＰＰ',family:'woven',industry:'agriculture'}).map(product=>product.id),['pp-woven-bags']);
  assert.equal(catalog.search({family:'valve',industry:'agriculture'}).length,0);
  assert.equal(catalog.search({query:'<script>'}).length,0);
  assert.equal(catalog.search({family:'unknown'}).length,0);
  assert.ok(catalog.search({query:'水泥'}).some(product=>product.id==='valve-bags'));
});
test('public intake independently validates requested product, options and matching quantity',()=>{
  const lead={type:'quote-calculator',company:'Synthetic Catalog Buyer',contact:'Synthetic QA',email:'qa@example.test',product:'FIBC',productId:'fibc-bulk-bags',quantity:'1000',quantityUnit:'pcs',specifications:{capacity:'1000',sling:'4loop',liner:'pe',discharge:'bot',qty:'1000'}};
  assert.equal(validateLead(lead).productId,'fibc-bulk-bags');
  assert.equal(validateLead({...lead,productId:'fibc'}).productId,'fibc');
  for(const invalid of [
    {...lead,productId:'unknown'}, {...lead,productId:'materials-construction'},
    {...lead,quantity:'2'}, {...lead,specifications:{...lead.specifications,capacity:'unapproved'}},
    {...lead,specifications:{...lead.specifications,price:'1'}}, {...lead,specifications:null}
  ])assert.throws(()=>validateLead(invalid),error=>error.status===422);
});
test('comparison sanitizes stale IDs and aliases, deduplicates and enforces three products',()=>{
  assert.deepEqual(catalog.selection(['fibc','vacuum','materials-construction','unknown','valve','woven','foil']),['fibc-bulk-bags','valve-bags','pp-woven-bags']);
  assert.equal(catalog.toggle(['fibc','valve','woven'],'foil').reason,'limit');
  assert.deepEqual(catalog.toggle(['fibc','valve'],'vacuum').ids,['valve-bags']);
  assert.equal(catalog.toggle([], 'materials-construction').reason,'invalid');
  assert.deepEqual(catalog.selection({id:'fibc'}),[]);
});
test('invalid schema, duplicate IDs, unsafe images and incomplete translations fail closed',()=>{
  const mutations=[
    items=>items[1].aliases.push(items[0].id),
    items=>items[0].image='https://example.com/a.jpg',
    items=>items[0].image='assets/img/../a.jpg',
    items=>delete items[0].name.ru,
    items=>items[0].configuration[0].opts[0].v=items[0].configuration[0].opts[1].v,
    items=>items[0].configuration[0].opts=items[0].configuration[0].opts.filter(opt=>opt.v!=='review'),
    items=>items[0].configuration.at(-1).min=1000,
    items=>items[6].configuration=items[0].configuration,
    items=>items[0].base=85,
    items=>items[0].configuration[0].opts[0].m=1.2,
    items=>items[0].reviewStatus='ready',
    items=>items[0].specs[0].id='certificate',
    items=>items[0].industries=['food-grade']
  ];
  for(const mutate of mutations){const items=clone();mutate(items);assert.ok(core.validate(items).length);assert.throws(()=>core.create(items),TypeError);}
  for(const value of [null,{},[],[null]])assert.ok(core.validate(value).length);
});
test('requested configurations retain numeric units but do not invent MOQ, price or certification',()=>{
  for(const product of catalog.search({})){
    assert.equal(globalThis.DongDaProcurement.minimumQuantity(product),1);
    const values=Object.fromEntries(product.configuration.map(field=>[field.id,field.type==='qty'?'100':field.opts[0].v]));
    assert.deepEqual(globalThis.DongDaProcurement.validateConfiguration(product,values),{});
    assert.equal(globalThis.DongDaProcurement.configurationRows(product,values,'ru').at(-1).value,'100 pcs');
    assert.ok(globalThis.DongDaProcurement.validateConfiguration(product,{...values,qty:'0'}).qty);
  }
  assert.doesNotMatch(JSON.stringify(products),/FDA|ISO|SGS|ESD|99\.9|moqK|"base"|"m":/);
  assert.equal(core.localized(products[0].name,'kk'),products[0].name.en);
});
test('all catalog images exist and the browser seed exactly matches the canonical JSON',async()=>{
  for(const product of products)await access(new URL('../'+product.image,import.meta.url));
  const source=await readFile(new URL('../assets/js/catalog-data.js',import.meta.url),'utf8');
  const context={};runInNewContext(source,context);
  assert.equal(JSON.stringify(context.DONGDA_CATALOG_DATA),JSON.stringify(products));
  assert.deepEqual(Object.keys(context.DONGDA_CATALOG_ICONS).sort(),['Search','X','ArrowRight','SlidersHorizontal','Columns3','ListPlus','ClipboardList','Trash2','Pencil'].sort());
});
test('static source uses catalog-derived products and all script blocks parse',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/const PRODS=\[|const Q_PRODUCTS\s*=\s*\[/);
  assert.match(html,/var Q_PRODUCTS = PRODS;/);
  for(const [,attrs,body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    if(!attrs.includes('application/ld+json')&&!attrs.includes(' src='))new Script(body);
  }
});
