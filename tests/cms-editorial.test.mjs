import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {parse} from 'acorn';
import {editorialSchemaVersion as schemaVersion, historySchemaVersion, legacySchemaVersion, seedRecords, composeExport, digest, getPath, setPath, textLimit} from '../cms/content-contract.mjs';
import {maxExportBytes} from '../cms/service.mjs';

const read = async name => JSON.parse(await fs.readFile(new URL('../content/'+name+'.json', import.meta.url)));
const products = await read('products'), industries = await read('industries'), history = await read('company-history');
const editorial = {insights: await read('insights'), resources: await read('resources')};
const seeds = seedRecords(products, industries, history, editorial), clone = value => structuredClone(value);
const seedFor = kind => seeds.find(seed => seed.kind === kind);
const row = (seed, status = 'publish') => ({postId: seeds.indexOf(seed)+1, kind: seed.kind, id: seed.id, data:clone(seed.data), baselineHash:seed.baselineHash, revision:1, modifiedAt:'2026-10-09T12:00:00Z', status});
const envelope = (records = [], scope = 'published', schema = schemaVersion) => ({schema, scope, records});
const compose = (data, scope = 'published') => composeExport(data, products, industries, scope, history, editorial);

test('editorial CMS registers 44 canonical records without changing the 31 old baselines', () => {
  assert.equal(seeds.length,44); assert.deepEqual(seeds.slice(0,31),seedRecords(products,industries,history));
  for (const [kind,count] of [['insight',3],['resource',4],['resource-field',6]]) assert.equal(seeds.filter(seed=>seed.kind===kind).length,count);
  for (const seed of seeds.slice(31)) {
    assert.ok(seed.editable.every(field=>typeof getPath(seed.data,field)==='string'));
    assert.ok(seed.editable.every(field=>/\.(zh|en|ru)$/.test(field)));
    assert.equal(seed.baselineHash,digest(seed.data));
  }
  assert.equal(seedFor('insight').editable.length,42);
});
test('guide text and FAQ edits preserve dates, topics, structure, image and publication restrictions', () => {
  const original=clone(editorial), changed=row(seedFor('insight'));
  changed.data.title.zh='Synthetic guide'; changed.data.sections[0].body.en='Synthetic body'; changed.data.faq[0].answer.ru='Synthetic answer';
  const result=compose(envelope([changed])), guide=result.insights.entries[0];
  assert.equal(guide.title.zh,'Synthetic guide'); assert.equal(guide.sections[0].body.en,'Synthetic body'); assert.equal(guide.faq[0].answer.ru,'Synthetic answer');
  for (const key of ['id','kind','topic','updatedAt','reviewStatus','productIds','heroProductId']) assert.deepEqual(guide[key],editorial.insights.entries[0][key]);
  assert.deepEqual(editorial,original); assert.deepEqual(result.resources,editorial.resources); assert.deepEqual(result.companyHistory,history);
});
test('resource titles and common fields compose once and feed actual TXT rendering without replacing source', () => {
  const original=clone(editorial);
  const entry=row(seedFor('resource')), field=row(seedFor('resource-field'));
  entry.data.title.zh='Synthetic checklist'; field.data.hint.zh='Synthetic common requirement';
  const result=compose(envelope([entry,field])), catalog=globalThis.DongDaCatalog.create(products), registry=globalThis.DongDaResources.create(result.resources,catalog);
  for (const item of registry.entries) {
    const text=globalThis.DongDaResources.downloadText(item,'zh',registry); assert.match(text,/Synthetic common requirement/);
    assert.equal(item.version,'1.0'); assert.equal(item.updatedAt,editorial.resources.entries.find(old=>old.id===item.id).updatedAt);
    assert.ok(item.fieldIds.includes(field.id));
  }
  assert.deepEqual(editorial,original);
  assert.notEqual(result.resources.fields[0].hint.zh,editorial.resources.fields[0].hint.zh);
});
test('editorial writers cannot replace IDs, product mappings, dates, editions, review flags or section structure', () => {
  const changes={
    insight:[data=>data.reviewStatus='approved',data=>data.updatedAt='2026-10-09',data=>data.topic='samples',data=>data.productIds.reverse(),data=>data.heroProductId='valve-bags',data=>data.sections.reverse(),data=>data.sections[0].id='different',data=>data.faq.push(clone(data.faq[0]))],
    resource:[data=>data.id='different',data=>data.productId='valve-bags',data=>data.kind='certificate',data=>data.version='2.0',data=>data.updatedAt='2026-10-09',data=>data.fieldIds.reverse()],
    'resource-field':[data=>data.id='different',data=>data.customerId='private',data=>data.label.kk='unknown']
  };
  for (const [kind,edits] of Object.entries(changes)) for (const edit of edits) {const changed=row(seedFor(kind));edit(changed.data);assert.throws(()=>compose(envelope([changed])),/protected/);}
});
test('editorial fields enforce independent schema text limits and UTF-16 boundaries', () => {
  for (const kind of ['insight','resource','resource-field']) {
    const seed=seedFor(kind);
    for (const field of seed.editable) {
      const changed=row(seed), limit=textLimit(field,kind); setPath(changed.data,field,'x'.repeat(limit)); assert.equal(compose(envelope([changed])).changedRecords,1);
      setPath(changed.data,field,'x'.repeat(limit+1)); assert.throws(()=>compose(envelope([changed])),/plain-text/);
    }
  }
  const changed=row(seedFor('insight')); changed.data.title.en='\u{1f600}'.repeat(80); assert.equal(compose(envelope([changed])).changedRecords,1);
  changed.data.title.en+='x';assert.throws(()=>compose(envelope([changed])),/plain-text/);
});
test('editorial text rejects HTML, all controls, missing locales and extra language fields', () => {
  for (const kind of ['insight','resource','resource-field']) for (const value of ['', ' ', '<img src=x>', '\nline','\ttext','bad\u007f']) {
    const seed=seedFor(kind), changed=row(seed);setPath(changed.data,seed.editable[0],value);assert.throws(()=>compose(envelope([changed])),/plain-text/);
  }
  const changed=row(seedFor('insight'));delete changed.data.sections[0].body.ru;assert.throws(()=>compose(envelope([changed])),/plain-text/);
  const extra=row(seedFor('resource'));extra.data.summary.fr='unknown';assert.throws(()=>compose(envelope([extra])),/protected/);
});
test('v1 and v2 exports leave editorial content intact and cannot ingest new kinds', () => {
  for (const [schema,seed] of [[legacySchemaVersion,seeds[0]],[historySchemaVersion,seeds[11]]]) {
    const changed=row(seed);setPath(changed.data,seed.editable[0],'Synthetic compatible text');
    const result=compose(envelope([changed],'published',schema));assert.deepEqual(result.insights,editorial.insights);assert.deepEqual(result.resources,editorial.resources);
    for (const kind of ['insight','resource','resource-field']) assert.throws(()=>compose(envelope([row(seedFor(kind))],'published',schema)),/Unknown/);
  }
});
test('v3 prevents duplicates, stale mappings, draft publication and 45-record overflow', () => {
  const changed=row(seedFor('insight'));
  assert.throws(()=>compose(envelope([changed,changed])),/duplicate/);
  changed.baselineHash='stale';assert.throws(()=>compose(envelope([changed])),/stale/);
  assert.throws(()=>compose(envelope([row(seedFor('resource'),'draft')])),/Draft/);
  assert.equal(compose(envelope([row(seedFor('resource'),'draft')],'preview'),'preview').changedRecords,1);
  assert.throws(()=>compose(envelope(Array.from({length:45},()=>row(seeds[0])))),/envelope/);
});
test('all 44 maximum-length valid records fit the existing bounded private export reader', () => {
  const records=seeds.map(seed=>{const next=row(seed);for(const field of seed.editable)setPath(next.data,field,'\u5b57'.repeat(textLimit(field,seed.kind)));return next;});
  const data=envelope(records);assert.ok(Buffer.byteLength(JSON.stringify(data))<maxExportBytes);assert.equal(compose(data).changedRecords,44);
  assert.equal(compose(data).companyHistory.reviewStatus,'legacy-pending');assert.ok(compose(data).insights.entries.every(item=>item.reviewStatus==='editorial-review-pending'));
});
test('invalid editorial source structure cannot become an export baseline', () => {
  assert.throws(()=>seedRecords(products,industries,history,{...editorial,privateNotes:[]}),/baseline/);
  const changed=clone(editorial);changed.resources.entries[0].productId='unknown';assert.throws(()=>seedRecords(products,industries,history,changed),/resource/);
  changed.resources=clone(editorial.resources);changed.insights.entries[0].heroProductId='non-woven-bags';assert.throws(()=>seedRecords(products,industries,history,changed),/insight/);
});
test('actual private editor helper labels and limits agree with the canonical contract for every field', async () => {
  const source=await fs.readFile(new URL('../cms/wordpress/history-candidate/admin.js',import.meta.url),'utf8'), found=new Map();
  function walk(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration')found.set(node.id.name,source.slice(node.start,node.end));for(const item of Object.values(node))if(Array.isArray(item))item.forEach(walk);else if(item&&typeof item==='object')walk(item);}
  walk(parse(source,{ecmaVersion:'latest'}));const context=vm.createContext({});
  vm.runInContext(['recordName','titleField','recordKind','fieldLabel','fieldLimit','recordExcerpt'].map(name=>found.get(name)).join('\n'),context);
  for (const seed of seeds) {
    const record=row(seed);assert.ok(context.recordName(record));assert.ok(context.recordKind(record));assert.ok(context.recordExcerpt(seed.kind,seed.data));
    for (const field of seed.editable) {assert.equal(context.fieldLimit(seed.kind,field),textLimit(field,seed.kind));assert.ok(context.fieldLabel(seed.kind,field));}
  }
  assert.equal(context.fieldLabel('insight','faq.0.answer.zh'),'常见问题 1回答');
  assert.doesNotMatch(source,/innerHTML|localStorage|sessionStorage|applicationPassword/);
});
test('actual editor waiting state locks all fields and preserves permission locks after success or failure', async () => {
  const source=await fs.readFile(new URL('../cms/wordpress/history-candidate/admin.js',import.meta.url),'utf8'),found=new Map();
  function walk(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration')found.set(node.id.name,source.slice(node.start,node.end));for(const item of Object.values(node))if(Array.isArray(item))item.forEach(walk);else if(item&&typeof item==='object')walk(item);}
  walk(parse(source,{ecmaVersion:'latest'}));
  const controls=[{disabled:false,dataset:{lock:'false'}},{disabled:false,dataset:{}},{disabled:true,dataset:{lock:'true'}}],messages=[];
  const context=vm.createContext({root:{querySelectorAll:selector=>{assert.equal(selector,'button,input,textarea,select');return controls;}},feedback:message=>messages.push(message)});
  vm.runInContext('let busy=false;\n'+found.get('setControlsBusy')+'\n'+found.get('execute'),context);
  let finish,called=0;const pending=context.execute(async()=>{called++;await new Promise(resolve=>{finish=resolve;});});
  assert.ok(controls.every(item=>item.disabled));await context.execute(async()=>{called++;});assert.equal(called,1);
  controls.push({disabled:true,dataset:{lock:'false'}});finish();await pending;
  assert.deepEqual(controls.map(item=>item.disabled),[false,false,true,false]);
  await context.execute(async()=>{assert.ok(controls.every(item=>item.disabled));throw new Error('synthetic failure');});
  assert.deepEqual(controls.map(item=>item.disabled),[false,false,true,false]);assert.ok(messages.includes('synthetic failure'));
});
