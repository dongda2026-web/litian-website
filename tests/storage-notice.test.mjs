import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import vm from 'node:vm';
import {parse} from 'parse5';
import {nodes,attribute,plainText} from '../scripts/build-product-pages.mjs';
import {localizeStorageNotice} from '../scripts/build-storage-notice.mjs';
import {auditStorageDocument} from '../scripts/audit-storage-notice.mjs';
import '../assets/js/storage-notice-core.js';

const core=globalThis.DongDaStorageNotice,source=await readFile(join(process.cwd(),'index.html'),'utf8'),ui=await readFile(join(process.cwd(),'assets/js/storage-notice-ui.js'),'utf8');
function store(values={}){const data=new Map(Object.entries(values)),calls=[];return{data,calls,getItem(key){calls.push(['get',key]);return data.get(key)??null;},setItem(key,value){calls.push(['set',key,value]);data.set(key,value);}};}
test('storage notice copy is immutable complete and independently owned in three locales and five fallbacks',()=>{
  assert.equal(core.version,'2026.10.09-storage-v1');assert.equal(core.copyKeys.length,14);assert.ok(Object.isFrozen(core)&&Object.isFrozen(core.languages)&&Object.isFrozen(core.copyKeys));
  for(const locale of ['zh','en','ru','kk','ky','tg','tk','uz',null,'constructor','__proto__'])for(const key of core.copyKeys){assert.ok(core.text(key,locale).trim());if(!['zh','en','ru'].includes(locale))assert.equal(core.text(key,locale),core.text(key,'en'));}
  for(const key of ['constructor','__proto__','missing',''])assert.throws(()=>core.text(key,'en'),TypeError);
});
test('only the exact current notice version suppresses the notice',()=>{
  for(const value of ['',null,'accepted','true','2026.10.08-storage-v1',JSON.stringify({accepted:true})])assert.equal(core.acknowledged(store({[core.key]:value})),false);
  assert.equal(core.acknowledged(store({[core.key]:core.version})),true);
  const storage=store();assert.equal(core.acknowledge(storage),true);assert.equal(core.acknowledged(storage),true);assert.equal(storage.data.size,1);assert.equal(storage.data.get(core.key),core.version);
});
test('legacy cookie accept does not become acknowledgement or analytics permission',()=>{
  const storage=store({dongda_cookie_consent:'accepted',litian_cookie_consent:'accepted'});assert.equal(core.acknowledged(storage),false);assert.equal(core.acknowledge(storage),true);
  assert.deepEqual([...storage.data.keys()].sort(),[core.key,'dongda_cookie_consent','litian_cookie_consent'].sort());
  assert.ok(storage.calls.every(row=>row[1]===core.key));assert.doesNotMatch(ui,/fetch\(|XMLHttpRequest|sendBeacon|analyticsConsent|cookie_consent/);
});
test('unavailable blocked or silently failed storage never prevents notice dismissal',()=>{
  for(const storage of [undefined,null,{}, {getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}, {getItem(){return null;},setItem(){}}]){assert.equal(core.acknowledged(storage),false);assert.equal(core.acknowledge(storage),false);}
  assert.equal(core.acknowledge({setItem(){},getItem(){throw Error('read blocked');}}),false);
});
test('acknowledgement cannot clear selections retry identities receipts or contact drafts',()=>{
  const protectedData={'dongda_receipts':'synthetic-receipt-only','dongda-rfq-request-v1':'salted-key','dongda-rfq-receipt-v1':'synthetic-receipt','dongda-catalog-compare-v1':'valve-bags'},storage=store(protectedData);
  assert.equal(core.acknowledge(storage),true);for(const[key,value]of Object.entries(protectedData))assert.equal(storage.data.get(key),value);
  assert.ok(storage.calls.every(row=>row[1]===core.key));assert.doesNotMatch(ui,/sessionStorage|removeItem|\.clear\(|fi\d|rfqListState|sampleState/);
});
test('static localization and native policy dialog retain a single translation owner',()=>{
  for(const locale of ['zh','en','ru','kk','ky','tg','tk','uz']){const document=parse(source);localizeStorageNotice(document,locale);const result=auditStorageDocument(document,locale);assert.equal(result.copyFields,12);assert.equal(nodes(document,n=>n.tagName==='dialog').length,6);}
  for(const owner of ['data-i','data-a11y-text']){const document=parse(source);nodes(document,n=>attribute(n,'data-storage-copy')!==undefined)[0].attrs.push({name:owner,value:'gdpr'});assert.throws(()=>localizeStorageNotice(document,'en'),TypeError);}
});
function controller(storage,blockedGetter=false){
  const notice={hidden:true},copy={dataset:{storageCopy:'notice'},textContent:''},label={tagName:'BUTTON',dataset:{storageLabel:'dismiss'},attributes:{},setAttribute(name,value){this.attributes[name]=value;}},window={DongDaStorageNotice:core};
  if(blockedGetter)Object.defineProperty(window,'localStorage',{get(){throw Error('storage denied');}});else window.localStorage=storage;
  const document={getElementById:id=>id==='gdpr'?notice:null,querySelectorAll:selector=>selector==='[data-storage-copy]'?[copy]:[label]};
  vm.runInNewContext(ui,{window,document,lang:'zh'},{timeout:500});return{notice,copy,label,api:window.DongDaPublicStorage};
}
test('actual UI controller shows notice and language switches do not acknowledge it',()=>{
  const storage=store(),item=controller(storage);assert.equal(item.notice.hidden,false);assert.equal(item.copy.textContent,core.text('notice','zh'));
  for(const locale of ['en','ru','kk']){item.api.sync(locale);assert.equal(item.notice.hidden,false);assert.equal(item.copy.textContent,core.text('notice',locale));assert.equal(item.label.attributes['aria-label'],core.text('dismiss',locale));assert.equal(item.label.title,core.text('dismiss',locale));}
  assert.equal(storage.data.size,0);assert.ok(storage.calls.every(row=>row[0]==='get'));
});
test('explicit dismissal survives a controller reload but not as a policy acceptance',()=>{
  const storage=store({dongda_receipts:'synthetic'}),first=controller(storage);first.api.dismiss();assert.equal(first.notice.hidden,true);assert.equal(storage.data.get('dongda_receipts'),'synthetic');
  assert.equal(controller(storage).notice.hidden,true);assert.equal(storage.data.size,2);
  assert.equal(Object.isFrozen(first.api),true);assert.deepEqual(Object.keys(first.api).sort(),['dismiss','sync']);
});
test('UI remains dismissible in memory when localStorage access or writes fail',()=>{
  for(const item of [controller(null),controller(null,true),controller({getItem(){return null;},setItem(){throw Error('blocked');}})]){assert.equal(item.notice.hidden,false);item.api.dismiss();assert.equal(item.notice.hidden,true);item.api.sync('ru');assert.equal(item.notice.hidden,true);}
});
test('rendered technical draft is not a legal approval or invented contact service',()=>{
  for(const locale of ['zh','en','ru']){assert.ok(core.text('pending',locale));assert.ok(core.text('review',locale));assert.doesNotMatch(core.text('review',locale)+core.text('analytics',locale),/privacy@|https?:\/\//);}
  const policy=nodes(parse(source),n=>attribute(n,'id')==='privacyModal')[0];assert.doesNotMatch(plainText(policy),/By using this site, you consent|Your data is never sold|privacy@dongdaltd/);
  assert.match(source,/function acceptLitianCookies\(\)\{\s*return DongDaPublicStorage\.dismiss\(\);/);assert.doesNotMatch(source,/localStorage\.setItem\('dongda_cookie_consent'/);
});
test('current script inventory has no configured analytics provider and receipt/selection persistence is unchanged',async()=>{
  const scripts=nodes(parse(source),n=>n.tagName==='script'&&attribute(n,'src')).map(n=>attribute(n,'src'));
  for(const path of scripts){assert.ok(path.startsWith('assets/js/'));const code=await readFile(join(process.cwd(),path),'utf8');assert.doesNotMatch(code,/googletagmanager|google-analytics|\bgtag\s*\(|hm\.baidu|\bclarity\s*\(|matomo|plausible\.io/i);}
  const config=JSON.parse(await readFile(join(process.cwd(),'content/runtime-config.json'),'utf8'));assert.equal(config.mode,'static');assert.ok(Object.values(config.endpoints).every(value=>value===''));
  assert.match(source,/rows\.unshift\(\{leadId:payload\.leadId,receivedAt:new Date\(\)\.toISOString\(\)\}\)/);assert.match(source,/JSON\.stringify\(rows\.slice\(0,20\)\)/);
  const catalog=await readFile(join(process.cwd(),'assets/js/catalog-ui.js'),'utf8');assert.match(catalog,/dongda-catalog-compare-v1/);
});
