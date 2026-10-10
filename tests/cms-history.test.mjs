import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {parse} from 'acorn';
import {historySchemaVersion, legacySchemaVersion, seedRecords, composeExport, digest, getPath, setPath, textLimit, editablePaths} from '../cms/content-contract.mjs';
import {wordpressReader, maxExportBytes} from '../cms/service.mjs';

const load = async name => JSON.parse(await fs.readFile(new URL('../content/'+name+'.json', import.meta.url)));
const products = await load('products'), industries = await load('industries'), history = await load('company-history');
const clone = value => structuredClone(value), seeds = seedRecords(products, industries, history);
const row = (seed = seeds[11], status = 'publish', postId = 12) => ({postId, kind:seed.kind, id:seed.id, data:clone(seed.data), baselineHash:seed.baselineHash, revision:1, modifiedAt:'2026-10-09T12:00:00Z', status});
const envelope = (records = [], scope = 'published', schema = historySchemaVersion) => ({schema, scope, records});
const compose = (data, scope = 'published') => composeExport(data, products, industries, scope, history);

test('history CMS seeds 31 stable records with six editable fields and original catalog hashes', () => {
  assert.equal(seeds.length, 31); assert.equal(seeds.filter(seed => seed.kind === 'history').length, 20);
  assert.deepEqual(seeds.slice(0,11), seedRecords(products, industries));
  for (const seed of seeds.slice(11)) {
    assert.deepEqual(seed.editable, ['title.zh','title.en','title.ru','description.zh','description.en','description.ru']);
    assert.equal(seed.id, 'milestone-'+seed.data.year); assert.equal(seed.baselineHash, digest(seed.data));
  }
  assert.throws(() => editablePaths('unknown', {}), /Unknown/);
});
test('history text edits preserve immutable dates, all other languages and canonical source', () => {
  const original = clone(history), changed = row(); changed.data.title.zh = 'Synthetic title'; changed.data.description.en = 'Synthetic description';
  const result = compose(envelope([changed]));
  assert.equal(result.companyHistory.milestones[0].title.zh, 'Synthetic title');
  assert.equal(result.companyHistory.milestones[0].description.en, 'Synthetic description');
  assert.equal(result.companyHistory.reviewStatus, 'legacy-pending');
  for (const language of ['kk','ky','tg','tk','uz']) {
    assert.equal(result.companyHistory.milestones[0].title[language], history.milestones[0].title[language]);
    assert.equal(result.companyHistory.milestones[0].description[language], history.milestones[0].description[language]);
  }
  assert.deepEqual(history, original); assert.deepEqual(result.companyHistory.provenance, history.provenance);
});
test('history protected fields, extra translations and unsupported locale edits fail closed', () => {
  for (const change of [data=>data.year++, data=>data.id='milestone-1900', data=>data.reviewStatus='approved', data=>data.title.kk='changed', data=>data.description.uz='changed', data=>data.title.fr='unknown', data=>data.customerId='private']) {
    const changed = row(); change(changed.data); assert.throws(() => compose(envelope([changed])), /protected/);
  }
});
test('history requires complete bounded plain-text translations and title limits', () => {
  for (const value of ['', ' ', '<b>bad</b>', '\u0000bad', 'x'.repeat(121)]) {
    const changed = row(); changed.data.title.ru=value; assert.throws(() => compose(envelope([changed])), /plain-text/);
  }
  for (const value of [null, 'x'.repeat(601)]) {
    const changed = row(); changed.data.description.zh=value; assert.throws(() => compose(envelope([changed])), /plain-text/);
  }
  const changed=row(); delete changed.data.description.en; assert.throws(() => compose(envelope([changed])), /plain-text/);
  assert.equal(textLimit('title.zh'),120); assert.equal(textLimit('description.zh'),600);
});
test('history duplicates, stale baselines, metadata and record count overflow are rejected', () => {
  assert.throws(() => compose(envelope([row(),row()])), /duplicate/);
  const changed=row(); changed.baselineHash='bad'; assert.throws(() => compose(envelope([changed])), /stale/);
  const extra=row(); extra.actorEmail='synthetic@example.invalid'; assert.throws(() => compose(envelope([extra])), /metadata/);
  assert.throws(() => compose(envelope(Array.from({length:32},()=>row()))), /envelope/);
});
test('history draft preview does not turn into published content', () => {
  assert.throws(() => compose(envelope([row(undefined,'draft')])), /Draft/);
  assert.equal(compose(envelope([row(undefined,'draft')],'preview'),'preview').changedRecords,1);
});
test('v1 catalog exports remain compatible and cannot smuggle history records', () => {
  const old=row(seeds[0]); old.data.summary.zh='Synthetic legacy catalog edit';
  const result=compose(envelope([old],'published',legacySchemaVersion));
  assert.equal(result.products[0].summary.zh,old.data.summary.zh); assert.deepEqual(result.companyHistory,history);
  assert.throws(()=>compose(envelope([row()],'published',legacySchemaVersion)),/Unknown/);
  assert.throws(()=>compose(envelope(Array.from({length:12},()=>old),'published',legacySchemaVersion)),/envelope/);
  assert.throws(()=>compose(envelope([],'published','unknown-schema')),/envelope/);
});
test('all 31 maximal valid text records exceed the old limit without losing history or approval locks', () => {
  const records=seeds.map((seed,index)=>{const record=row(seed,'publish',index+1);for(const field of seed.editable)setPath(record.data,field,'\u5b57'.repeat(textLimit(field)));return record;});
  const data=envelope(records), bytes=Buffer.byteLength(JSON.stringify(data));
  assert.ok(bytes>128*1024); assert.ok(bytes<maxExportBytes); assert.equal(compose(data).changedRecords,31);
  assert.equal(compose(data).companyHistory.reviewStatus,'legacy-pending');
});
test('dedicated export reader accepts a complete large envelope using bounded mocked fetch only', async t => {
  const original=globalThis.fetch; t.after(()=>{globalThis.fetch=original;});
  const records=seeds.map((seed,index)=>{const record=row(seed,'publish',index+1);for(const field of seed.editable)setPath(record.data,field,'\u5b57'.repeat(textLimit(field)));return record;});
  const data=envelope(records); let requested;
  globalThis.fetch=async(url,options)=>{requested={url:String(url),redirect:options.redirect};return new Response(JSON.stringify(data));};
  const read=wordpressReader({url:'https://cms.example.invalid',username:'fixture',applicationPassword:'fixture-only'});
  const result=await read('published'); assert.deepEqual(result,data); assert.equal(compose(result).changedRecords,31);
  assert.equal(requested.redirect,'error'); assert.match(requested.url,/scope=published/);
});
test('dedicated export reader denies both advertised and streamed oversized bodies', async t => {
  const original=globalThis.fetch; t.after(()=>{globalThis.fetch=original;});
  const read=wordpressReader({url:'https://cms.example.invalid',username:'fixture',applicationPassword:'fixture-only'});
  globalThis.fetch=async()=>new Response('{}',{headers:{'content-length':String(maxExportBytes+1)}});
  await assert.rejects(read('published'),/too large/);
  globalThis.fetch=async()=>new Response('x'.repeat(maxExportBytes+1)); await assert.rejects(read('preview'),/too large/);
});
test('actual editor helper functions render history identity without product name access', async () => {
  const source=await fs.readFile(new URL('../cms/wordpress/history-candidate/admin.js',import.meta.url),'utf8');
  const found=new Map(); function walk(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration')found.set(node.id.name,source.slice(node.start,node.end));for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}walk(parse(source,{ecmaVersion:'latest'}));
  const context=vm.createContext({}); vm.runInContext(found.get('recordName')+'\n'+found.get('titleField'),context);
  assert.equal(context.recordName(row()),history.milestones[0].year+' - '+history.milestones[0].title.zh);
  assert.equal(context.recordName(row(seeds[0])),products[0].name.zh); assert.equal(context.titleField('title.ru'),true); assert.equal(context.titleField('description.ru'),false);
  assert.doesNotMatch(source,/localStorage|sessionStorage|innerHTML|applicationPassword/);
});
