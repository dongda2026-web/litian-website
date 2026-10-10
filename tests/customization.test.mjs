import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { randomUUID, randomBytes, webcrypto } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Script, runInNewContext } from 'node:vm';
import '../assets/js/customization-core.js';
import { InquiryStore, createInquiryServer, validateLead } from '../server/inquiry-service.mjs';
import { deliverCrmInquiry } from '../server/crm-delivery.mjs';

const core=globalThis.DongDaCustomization;
const catalog=DongDaCatalog.create(JSON.parse(await readFile(new URL('../content/products.json',import.meta.url),'utf8')));
const custom=()=>({...core.defaults,length:'900.25',width:'900',height:'1100',material:'Synthetic PP fabric',bagColor:'Synthetic white',printing:'multi-color',printColors:'2',loadKg:'1000',contents:'Synthetic powder',notes:'Synthetic private design note <script>test</script>',technicalAdvice:true});
const line=(value=custom())=>({lineId:'line-'+randomUUID(),productId:'fibc-bulk-bags',specifications:{capacity:'1000',sling:'4loop',liner:'pe',discharge:'bot',qty:'1000'},customization:value});
const quote=()=>({type:'quote-calculator',company:'Synthetic Custom Buyer',contact:'Synthetic Contact',email:'custom@example.test',phone:'',product:'FIBC Bulk Bags',productId:'fibc-bulk-bags',quantity:'1000',quantityUnit:'pcs',specifications:line().specifications,notes:'',language:'en',page:'https://cn-dongda.com/#quote/fibc-bulk-bags',customization:custom()});
const rfq=()=>({...quote(),type:'multi-product-rfq',product:'Multi-product RFQ',productId:'',quantity:'',quantityUnit:'',specifications:'',customization:undefined,
  destination:'Synthetic destination',deliveryWindow:'',items:DongDaRfqList.items([line(),line({...custom(),dimensionUnit:'cm',length:'90',printing:'none',printColors:'',notes:'Synthetic second design'})],catalog,'en')});

test('customization validates optional technical advice, measurements, print count and strict keys without inventing facts',()=>{
  assert.deepEqual(core.validate(custom()),custom());assert.equal(core.hasValue(core.defaults),false);
  assert.equal(core.validate({technicalAdvice:true}).technicalAdvice,true);
  for(const value of [null,[],{},core.defaults,{...custom(),price:'1'},{...custom(),dimensionUnit:'inch'},{...custom(),printing:'approved'},{...custom(),technicalAdvice:'true'},
    {...custom(),material:'x'.repeat(121)},{...custom(),notes:'x'.repeat(1001)},{...custom(),length:1}])assert.throws(()=>core.validate(value));
  for(const value of ['0','-1','1e3','1,2','01','1.2345','1000000','Infinity'])assert.throws(()=>core.validate({...custom(),length:value}));
  assert.equal(core.validate({...custom(),length:'0.001'}).length,'0.001');
  for(const changes of [{printColors:'0'},{printColors:'17'},{printing:'none'},{printing:'single-color'},{printColors:'1.5'}])assert.throws(()=>core.validate({...custom(),...changes}));
  assert.deepEqual(core.errors({...custom(),length:'0',loadKg:'-1'}),['length','loadKg']);
  assert.equal(core.draft({...custom(),length:'0'}).length,'0','invalid in-progress input remains editable');
});

test('distinct customized RFQ lines survive editing and submission but private design text is never cached',()=>{
  const rows=[line(),line({...custom(),material:'Synthetic second material'})],draft=DongDaRfqList.draft(rows,catalog),items=DongDaRfqList.items(draft,catalog,'en');
  assert.notEqual(items[0].lineId,items[1].lineId);assert.notEqual(items[0].customization.material,items[1].customization.material);
  assert.deepEqual(DongDaRfqList.validateItems(items,catalog),items);
  const saved=DongDaRfqList.serialize(draft,catalog);
  for(const value of [custom().material,custom().notes,'customization'])assert.equal(saved.includes(value),false);
  assert.equal(DongDaRfqList.restore(saved,catalog)[0].customization,undefined);
  assert.throws(()=>DongDaRfqList.restore(JSON.stringify({version:1,items:draft}),catalog));
  assert.throws(()=>DongDaRfqList.validateItems([{...items[0],customization:{...custom(),owner:'injected'}}],catalog));
  draft[0].customization.material='Changed';assert.equal(rows[0].customization.material,custom().material);
});

test('public intake keeps requested values separate from catalog specifications and rejects cross-type extensions',()=>{
  const first=quote();assert.deepEqual(validateLead(first),first);
  const second=rfq();delete second.customization;assert.deepEqual(validateLead(second),second);
  for(const changes of [{type:'inquiry'},{type:'sample-request'},{customization:{}},{customization:{...custom(),length:'-1'}},{customization:{...custom(),org:'injected'}}])assert.throws(()=>validateLead({...first,...changes}));
  assert.throws(()=>validateLead({...second,customization:custom()}));
  assert.equal(validateLead({...first,customization:{...custom(),material:' Synthetic PP '}}).customization.material,'Synthetic PP');
  const ordinary={...first};delete ordinary.customization;assert.equal(validateLead(ordinary).customization,undefined);
});

test('custom rendering escapes text, preserves invalid draft during language changes and uses bounded editable controls',async()=>{
  const copy=await readFile(new URL('../assets/js/customization-copy.js',import.meta.url),'utf8');
  const source=await readFile(new URL('../assets/js/customization-ui.js',import.meta.url),'utf8');new Script(source);
  const context={lang:'en',DongDaCustomization:core,catalogIcon:()=>'',esc:value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')};
  runInNewContext(copy+'\n'+source,context);
  const html=context.customizationFields('q-custom',{...custom(),material:'<img src=x onerror=alert(1)>'},'qSetCustomization',true);
  assert.equal(html.includes('<img'),false);assert.equal(html.includes('&lt;img'),true);assert.match(html,/type="checkbox"/);assert.match(html,/maxlength="1000"/);
  assert.doesNotThrow(()=>context.customizationRows({...custom(),length:'0'}));
  for(const language of ['zh','en','ru']){context.lang=language;assert.ok(context.customizationFields('q-custom',custom(),'qSetCustomization',true).includes(context.DONGDA_CUSTOMIZATION_COPY[language].title));}
  const status={className:'lead-status show error',textContent:'Previous error'};
  context.qState={customization:{...custom(),length:'0'}};
  context.document={getElementById:id=>id==='q-spec-status'?status:{removeAttribute:()=>{}},querySelector:()=>null};
  context.qSetCustomization('length','900');assert.equal(status.textContent,'');assert.equal(status.className,'lead-status');
  assert.equal(context.qState.customization.length,'900');
  let cleared=false;context.clearRfqFeedback=()=>{cleared=true;};context.rfqListState={items:[line()]};
  context.updateRfqCustomization(context.rfqListState.items[0].lineId,'length','800');assert.equal(cleared,true);
  const css=await readFile(new URL('../assets/css/customization.css',import.meta.url),'utf8');
  assert.match(css,/#page-quote \.quote-wrap\{padding:40px var\(--px\) 64px\}/);
  assert.match(css,/#page-quote \.quote-grid\{grid-template-columns:minmax\(0,1\.5fr\) minmax\(0,1fr\)/);
  assert.match(css,/#page-quote \.q-panel\{background:transparent!important;border:0!important/);
});

test('customized RFQ retry identity survives reload without exposing design text or contacts',async()=>{
  const source=await readFile(new URL('../assets/js/rfq-list-ui.js',import.meta.url),'utf8'),cache=new Map();
  const context=()=>{const value={crypto:webcrypto,TextEncoder,sessionStorage:{getItem:key=>cache.get(key)||null,setItem:(key,text)=>cache.set(key,text)}};runInNewContext(source,value);return value;};
  const payload=rfq();delete payload.customization;
  const first=await context().rfqRequestKey(payload);assert.equal(await context().rfqRequestKey(payload),first);
  assert.notEqual(await context().rfqRequestKey({...payload,items:[{...payload.items[0],customization:{...custom(),notes:'Changed private note'}}]}),first);
  for(const value of [payload.email,custom().notes,custom().material])assert.equal([...cache.values()].join('').includes(value),false);
});

async function fixture(t) {
  const directory=await mkdtemp(join(tmpdir(),'dongda-custom-')),file=join(directory,'inquiries.sqlite'),store=new InquiryStore(file);
  const config={adminToken:randomBytes(32).toString('hex'),rateSalt:randomBytes(32).toString('hex'),allowedOrigins:['https://cn-dongda.com']};
  const server=createInquiryServer(store,config);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));try{store.close();}catch{}await rm(directory,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+server.address().port;
  const post=(value,key=randomUUID())=>fetch(base+'/api/inquiries',{method:'POST',headers:{Origin:config.allowedOrigins[0],'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(value)});
  return {store,file,config,base,post};
}
test('quote and multi-line custom requests receive durable private receipts and v4 CRM payloads without losing original values',async t=>{
  const f=await fixture(t),request=quote(),key=randomUUID();const response=await f.post(request,key);assert.equal(response.status,201);const receipt=await response.json();
  assert.equal(JSON.stringify(receipt).includes(custom().notes),false);assert.equal((await fetch(f.base+'/api/admin/inquiries/'+receipt.leadId)).status,401);
  assert.deepEqual(f.store.get(receipt.leadId).lead,request);assert.equal((await f.post(request,key)).status,200);
  assert.equal((await f.post({...request,customization:{...custom(),width:'800'}},key)).status,409);
  const second=rfq();delete second.customization;assert.equal((await f.post(second)).status,201);
  const packets=[];const config={crmUrl:'https://erp.cn-dongda.com/api/sales/website-inquiries',crmSiteId:'dongda-website',crmToken:randomBytes(32).toString('hex')};
  for(let i=0;i<2;i++)assert.equal((await deliverCrmInquiry(f.store,config,async(_,options)=>{const packet=JSON.parse(options.body);packets.push(packet);return new Response(JSON.stringify({ok:true,persisted:true,siteId:config.crmSiteId,sourceInquiryId:packet.sourceInquiryId,leadId:'sale-'+randomUUID(),duplicate:false}),{status:201});})).ok,true);
  assert.ok(packets.every(packet=>packet.schemaVersion==='2026.10.08-v4'));
  assert.deepEqual(packets.find(packet=>packet.payload.type==='quote-calculator').payload,request);
  assert.deepEqual(packets.find(packet=>packet.payload.type==='multi-product-rfq').payload,second);
  f.store.close();const reopened=new InquiryStore(f.file);assert.deepEqual(reopened.get(receipt.leadId).lead.customization,custom());reopened.close();
});
test('large customized RFQ is bounded by 64KiB; quote retains 16KiB and invalid metadata receives no receipt',async t=>{
  const f=await fixture(t),request=rfq();delete request.customization;
  request.items=DongDaRfqList.items(Array.from({length:20},()=>line({...custom(),notes:'x'.repeat(1000)})),catalog,'en');
  assert.ok(Buffer.byteLength(JSON.stringify(request))>16384);assert.equal((await f.post(request)).status,201);
  assert.equal((await f.post({...request,notes:'x'.repeat(65536)})).status,413);
  assert.equal((await f.post({...quote(),notes:'x'.repeat(20000)})).status,413);
  assert.equal((await f.post({...quote(),customization:{...custom(),height:'0'}})).status,422);
  assert.equal(f.store.list().length,1);
});
