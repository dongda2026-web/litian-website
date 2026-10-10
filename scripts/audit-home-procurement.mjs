import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parse} from 'parse5';
import {nodes,attribute,plainText} from './build-product-pages.mjs';
import '../assets/js/home-procurement-core.js';

export function auditHomeDocument(document,locale,catalog){
  const core=globalThis.DongDaHomeProcurement,home=nodes(document,n=>attribute(n,'id')==='page-home')[0];
  assert.ok(home,'Homepage missing');
  const copy=nodes(home,n=>attribute(n,'data-home-copy')!==undefined),keys=copy.map(n=>attribute(n,'data-home-copy'));
  assert.deepEqual(keys.slice().sort(),core.keys.filter(key=>key!=='pathLabel').slice().sort(),'Homepage copy hooks drifted');
  for(const node of copy){assert.equal(attribute(node,'data-i'),undefined,'Legacy copy owner must not return');assert.equal(plainText(node),core.text(attribute(node,'data-home-copy'),locale));}
  const classNodes=className=>nodes(home,n=>(attribute(n,'class')||'').split(' ').includes(className));
  assert.equal(classNodes('poster-microproof').length,0);assert.equal(classNodes('launch-proof').length,0);
  assert.equal(classNodes('home-procurement-path').length,1);
  assert.equal(attribute(classNodes('home-procurement-path')[0],'aria-label'),core.text('pathLabel',locale));
  const links=nodes(home,n=>attribute(n,'data-home-link')!==undefined);assert.equal(links.length,4);
  for(const link of links)assert.equal(attribute(link,'href'),core.links(locale)[attribute(link,'data-home-link')]);
  const grid=classNodes('series-grid')[0];
  const products=catalog.search({}).filter(product=>product.homepage);
  const cards=nodes(grid,n=>attribute(n,'class')==='catalog-product-link');assert.equal(cards.length,products.length);
  cards.forEach((card,i)=>{assert.equal(attribute(card,'href'),globalThis.DongDaProductPage.path(products[i],locale));assert.ok(plainText(card).includes(globalThis.DongDaCatalog.localized(products[i].name,locale)));});
  assert.equal(nodes(grid,n=>attribute(n,'src')==='assets/img/img_303d639a4a.jpg').length,0,'Factory reference must not become a product image');
  const headings=nodes(home,n=>n.tagName==='h1');assert.equal(headings.length,1);assert.ok(plainText(headings[0]).includes('DongDa'));
  return {locale,copyFields:copy.length,cards:cards.length,links:links.length};
}
export async function auditHomeProcurement(root=process.cwd()){
  const client=join(root,'dist/client'),manifest=JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8'));
  assert.equal(manifest.home_procurement_version,globalThis.DongDaHomeProcurement.version);
  const catalog=globalThis.DongDaCatalog.create(JSON.parse(await readFile(join(root,'content/products.json'),'utf8'))),checks=[];
  for(const path of manifest.pages){const document=parse(await readFile(join(client,path),'utf8')),locale=attribute(nodes(document,n=>n.tagName==='html')[0],'lang');checks.push(auditHomeDocument(document,locale,catalog));}
  process.stdout.write(`Homepage procurement audit: ${checks.length} documents; ${checks[0].cards} canonical featured products; ${checks[0].copyFields} neutral fields. Remaining company claims are NOT approved.\n`);
  return checks;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await auditHomeProcurement();
