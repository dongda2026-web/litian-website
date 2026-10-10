import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import {parse as parseJavaScript} from 'acorn';
import {parse} from 'parse5';
import {nodes,attribute,plainText} from '../scripts/build-product-pages.mjs';
import {companyLegacy} from '../scripts/company-legacy.mjs';
import {localizePublicProcurement} from '../scripts/build-public-procurement.mjs';
import {auditProcurementDocument} from '../scripts/audit-public-procurement.mjs';
import '../assets/js/public-procurement-core.js';

const root=process.cwd(),source=await readFile(join(root,'index.html'),'utf8'),legacy=companyLegacy(source);
const core=globalThis.DongDaPublicProcurement,catalog=globalThis.DongDaCatalog.create(JSON.parse(await readFile(join(root,'content/products.json'),'utf8')));
const allLinks=html=>nodes(parse(html),node=>attribute(node,'data-public-task')!==undefined);

test('public procurement workflow is immutable and complete in three languages with five explicit fallbacks',()=>{
  assert.equal(core.workflowKeys.length,13);assert.ok(Object.isFrozen(core)&&Object.isFrozen(core.workflowKeys));
  for(const locale of ['zh','en','ru','kk','ky','tg','tk','uz']){
    for(const key of core.workflowKeys){assert.ok(core.text(key,locale));if(!['zh','en','ru'].includes(locale))assert.equal(core.text(key,locale),core.text(key,'en'));}
    assert.ok(Object.isFrozen(core.assistant(locale)));assert.equal(Object.keys(core.assistant(locale)).length,12);
  }
  assert.throws(()=>core.text('missing','en'),TypeError);
});
test('public task destinations are bounded and old product aliases remain canonical',()=>{
  for(const locale of ['zh','en','ru','kk']){
    assert.equal(core.href('company-history',locale,catalog),'/'+core.language(locale)+'/company/history/');
    assert.equal(core.href('about',locale,catalog),'/'+core.language(locale)+'/company/');
    assert.equal(core.href('vacuum',locale,catalog),'/'+core.language(locale)+'/products/fibc-bulk-bags/');
    assert.equal(core.href('sample',locale,catalog),'/#sample');
  }
  for(const value of ['https://example.test/','javascript:alert(1)','missing',null,{},'__proto__'])assert.throws(()=>core.href(value,'en',catalog),TypeError);
});
test('home cards retain original icons and company information while fixing custom destination and language fallback',()=>{
  const before=JSON.stringify(legacy.HNAV);
  for(const locale of ['zh','en','ru','kk','ky','tg','tk','uz']){
    const links=allLinks(core.home(legacy.HNAV,locale,catalog));assert.equal(links.length,6);
    assert.equal(attribute(links[5],'data-public-task'),'quote');assert.equal(attribute(links[5],'href'),'/#quote');
    assert.ok(plainText(links[2]).includes(legacy.HNAV[2].desc[core.language(locale)]));
    assert.equal(nodes(links[2],n=>n.tagName==='svg').length,1);
    for(const node of links){assert.equal(node.tagName,'a');assert.doesNotMatch(plainText(node),/undefined|24 hours|24小时|24 часа|Samples and OEM available/);}
  }
  assert.equal(JSON.stringify(legacy.HNAV),before);
});
test('navigation escapes copy and rejects SVG execution and incomplete input',()=>{
  const home=structuredClone(legacy.HNAV);home[0].title.en='<img src=x onerror=alert(1)>';assert.equal(nodes(parse(core.home(home,'en',catalog)),n=>n.tagName==='img').length,0);
  for(const svg of ['<svg onload="alert(1)"></svg>','<svg><script>x</script></svg>','<svg><foreignObject></foreignObject></svg>','<svg><use href="x"/></svg>']){const bad=structuredClone(legacy.HNAV);bad[0].svg=svg;assert.throws(()=>core.home(bad,'en',catalog),TypeError);}
  assert.throws(()=>core.home([], 'en',catalog),TypeError);
});
test('assistant sample replies require confirmation in Chinese English and Russian',()=>{
  for(const [locale,input] of [['zh','我要样品'],['en','I need samples'],['ru','Нужны образцы']]){
    assert.equal(core.reply(input,locale),core.assistant(locale).sample);assert.doesNotMatch(core.reply(input,locale),/可安排样品|Samples are available|Бесплатно|free samples/i);
  }
  assert.equal(core.reply('samples','uz'),core.assistant('en').sample);
});
test('assistant requirements do not infer a bag or approved load from numeric text',()=>{
  for(const locale of ['zh','en','ru']){
    const labels=core.assistant(locale);assert.equal(core.reply('50kg 1000kg',locale),labels.fallback);
    assert.equal(core.reply('FIBC',locale),labels.ton);assert.equal(core.reply('valve',locale),labels.valve);
    assert.doesNotMatch(labels.valve+labels.ton,/25\/50|500-2000|\bfit\b|适合\s*\d/);
  }
  assert.equal(core.reply('клапанные мешки','ru'),core.assistant('ru').valve);
  assert.equal(core.reply('биг-бэг','ru'),core.assistant('ru').ton);
});
test('assistant combinations are deduplicated and input is bounded without automatic submission',()=>{
  const labels=core.assistant('en');assert.equal(core.reply('samples sample PRICE delivery email','en'),[labels.lead,labels.sample,labels.email,labels.need].join('\n\n'));
  assert.equal(core.reply('x'.repeat(2400),'en'),labels.fallback);
  for(const value of [null,undefined,{},[],1,'x'.repeat(2401)])assert.throws(()=>core.reply(value,'en'),TypeError);
  assert.match(labels.sent,/Nothing has been sent/);assert.match(core.assistant('zh').sent,/尚未发送/);assert.match(core.assistant('ru').sent,/ещё не отправлен/);
});
test('static and runtime translation owners agree across full legacy documents',()=>{
  for(const locale of ['zh','en','ru','kk','ky','tg','tk','uz']){
    const document=parse(source);localizePublicProcurement(document,locale,catalog,legacy);
    assert.deepEqual(auditProcurementDocument(document,locale,catalog),{locale,copyFields:13,nativeLinks:6});
    assert.equal(nodes(document,n=>core.workflowKeys.includes(attribute(n,'data-i'))).length,0);
    const history=nodes(document,n=>attribute(n,'data-company-timeline')!==undefined);assert.equal(history.length,1);
    assert.equal(nodes(history[0],n=>attribute(n,'class')==='tl-item').length,20);
  }
});
test('competing workflow owner fails closed and integration reuses existing inquiry transfer',()=>{
  const document=parse(source),node=nodes(document,n=>attribute(n,'data-public-copy')!==undefined)[0];node.attrs.push({name:'data-i',value:'rfq_h'});
  assert.throws(()=>localizePublicProcurement(document,'en',catalog,legacy),TypeError);
  assert.match(source,/return DongDaPublicProcurement\.reply\(text,lang\)/);assert.match(source,/if\(!showDone\)return/);assert.match(source,/nav\('inquiry'\);\s*document\.getElementById\('fi8'\)\.value=payload\.notes\.slice\(0,2400\)/);
  assert.doesNotMatch(core.reply('sample price','en'),/https?:\/\/|DD-\d|accepted|persisted/);
});
test('actual draft transfer protects notes receipt busy contacts and oversized transcripts without submission',()=>{
  let actual;
  for(const script of nodes(parse(source),n=>n.tagName==='script'&&!attribute(n,'src')&&attribute(n,'type')!=='application/ld+json')){
    const code=plainText(script),fn=parseJavaScript(code,{ecmaVersion:'latest'}).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='aiSendDemand');if(fn)actual=code.slice(fn.start,fn.end);
  }
  assert.ok(actual);
  function fixture({notes='',email='',receipt=null,busy=false}={}){
    const fields={fi8:{value:notes},fi3:{value:email},'inq-submit-btn':{disabled:busy}},events=[];
    const context={document:{getElementById:id=>fields[id]},inquiryReceipt:receipt,DongDaPublicProcurement:core,lang:'en',aiDemandPayload:message=>({notes:message,email:'chat@example.test'}),nav:page=>events.push(['nav',page]),setLeadStatus:(kind,text)=>events.push(['status',kind,text]),aiLabels:()=>core.assistant('en'),aiAddMessage:(role,text)=>events.push(['message',role,text]),aiClose:()=>events.push(['close'])};
    vm.runInNewContext(actual,context,{timeout:500});return {fields,events,send:context.aiSendDemand};
  }
  for(const input of [{notes:'Existing notes'},{receipt:'synthetic-receipt'},{busy:true}]){const item=fixture(input);item.send('Sample requirements',true);assert.equal(item.fields.fi8.value,input.notes||'');assert.deepEqual(item.events.map(row=>row[0]),['message']);assert.equal(item.events[0][2],core.text('transferBlocked','en'));}
  const long=fixture();long.send('x'.repeat(2401),true);assert.equal(long.fields.fi8.value,'');assert.equal(long.events[0][2],core.text('transferLong','en'));
  const existingEmail=fixture({email:'existing@example.test'});existingEmail.send('Sample requirements',true);assert.equal(existingEmail.fields.fi3.value,'existing@example.test');assert.equal(existingEmail.fields.fi8.value,'Sample requirements');assert.ok(existingEmail.events.some(row=>row[0]==='status'&&row[2]===core.assistant('en').sent));
  const blank=fixture();blank.send('x'.repeat(2400),true);assert.equal(blank.fields.fi3.value,'chat@example.test');assert.equal(blank.fields.fi8.value.length,2400);
  const noTransfer=fixture();noTransfer.send('Sample requirements',false);assert.deepEqual(noTransfer.events,[]);assert.equal(noTransfer.fields.fi8.value,'');
});
