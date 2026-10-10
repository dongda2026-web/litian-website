import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { randomBytes, webcrypto } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInNewContext, Script } from 'node:vm';
import '../assets/js/sample-request-core.js';
import { InquiryStore, createInquiryServer, validateLead } from '../server/inquiry-service.mjs';
import { deliverCrmInquiry } from '../server/crm-delivery.mjs';
import { readMonitoring } from '../server/inquiry-monitoring.mjs';

const sample=()=>({ purpose:'Synthetic material trial',quantity:'2',expectedPurchaseQuantity:'100000',requirements:'Synthetic valve and print requirement',recipientName:'Synthetic Recipient',recipientPhone:'+1 555 0100',country:'Synthetic country',city:'Synthetic city',address:'Synthetic address',postalCode:'01000',costTermsAcknowledged:true });
const lead=()=>({ type:'sample-request',company:'Synthetic Sample Buyer',contact:'Synthetic QA',email:'sample@example.test',phone:'',product:'Valve Bags',productId:'valve-bags',quantity:'',quantityUnit:'',specifications:'',sampleRequest:sample(),notes:'',language:'en',page:'https://cn-dongda.com/#sample/valve-bags' });

test('sample core strictly validates quantities, lengths, recipient, cost consent and unknown fields',()=>{
  const valid=sample();assert.deepEqual(DongDaSampleRequest.validate(valid),valid);
  assert.equal(DongDaSampleRequest.validate({...valid,expectedPurchaseQuantity:''}).expectedPurchaseQuantity,'');
  for(const changes of [{quantity:'0'},{quantity:'1.5'},{quantity:'1e3'},{quantity:'1000000001'},{expectedPurchaseQuantity:'-1'},{purpose:''},{address:'x'.repeat(501)},{recipientPhone:null},{costTermsAcknowledged:false},{status:'confirmed'},{ownerId:'injected'},{constructor:'poison'}])assert.throws(()=>DongDaSampleRequest.validate({...valid,...changes}));
  for(const invalid of [null,[],{},'sample'])assert.throws(()=>DongDaSampleRequest.validate(invalid));
  assert.deepEqual(DongDaSampleRequest.errors({...valid,quantity:''}),['quantity']);
});
test('sample public validation cannot project sample or planned volume to an order quantity',()=>{
  const valid=lead();assert.deepEqual(validateLead(valid),valid);
  for(const changes of [{productId:'vb'},{productId:'technical-platform'},{quantity:'2'},{quantityUnit:'pcs'},{specifications:{}},{sampleRequest:{...sample(),status:'confirmed'}},{type:'inquiry'}])assert.throws(()=>validateLead({...valid,...changes}));
  assert.equal(validateLead(valid).quantity,'');
});
test('sample retry identity is private, separate from RFQ, survives reload and changes with demand',async()=>{
  const source=await readFile(new URL('../assets/js/rfq-list-ui.js',import.meta.url),'utf8');
  const cache=new Map(),sessionStorage={getItem:key=>cache.get(key)||null,setItem:(key,value)=>cache.set(key,value)};
  const context=()=>{const value={sessionStorage,crypto:webcrypto,TextEncoder};runInNewContext(source,value);return value;};
  const value=lead(),key=await context().rfqRequestKey(value,'dongda-sample-request-v1');
  assert.equal(await context().rfqRequestKey(value,'dongda-sample-request-v1'),key);
  assert.notEqual(await context().rfqRequestKey(value),key);
  assert.notEqual(await context().rfqRequestKey({...value,notes:'Changed'},'dongda-sample-request-v1'),key);
  for(const secret of [value.email,value.company,value.sampleRequest.address])assert.equal(JSON.stringify([...cache]).includes(secret),false);
});
test('sample HTTP durable receipt, idempotent retry, private readback, monitoring and restart',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'dongda-sample-'));let store=new InquiryStore(join(directory,'inquiries.sqlite'));
  const token=randomBytes(32).toString('hex'),config={adminToken:token,rateSalt:randomBytes(32).toString('hex'),allowedOrigins:['https://cn-dongda.com']};
  const server=createInquiryServer(store,config);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));store.close();await rm(directory,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+server.address().port,value=lead(),key=randomBytes(16).toString('hex');
  const submit=payload=>fetch(base+'/api/inquiries',{method:'POST',headers:{Origin:config.allowedOrigins[0],'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(payload)});
  const first=await submit(value);assert.equal(first.status,201);const receipt=await first.json();assert.equal(receipt.persisted,true);
  assert.equal((await submit(value)).status,200);assert.equal((await submit({...value,notes:'Changed'})).status,409);
  assert.equal((await fetch(base+'/api/admin/inquiries/'+receipt.leadId)).status,401);
  assert.deepEqual(store.get(receipt.leadId).lead,value);assert.deepEqual(readMonitoring(store).byType.map(row=>({...row})),[{type:'sample-request',count:1}]);
  await new Promise(resolve=>server.close(resolve));store.close();store=new InquiryStore(join(directory,'inquiries.sqlite'));
  assert.deepEqual(store.get(receipt.leadId).lead,value);
});
test('sample worker uses v3 and original demand while legacy versions stay separate',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'dongda-sample-crm-')),store=new InquiryStore(join(directory,'inquiries.sqlite'));
  t.after(async()=>{store.close();await rm(directory,{recursive:true,force:true});});
  const value=lead(),receipt=store.receive(value,'sample-request-key-12345'),config={crmUrl:'https://erp.example.test/api/sales/website-inquiries',crmSiteId:'dongda-website',crmToken:'synthetic-service-secret-that-is-long-enough',adminToken:'different-admin'};
  const result=await deliverCrmInquiry(store,config,async(_url,options)=>{const packet=JSON.parse(options.body);assert.equal(packet.schemaVersion,'2026.10.08-v3');assert.deepEqual(packet.payload,value);return new Response(JSON.stringify({ok:true,persisted:true,siteId:packet.siteId,sourceInquiryId:packet.sourceInquiryId,leadId:'sale-12345678-1234-1234-1234-123456789abc',duplicate:false}),{status:201});});
  assert.equal(result.ok,true);assert.equal(store.get(receipt.id).crm.status,'synced');
});
test('sample product navigation retains same-product receipt but resets a different-product intent',async()=>{
  const source=await readFile(new URL('../assets/js/sample-request-ui.js',import.meta.url),'utf8');
  const context={catalog:{resolve:id=>id?{id,kind:'product'}:null},nav:()=>{}};
  runInNewContext(source,context);
  let resets=0;
  context.newSampleRequest=()=>{resets++;context.sampleState.receipt=null;};
  context.sampleProductChanged=id=>{context.sampleState.productId=id;};
  context.sampleState.productId='valve-bags';context.sampleState.receipt='DD-SYNTHETIC-123';
  context.startSampleRequest('valve-bags');assert.equal(resets,0);assert.ok(context.sampleState.receipt);
  context.startSampleRequest('fibc-bulk-bags');assert.equal(resets,1);assert.equal(context.sampleState.receipt,null);
  context.sampleState.busy=true;context.startSampleRequest('valve-bags');assert.equal(context.sampleState.productId,'fibc-bulk-bags');
});

test('sample browser scripts compile and translations retain all fields without storage of recipient',async()=>{
  const copy=await readFile(new URL('../assets/js/sample-request-copy.js',import.meta.url),'utf8'),ui=await readFile(new URL('../assets/js/sample-request-ui.js',import.meta.url),'utf8');
  new Script(ui);new Script(copy);const scope={};runInNewContext(copy,scope);
  for(const lang of ['zh','en','ru'])for(const key of Object.keys(scope.DONGDA_SAMPLE_COPY.en))assert.ok(scope.DONGDA_SAMPLE_COPY[lang][key]);
  assert.equal(/(?:local|session)Storage\.setItem\([^\n]*(?:payload|address|recipient|email)/.test(ui),false);
});
