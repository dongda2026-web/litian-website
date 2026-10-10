import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createHash,webcrypto} from 'node:crypto';
import {parse} from 'acorn';
import * as parse5 from 'parse5';
import '../assets/js/procurement-core.js';
import '../assets/js/catalog-core.js';
import '../assets/js/customization-core.js';
import '../assets/js/rfq-list-core.js';
import '../assets/js/sample-request-core.js';
const core=globalThis.DongDaProcurement,read=path=>fs.readFile(new URL('../'+path,import.meta.url),'utf8');
const schema=JSON.parse(await read('content/inquiry-schema.json'));
const catalog=globalThis.DongDaCatalog.create(JSON.parse(await read('content/products.json')));
// Execute only the reviewed pure validator declarations, not private HTTP/SQLite/imports.
const server=await read('server/inquiry-service.mjs'),serverAst=parse(server,{ecmaVersion:'latest',sourceType:'module'});
const declarations=serverAst.body.filter(node=>node.type==='ExportNamedDeclaration'&&['RequestError','validateLead'].includes(node.declaration?.id?.name));
assert.equal(declarations.length,2);
const validationScope={schema,catalog,DongDaProcurement:core,DongDaRfqList:globalThis.DongDaRfqList,DongDaSampleRequest:globalThis.DongDaSampleRequest,DongDaCustomization:globalThis.DongDaCustomization};vm.createContext(validationScope);
vm.runInContext(declarations.map(node=>server.slice(node.declaration.start,node.declaration.end)).join('\n')+'\nthis.normalize=validateLead;',validationScope);
const source=await read('index.html'),functions=new Map();
function walk(node){if(node.tagName==='script'&&!node.attrs.some(attr=>attr.name==='src')){const type=node.attrs.find(attr=>attr.name==='type')?.value;if(!type||['text/javascript','application/javascript','module'].includes(type)){const text=node.childNodes.map(child=>child.value||'').join('');for(const item of parse(text,{ecmaVersion:'latest'}).body)if(item.type==='FunctionDeclaration')functions.set(item.id.name,text.slice(item.start,item.end));}}for(const child of node.childNodes||[])walk(child);}walk(parse5.parse(source));
const uiSource=await read('assets/js/rfq-list-ui.js'),sampleSource=await read('assets/js/sample-request-ui.js');
const base={type:'inquiry',company:'Synthetic company',contact:'Synthetic buyer',email:'buyer@example.invalid',phone:'',product:'Valve bags',productId:'valve-bags',quantity:'10000',specifications:'',notes:'Private synthetic note',honeypot:''};
const context={language:'en',page:'https://example.test/?private=not-stored#inquiry'};
const sha=value=>createHash('sha256').update(value).digest('hex');
const body=request=>JSON.stringify(validationScope.normalize(request.payload));
const product=catalog.resolve('valve-bags'),specifications=Object.fromEntries(product.configuration.map(field=>[field.id,field.type==='qty'?String(core.minimumQuantity(product)):field.opts[0].v]));
const sampleRequest=Object.assign(Object.fromEntries(Object.keys(globalThis.DongDaSampleRequest.limits).map(key=>[key,''])),{purpose:'Material review',quantity:'2',expectedPurchaseQuantity:'10000',requirements:'Synthetic sample requirements',recipientName:'Synthetic recipient',recipientPhone:'+12345678901',country:'CN',city:'Synthetic city',address:'Private synthetic address',costTermsAcknowledged:true});
const types=[base,{...base,type:'quote-calculator',quantity:specifications.qty,quantityUnit:'pcs',specifications,customization:{dimensionUnit:'mm',length:'500'}},{...base,type:'multi-product-rfq',product:'Localized summary',productId:'',quantity:'',quantityUnit:'',specifications:'',items:[{lineId:'line-'+webcrypto.randomUUID(),productId:product.id,product:product.name.en,quantity:specifications.qty,quantityUnit:'pcs',specifications}],destination:'Synthetic destination',deliveryWindow:''},{...base,type:'sample-request',productId:product.id,quantity:'',quantityUnit:'',specifications:'',sampleRequest}];

test('retry version and pure normalization fixture track the actual source',()=>{assert.equal(core.retryVersion,'2026.10.09-retry-v2');assert.match(server,/const digest = hash\(JSON.stringify\(lead\)\)/);assert.match(server,/existing.digest !== digest/);});
for(const payload of types)test(payload.type+' keeps exact server-normalized identity after timeout language route and reload',async()=>{
  const first=await core.prepareRequest(payload,null,context),restored=JSON.parse(JSON.stringify(first.record));
  const changed={...payload,language:'ru',page:'https://example.test/ru/products/valve-bags/?other=not-stored',timestamp:'changed',website:'ignored'};
  const retry=await core.prepareRequest(changed,restored,{language:'ru',page:changed.page});
  assert.equal(first.key,retry.key);assert.equal(body(first),body(retry));assert.equal(retry.payload.language,'en');assert.equal(retry.payload.page,'https://example.test/#'+({inquiry:'inquiry','quote-calculator':'quote','multi-product-rfq':'rfq','sample-request':'sample'}[payload.type]));
});
test('lost ACK fixture admits one normalized demand and recovers the same receipt without another record',async()=>{
  const rows=new Map(),first=await core.prepareRequest(base,null,context),receipt='DD-SYNTHETIC-RETRY';
  const admit=request=>{const digest=sha(body(request)),existing=rows.get(request.key);if(existing){if(existing.digest!==digest)return {ok:false,reason:'conflict'};return {ok:true,persisted:true,leadId:existing.receipt,duplicate:true};}rows.set(request.key,{digest,receipt});return {ok:true,persisted:true,leadId:receipt};};
  admit(first);
  const retry=await core.prepareRequest(base,first.record,{language:'zh',page:'https://example.test/#home'});
  const result=await core.submitInquiry(retry.payload,{endpoint:'/synthetic',idempotencyKey:retry.key,fetch:async()=>({ok:true,status:200,json:async()=>admit(retry)})});
  assert.deepEqual(result,{ok:true,leadId:receipt,duplicate:true});assert.equal(rows.size,1);
});
test('changed business requirements and explicit new intent create distinct identities',async()=>{
  const first=await core.prepareRequest(base,null,context),changed=await core.prepareRequest({...base,notes:'Changed requirement'},first.record,context),fresh=await core.prepareRequest(base,null,context);
  assert.notEqual(first.key,changed.key);assert.notEqual(first.record.digest,changed.record.digest);assert.notEqual(first.key,fresh.key);
});
test('payload snapshot is detached and object key order cannot create a new request',async()=>{
  const payload=structuredClone(types[1]),first=await core.prepareRequest(payload,null,context);payload.specifications.qty='999999';
  assert.equal(first.payload.specifications.qty,specifications.qty);
  const reordered={...types[1],specifications:Object.fromEntries(Object.entries(specifications).reverse())};
  const second=await core.prepareRequest(reordered,first.record,context);assert.equal(first.key,second.key);assert.equal(body(first),body(second));
});
test('retry records contain no personal data destinations requirements or query/hash input',async()=>{
  for(const payload of types){const request=await core.prepareRequest(payload,null,context),record=JSON.stringify(request.record);assert.deepEqual(Object.keys(request.record).sort(),['digest','key','language','page','version']);for(const forbidden of ['Synthetic','example.invalid','not-stored','private=','notes','recipient','destination','specifications'])assert.ok(!record.includes(forbidden));assert.ok(Object.isFrozen(request.record));}
});
test('legacy exact retry preserves body and key; mismatch fails closed instead of silent identity rotation',async()=>{
  const payload={...base,language:'en',page:context.page},key=webcrypto.randomUUID(),cached={key,digest:sha(key+JSON.stringify(payload))};
  const retry=await core.prepareRequest(payload,cached,context);assert.equal(retry.key,key);assert.deepEqual(retry.payload,payload);assert.deepEqual(retry.record,cached);
  await assert.rejects(core.prepareRequest({...payload,language:'ru'},cached,context),error=>error.code==='retry_identity_conflict');
});
test('corrupt foreign-origin extra-key inherited and unsupported records cannot trigger a request',async()=>{
  const first=await core.prepareRequest(base,null,context);
  for(const cached of [{},[],{...first.record,key:'-'.repeat(36)},{...first.record,version:1},{...first.record,language:'constructor'},{...first.record,page:'https://other.test/#inquiry'},{...first.record,notes:'private'}])await assert.rejects(core.prepareRequest(base,cached,context),error=>error.code==='retry_identity_conflict');
  await assert.rejects(core.prepareRequest({...base,type:'constructor'},null,context));
  for(const page of ['file:///tmp/x','https://user:password@example.test/'])await assert.rejects(core.prepareRequest(base,null,{language:'en',page}));
});
function uiFixture(savedValue,unavailable=false){
  const saved=new Map(savedValue?[['dongda-rfq-request-v1',savedValue]]:[]),writes=[],calls=[];
  const scope={crypto:webcrypto,URL,TextEncoder,Uint8Array,lang:'en',location:{href:context.page},DongDaProcurement:core,window:{},sessionStorage:{getItem:key=>{if(unavailable)throw Error('Storage blocked');return saved.get(key)||null;},setItem:(key,value)=>{if(unavailable)throw Error('Storage blocked');saved.set(key,value);writes.push(value);},removeItem:key=>saved.delete(key)},document:{getElementById:()=>({classList:{remove(){}},hidden:false})},clearRfqFeedback(){},renderRfqList(){},nav(){}};
  vm.createContext(scope);vm.runInContext(uiSource,scope);return {scope,saved,writes,calls};
}
test('actual shared RFQ/sample wrapper preserves salted identity across reload and never stores the payload',async()=>{
  const f=uiFixture(),raw={...types[2],language:'en',page:context.page},key=await f.scope.rfqRequestKey(raw);
  const restored=uiFixture(f.saved.get('dongda-rfq-request-v1')),retry={...types[2],product:'Another UI language',language:'ru',page:'https://example.test/#rfq'};
  assert.equal(await restored.scope.rfqRequestKey(retry),key);assert.equal(body({payload:raw}),body({payload:retry}));assert.equal(retry.language,'en');assert.ok(!f.writes.join('').includes('Synthetic'));
  const sample={...types[3],language:'zh',page:context.page};await f.scope.rfqRequestKey(sample,'dongda-sample-request-v1');assert.equal(f.saved.size,2);
});
test('blocked browser storage still retains same-page memory identity and explicit reset clears it',async()=>{
  const f=uiFixture(null,true),first={...types[2],language:'en',page:context.page},key=await f.scope.rfqRequestKey(first),second={...types[2],language:'ru',page:'https://example.test/#rfq'};
  assert.equal(await f.scope.rfqRequestKey(second),key);f.scope.resetRfqReceipt();assert.equal(f.scope.rfqRetryRecords['dongda-rfq-request-v1'],null);assert.notEqual(await f.scope.rfqRequestKey({...first}),key);
});
test('malformed stored JSON blocks outbound preparation until explicit new-intent reset',async()=>{
  const f=uiFixture('{bad');await assert.rejects(f.scope.rfqRequestKey({...types[2],language:'en',page:context.page}),error=>error.code==='retry_identity_conflict');assert.equal(f.writes.length,0);f.scope.resetRfqReceipt();assert.ok(await f.scope.rfqRequestKey({...types[2],language:'en',page:context.page}));
});
test('explicit reset cannot resurrect the old identity when storage removal is denied',async()=>{
  const f=uiFixture(),payload={...types[2],language:'en',page:context.page},key=await f.scope.rfqRequestKey(payload);
  f.scope.sessionStorage.removeItem=()=>{throw Error('Removal blocked');};f.scope.resetRfqReceipt();
  const next=await f.scope.rfqRequestKey({...types[2],language:'en',page:context.page});assert.notEqual(next,key);
});
test('actual sendLead freezes context before hashing and does not mutate the caller demand',async()=>{
  const f=uiFixture(),sent=[],scope=f.scope;Object.assign(scope,{window:{DONGDA_INQUIRY_ENDPOINT:'/synthetic'},leadRequests:{},saveLeadLocal(){},DongDaProcurement:{...core,submitInquiry:async(payload,options)=>{sent.push({payload,options});return {ok:false,reason:'timeout'};}}});vm.runInContext(functions.get('sendLead'),scope);
  const payload=structuredClone(base),pending=new Promise(resolve=>scope.sendLead(payload,resolve));scope.lang='ru';scope.location.href='https://example.test/#home';await pending;
  await new Promise(resolve=>scope.sendLead(base,resolve));assert.equal(sent.length,2);assert.deepEqual(sent[0].payload,sent[1].payload);assert.equal(sent[0].options.idempotencyKey,sent[1].options.idempotencyKey);assert.deepEqual(payload,base);assert.equal(sent[0].payload.language,'en');
});
test('actual inquiry and quote submission reuses its record after a fresh browser context',async()=>{
  for(const payload of [base,types[1]]){
    const f=uiFixture(),requests=[],storageKey=payload.type==='inquiry'?'dongda-inquiry-request-v2':'dongda-quote-request-v2';
    const configure=scope=>{Object.assign(scope,{leadRequests:{},saveLeadLocal(){},window:{DONGDA_INQUIRY_ENDPOINT:'/synthetic'},DongDaProcurement:{...core,submitInquiry:async(value,options)=>{requests.push({payload:value,key:options.idempotencyKey});return {ok:false,reason:'timeout'};}}});vm.runInContext(functions.get('sendLead'),scope);};
    configure(f.scope);await new Promise(resolve=>f.scope.sendLead(payload,resolve));
    const restored=uiFixture();restored.saved.set(storageKey,f.saved.get(storageKey));configure(restored.scope);restored.scope.lang='ru';await new Promise(resolve=>restored.scope.sendLead(payload,resolve));
    assert.equal(requests[0].key,requests[1].key);assert.equal(body(requests[0]),body(requests[1]));assert.ok(!f.writes.join('').includes('Synthetic'));
  }
});
test('conflict does not become a receipt or rotate submission identity automatically',async()=>{
  let calls=0;const request=await core.prepareRequest(base,null,context);
  const result=await core.submitInquiry(request.payload,{endpoint:'/synthetic',idempotencyKey:request.key,fetch:async()=>{calls++;return {ok:false,status:409,json:async()=>({error:'idempotency_conflict'})};}});
  assert.deepEqual(result,{ok:false,reason:'conflict'});assert.equal(calls,1);assert.match(source,/result.reason==='conflict'\?'conflict'/);assert.match(uiSource,/retry_identity_conflict/);assert.match(sampleSource,/retry_identity_conflict/);
});
test('explicit new-intent controls are outside receipt-only containers and start hidden',()=>{
  const document=parse5.parse(source),nodes=[];const visit=node=>{nodes.push(node);for(const child of node.childNodes||[])visit(child);};visit(document);
  const byId=id=>nodes.find(node=>node.attrs?.some(attr=>attr.name==='id'&&attr.value===id));
  for(const[id,container]of [['rfq-list-new','rfq-list-receipt'],['sample-new','sample-receipt'],['quote-retry-reset','q-success']]){const button=byId(id);assert.ok(button);assert.ok(button.attrs.some(attr=>attr.name==='hidden'));for(let parent=button.parentNode;parent;parent=parent.parentNode)assert.notEqual(parent,byId(container));}
});
