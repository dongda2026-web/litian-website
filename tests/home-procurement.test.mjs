import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parse} from 'parse5';
import {localizeHomeProcurement} from '../scripts/build-home-procurement.mjs';
import {auditHomeDocument} from '../scripts/audit-home-procurement.mjs';
import {nodes,attribute,inner,setAttribute} from '../scripts/build-product-pages.mjs';
const core=globalThis.DongDaHomeProcurement;
const source=await readFile(new URL('../index.html',import.meta.url),'utf8');
const catalog=globalThis.DongDaCatalog.create(JSON.parse(await readFile(new URL('../content/products.json',import.meta.url),'utf8')));

test('home copy is immutable, complete, plain and has explicit fallback',()=>{
  assert.ok(Object.isFrozen(core));assert.ok(Object.isFrozen(core.keys));
  for(const locale of core.languages)for(const key of core.keys){assert.equal(typeof core.text(key,locale),'string');assert.ok(core.text(key,locale).trim());assert.doesNotMatch(core.text(key,locale),/<[^>]*>/);}
  for(const locale of ['kk','ky','tg','tk','uz','invalid',null])assert.equal(core.text('threeDetail',locale),core.text('threeDetail','en'));
  assert.throws(()=>core.text('constructor','en'),TypeError);assert.throws(()=>core.text('unapproved','en'),TypeError);
});
test('procurement links use actual routes without adding selections',()=>{
  for(const locale of core.languages){assert.equal(core.links(locale).request,'/#rfq');assert.equal(core.links(locale).prepare,'/'+locale+'/resources/');assert.ok(Object.isFrozen(core.links(locale)));}
  assert.equal(core.links('uz').prepare,'/en/resources/');
});
test('featured cards are canonical products, not technical factory references',()=>{
  const html=core.cards(catalog,'en'),document=parse(html);
  assert.equal(nodes(document,n=>attribute(n,'class')==='catalog-product-link').length,3);
  assert.match(html,/\/en\/products\/fibc-bulk-bags\//);assert.doesNotMatch(html,/materials-construction|500 - 2000|SF 5:1/);
  assert.match(html,/catalog-media-caption/,'Existing customer example is labelled, not approval');
});
for(const locale of core.languages)test('home static and runtime share copy/cards: '+locale,()=>{
  const document=parse(source);localizeHomeProcurement(document,locale,catalog);
  const check=auditHomeDocument(document,locale,catalog);assert.equal(check.cards,3);
});
test('home audit fails if legacy translation can overwrite a governed field',()=>{
  const document=parse(source);localizeHomeProcurement(document,'en',catalog);
  const node=nodes(document,n=>attribute(n,'data-home-copy')==='lead')[0];setAttribute(node,'data-i','poster_sub');
  assert.throws(()=>auditHomeDocument(document,'en',catalog),/Legacy copy owner/);
});
test('home audit rejects missing hooks, drifted copy and altered links',()=>{
  for(const mutate of [document=>inner(nodes(document,n=>attribute(n,'data-home-copy')==='lead')[0],'500M+'),document=>setAttribute(nodes(document,n=>attribute(n,'data-home-link')==='prepare')[0],'href','/fake/'),document=>inner(nodes(document,n=>attribute(n,'class')==='series-grid')[0],'')]){
    const document=parse(source);localizeHomeProcurement(document,'en',catalog);mutate(document);assert.throws(()=>auditHomeDocument(document,'en',catalog));
  }
  assert.throws(()=>localizeHomeProcurement(parse('<html><body></body></html>'),'en',catalog),/Missing homepage series/);
});
