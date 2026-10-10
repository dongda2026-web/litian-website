import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {parse as parseJavaScript} from 'acorn';
import {parse} from 'parse5';
import {companyLegacy} from '../scripts/company-legacy.mjs';
import {renderCompanyDocument} from '../scripts/build-company-pages.mjs';
import {nodes,attribute,plainText} from '../scripts/build-product-pages.mjs';
import {schemaVersion,editorialSchemaVersion,historySchemaVersion,legacySchemaVersion,seedRecords,composeExport,getPath,setPath,textLimit} from '../cms/content-contract.mjs';
import {maxExportBytes} from '../cms/service.mjs';
const read=async name=>JSON.parse(await fs.readFile(new URL('../content/'+name+'.json',import.meta.url)));
const profile=await read('company-profile'),products=await read('products'),industries=await read('industries'),history=await read('company-history'),editorial={insights:await read('insights'),resources:await read('resources')};
const source=await fs.readFile(new URL('../index.html',import.meta.url),'utf8'),legacy=companyLegacy(source),core=globalThis.DongDaCompanyProfile,clone=value=>structuredClone(value);
const seeds=seedRecords(products,industries,history,editorial,profile),seed=seeds.at(-1);
const row=(item=seed)=>({postId:seeds.indexOf(item)+1,kind:item.kind,id:item.id,data:clone(item.data),baselineHash:item.baselineHash,revision:1,modifiedAt:'2026-10-09T12:00:00Z',status:'publish'});
const envelope=(records=[],schema=schemaVersion,scope='published')=>({schema,scope,records});
const compose=(value,scope='published')=>composeExport(value,products,industries,scope,history,editorial,profile);
function functions(code){const found=new Map();function walk(n){if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration')found.set(n.id.name,code.slice(n.start,n.end));for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}walk(parseJavaScript(code,{ecmaVersion:'latest'}));return found;}

test('company profile preserves all eight original text projections, capability and pillar fallback',()=>{
  const registry=core.create(profile);assert.equal(registry.data.reviewStatus,'legacy-pending');assert.equal(seed.editable.length,102);assert.equal(seeds.length,45);assert.deepEqual(seeds.slice(0,44),seedRecords(products,industries,history,editorial));
  for(const language of core.languages){const projected=registry.project(language),fallback=['zh','en','ru'].includes(language)?language:'en';for(const key of core.keys)assert.equal(projected.copy[key],legacy.T[language][key]??legacy.T.en[key]);assert.deepEqual(projected.capabilities,JSON.parse(JSON.stringify(legacy.CAPS[fallback])));for(const [i,pillar]of projected.pillars.entries())for(const field of ['code','tag','title','desc'])assert.equal(pillar[field],legacy.ABOUT_PILLARS[i][field][fallback]);}
  assert.deepEqual(registry.project('constructor'),registry.project('en'));assert.ok(Object.isFrozen(registry.data.copy));assert.throws(()=>{registry.data.copy.ab_h1.zh='changed';},TypeError);
});
test('company profile rejects unknown structure, language, identities, protected facts and provenance',()=>{
  for(const edit of [v=>v.extra=true,v=>v.reviewStatus='approved',v=>v.id='other',v=>v.provenance.source='editor-approved',v=>v.provenance.sourceSha256='bad',v=>v.copy.ab_h1.fr='extra',v=>delete v.copy.ab_body.ru,v=>v.capabilities.reverse(),v=>v.capabilities.push(clone(v.capabilities[0])),v=>v.pillars[0].id='other',v=>v.pillars.reverse(),v=>v.protected.facts[0].value='2000',v=>v.protected.periods[0]='1990-1997',v=>v.protected.image='other.jpg',v=>v.protected.brand='Other']){const value=clone(profile);edit(value);assert.throws(()=>core.create(value));}
});
test('company profile CMS protects other languages, labels, order, images, fact numbers and source identity',()=>{
  for(const edit of [v=>v.copy.ab_h1.kk='other',v=>v.pillars[0].tag.zh='other',v=>v.pillars[0].code.en='other',v=>v.capabilities[0].marker='06',v=>v.protected.facts[1].value='9,999',v=>v.protected.periods.reverse(),v=>v.provenance.sourceSha256='0'.repeat(64),v=>v.reviewStatus='approved']){const changed=row();edit(changed.data);assert.throws(()=>compose(envelope([changed])),/protected/);}
  const changed=row();changed.data.copy.ab_body.zh='Synthetic pending overview';changed.data.capabilities[0].text.en='Synthetic requirement';changed.data.pillars[0].desc.ru='Synthetic paragraph';const result=compose(envelope([changed]));assert.equal(result.companyProfile.copy.ab_body.zh,'Synthetic pending overview');assert.deepEqual(result.companyProfile.protected,profile.protected);assert.deepEqual(result.companyHistory,history);assert.deepEqual(result.resources,editorial.resources);assert.notEqual(changed.data.copy.ab_body.zh,profile.copy.ab_body.zh);
});
test('company profile fields independently enforce UTF-16 limits, missing data, controls and plain text',()=>{
  for(const field of seed.editable){const changed=row(),limit=textLimit(field,seed.kind);setPath(changed.data,field,'x'.repeat(limit));assert.equal(compose(envelope([changed])).changedRecords,1);setPath(changed.data,field,'x'.repeat(limit+1));assert.throws(()=>compose(envelope([changed])),/plain-text/);}
  for(const value of ['', ' ', '<img src=x>', '\ntext','\ttext','bad\u007f']){const changed=row();changed.data.copy.ab_h1.zh=value;assert.throws(()=>compose(envelope([changed])),/plain-text/);assert.throws(()=>core.create(changed.data),/text/);}
  const changed=row();changed.data.copy.ab_h1.zh='\u{1f600}'.repeat(60);assert.equal(compose(envelope([changed])).changedRecords,1);changed.data.copy.ab_h1.zh+='x';assert.throws(()=>compose(envelope([changed])),/plain-text/);
});
test('v1 v2 v3 exports preserve the profile and cannot ingest its new kind',()=>{
  for(const schema of [legacySchemaVersion,historySchemaVersion,editorialSchemaVersion]){const old=row(seeds[0]);old.data.summary.zh='Synthetic legacy update';assert.deepEqual(compose(envelope([old],schema)).companyProfile,profile);assert.throws(()=>compose(envelope([row()],schema)),/Unknown/);}
  assert.throws(()=>compose(envelope(Array.from({length:46},()=>row()))),/envelope/);assert.throws(()=>compose(envelope([row(),row()])),/duplicate/);
  const stale=row();stale.baselineHash='stale';assert.throws(()=>compose(envelope([stale])),/stale/);const draft=row();draft.status='draft';assert.throws(()=>compose(envelope([draft])),/Draft/);assert.equal(compose(envelope([draft],schemaVersion,'preview'),'preview').changedRecords,1);
});
test('all 45 maximum-length trilingual records fit the unchanged private 1MiB reader',()=>{
  const records=seeds.map(item=>{const next=row(item);for(const field of item.editable)setPath(next.data,field,'\u5b57'.repeat(textLimit(field,item.kind)));return next;}),data=envelope(records);assert.ok(Buffer.byteLength(JSON.stringify(data))<maxExportBytes);assert.equal(compose(data).changedRecords,45);assert.equal(compose(data).companyProfile.reviewStatus,'legacy-pending');
});
test('company static renderer reads edited profile but preserves facts, brand, images, certificates and noindex',()=>{
  const registry=globalThis.DongDaCompany.create(history);
  for(const language of ['zh','en','ru']){
    const original=renderCompanyDocument(source,language,'overview','https://cn-dongda.com',registry,legacy),current=renderCompanyDocument(source,language,'overview','https://cn-dongda.com',registry,legacy,profile);assert.equal(current,original);
    const changed=clone(profile);changed.copy.ab_h1[language]='Synthetic heading '+language;changed.copy.ab_body[language]='Synthetic body & safe text';changed.capabilities[0].text[language]='Synthetic capability';changed.pillars[0].desc[language]='Synthetic pillar';
    const rendered=parse(renderCompanyDocument(source,language,'overview','https://cn-dongda.com',registry,legacy,changed)),active=nodes(rendered,n=>attribute(n,'id')==='page-about')[0];
    assert.equal(plainText(nodes(active,n=>attribute(n,'data-i')==='ab_h1')[0]),'Synthetic heading '+language);assert.equal(plainText(nodes(active,n=>attribute(n,'id')==='about-body')[0]),'Synthetic body & safe text');assert.match(plainText(active),/Synthetic capability/);assert.match(plainText(active),/Synthetic pillar/);
    const old=parse(original);for(const id of ['cert-grid'])assert.equal(plainText(nodes(rendered,n=>attribute(n,'id')===id)[0]),plainText(nodes(old,n=>attribute(n,'id')===id)[0]));for(const value of ['1991','3,000+','500M+','30+'])assert.ok(plainText(active).includes(value));assert.match(current,/noindex,follow/);
  }
});
test('actual buildAbout projection survives eight language updates without mutating legacy maps',()=>{
  const scripts=nodes(legacy.document,n=>n.tagName==='script'&&!attribute(n,'src')),code=scripts.map(plainText).find(value=>value.includes('function buildAbout()')),build=functions(code).get('buildAbout'),before=JSON.stringify({T:legacy.T,CAPS:legacy.CAPS,ABOUT_PILLARS:legacy.ABOUT_PILLARS});
  const changes=clone(profile);changes.copy.ab_h1.zh='Synthetic browser heading';changes.copy.ab_body.ru='Synthetic browser paragraph & text';
  const fields=core.keys.map(key=>({key,textContent:'',getAttribute:()=>key,hasAttribute:()=>false})),elements=Object.fromEntries(['about-body','about-caps','about-pillars'].map(id=>[id,{}]));elements['page-about']={querySelectorAll:()=>fields};
  const context=vm.createContext({lang:'en',T:legacy.T,CERTS:null,document:{getElementById:id=>elements[id]||null},DongDaCompany:globalThis.DongDaCompany,DongDaCompanyProfile:core,DONGDA_COMPANY_PROFILE:changes,companyProfileRegistry:undefined});vm.runInContext(build,context);
  for(const language of core.languages){context.lang=language;context.buildAbout();assert.equal(elements['about-body'].textContent,changes.copy.ab_body[language]);assert.equal(fields.find(row=>row.key==='ab_h1').textContent,changes.copy.ab_h1[language]);assert.doesNotMatch(elements['about-caps'].innerHTML,/undefined/);assert.doesNotMatch(elements['about-pillars'].innerHTML,/undefined/);}
  assert.equal(JSON.stringify({T:legacy.T,CAPS:legacy.CAPS,ABOUT_PILLARS:legacy.ABOUT_PILLARS}),before);
});
test('actual private editor helper labels and limits cover all 102 company paths without browser storage',async()=>{
  const code=await fs.readFile(new URL('../cms/wordpress/history-candidate/admin.js',import.meta.url),'utf8'),found=functions(code),context=vm.createContext({});vm.runInContext(['recordName','recordKind','recordExcerpt','titleField','fieldLabel','fieldLimit'].map(name=>found.get(name)).join('\n'),context);
  assert.equal(context.recordName(row()),profile.copy.ab_h1.zh);assert.equal(context.recordKind(row()),'企业概况');assert.equal(context.recordExcerpt(seed.kind,profile),profile.copy.ab_body.zh);
  for(const field of seed.editable){assert.ok(context.fieldLabel(seed.kind,field));assert.equal(context.fieldLimit(seed.kind,field),textLimit(field,seed.kind));assert.equal(typeof getPath(profile,field),'string');}
  assert.doesNotMatch(code,/innerHTML|localStorage|sessionStorage|applicationPassword/);
});
test('actual company certification rendering preserves three locales and falls back for the other five',()=>{
  const code=nodes(legacy.document,n=>n.tagName==='script'&&!attribute(n,'src')).map(plainText).find(value=>value.includes('function buildAbout()')),build=functions(code).get('buildAbout'),certs={};
  const context=vm.createContext({lang:'en',T:legacy.T,CERTS:legacy.CERTS,document:{getElementById:id=>id==='cert-grid'?certs:null},DongDaCompany:globalThis.DongDaCompany,DongDaCompanyProfile:core,DONGDA_COMPANY_PROFILE:profile,companyProfileRegistry:undefined});vm.runInContext(build,context);
  const outputs={};for(const language of core.languages){context.lang=language;context.buildAbout();outputs[language]=certs.innerHTML;assert.doesNotMatch(outputs[language],/undefined/);}
  for(const language of ['kk','ky','tg','tk','uz'])assert.equal(outputs[language],outputs.en);
  for(const language of ['zh','en','ru'])for(const row of legacy.CERTS)assert.ok(outputs[language].includes(row.desc[language]));assert.equal(profile.reviewStatus,'legacy-pending');
});
