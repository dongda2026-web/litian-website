import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parse} from 'parse5';
import {runInNewContext} from 'node:vm';
import {renderCompanyDocument} from '../scripts/build-company-pages.mjs';
import {companyLegacy} from '../scripts/company-legacy.mjs';
import {nodes,attribute,plainText} from '../scripts/build-product-pages.mjs';
const core=globalThis.DongDaCompany,input=JSON.parse(await readFile(new URL('../content/company-history.json',import.meta.url),'utf8')),registry=core.create(input),source=await readFile(new URL('../index.html',import.meta.url),'utf8'),legacy=companyLegacy(source),ui=await readFile(new URL('../assets/js/company-ui.js',import.meta.url),'utf8');
const clone=()=>structuredClone(input);
test('company strict envelope rejects unknown keys, approval upgrades and incomplete languages',()=>{
  for(const value of [null,[],{...input,extra:true},{...input,reviewStatus:'approved'},{...input,languages:['zh','en','ru']},{...input,milestones:input.milestones.slice(1)},{...input,provenance:{...input.provenance,url:'secret'}}])assert.throws(()=>core.create(value));
  for(const key of ['title','description']){const changed=clone();delete changed.milestones[0][key].uz;assert.throws(()=>core.create(changed));}
  const changed=clone();changed.milestones[0].title.en='\0';assert.throws(()=>core.create(changed));
});
test('history IDs, ascending years, provenance and immutable copies are enforced',()=>{
  for(const mutate of [v=>v.milestones[1].year=1987,v=>v.milestones[0].id='other',v=>v.milestones.reverse(),v=>v.provenance.sourceSha256='x',v=>v.milestones[0].extra='x']){const changed=clone();mutate(changed);assert.throws(()=>core.create(changed));}
  assert.equal(Object.isFrozen(registry.data.milestones[0].title),true);const changed=clone(),copy=core.create(changed);changed.milestones[0].title.en='Changed';assert.notEqual(copy.data.milestones[0].title.en,'Changed');assert.throws(()=>registry.data.milestones.push({}));
});
test('all 20 original milestone translations survive in all eight languages',()=>{
  for(const[ordinal,row]of registry.data.milestones.entries())for(const language of core.historyLanguages){assert.equal(row.title[language],legacy.T[language]['tl'+ordinal+'_t']);assert.equal(row.description[language],legacy.T[language]['tl'+ordinal+'_d']);}
  assert.equal(registry.data.milestones[0].year,1987);assert.equal(registry.data.milestones.at(-1).year,2026);assert.equal(registry.resolve('milestone-2021').year,2021);assert.equal(registry.resolve('missing'),null);
});
test('enumerated decades select only exact records and tolerate unsafe query input without inference',()=>{
  assert.deepEqual(registry.periods,['all','1980','1990','2000','2010','2020']);assert.equal(registry.filter('2020').length,7);assert.equal(registry.filter('1980').length,1);assert.throws(()=>registry.filter('constructor'));
  for(const query of ['?period=secret','?period=2020&period=1990','?period=','?x=2020'])assert.equal(core.readPeriod(query,registry),'all');assert.equal(core.readPeriod('?period=2020',registry),'2020');
});
test('company route and canonical metadata have explicit locales, no invented organization schema',()=>{
  for(const language of core.languages)for(const kind of ['overview','history']){assert.deepEqual(core.parsePath(core.path(kind,language)),{kind,language});const meta=core.metadata(kind,language,'https://cn-dongda.com');assert.equal(meta.robots,'noindex,follow');assert.equal(meta.schema,null);assert.equal(meta.canonical,'https://cn-dongda.com'+core.path(kind,language));assert.equal(meta.alternates.length,3);}
  for(const path of ['/kk/company/','//zh/company/','/zh/company/missing/','/zh/company/?period=2020','/zh/company/history/index.html/'])assert.equal(core.parsePath(path),null);assert.equal(core.parsePath('/ru/company/history/index.html').kind,'history');assert.equal(core.path('history','kk'),'/en/company/history/');assert.throws(()=>core.path('other','en'));assert.throws(()=>core.metadata('history','en','https://user:password@example.com'));assert.throws(()=>core.target('history','en','<script>'));assert.throws(()=>core.target('overview','en','all','milestone-1987'));
});
test('timeline escapes text and retains unique native year anchors and accessible enumerated controls',()=>{
  const changed=clone();changed.milestones[0].title.en='<img src=x onerror=alert(1)>';const html=core.historyPage(core.create(changed),'en','all'),document=parse(html);assert.equal(nodes(document,n=>n.tagName==='img').length,1);assert.ok(html.includes('&lt;img'));assert.equal(nodes(document,n=>(attribute(n,'class')||'').includes('company-milestone')).length,20);assert.equal(nodes(document,n=>attribute(n,'id')==='milestone-1987').length,1);assert.equal(nodes(document,n=>n.tagName==='option').length,6);assert.equal(core.localized(input.milestones[0].title,'uz'),input.milestones[0].title.uz);assert.equal(core.text('history','uz'),core.text('history','en'));
});
test('six physical pages prerender overview/body/capabilities and full history without scripts',()=>{
  for(const language of core.languages)for(const kind of ['overview','history']){
    const html=renderCompanyDocument(source,language,kind,'https://cn-dongda.com',registry,legacy),document=parse(html,{scriptingEnabled:false}),active=nodes(document,n=>attribute(n,'class')==='page on');assert.equal(active.length,1);assert.equal(attribute(active[0],'id'),kind==='history'?'page-company-history':'page-about');assert.equal(attribute(nodes(document,n=>attribute(n,'rel')==='canonical')[0],'href'),'https://cn-dongda.com'+core.path(kind,language));assert.equal(nodes(document,n=>attribute(n,'id')==='company-seo').length,0);assert.equal(nodes(document,n=>attribute(n,'hreflang')!==undefined).length,4);
    if(kind==='history'){assert.equal(nodes(active[0],n=>attribute(n,'class')==='company-milestone').length,20);assert.equal(plainText(nodes(active[0],n=>n.tagName==='h1')[0]),core.text('history',language));}
    else {assert.equal(plainText(nodes(active[0],n=>attribute(n,'id')==='about-body')[0]),legacy.T[language].ab_body);assert.equal(nodes(active[0],n=>attribute(n,'class')==='cap-row').length,legacy.CAPS[language].length);assert.equal(nodes(active[0],n=>attribute(n,'class')==='cert').length,legacy.CERTS.length);}
    assert.equal(nodes(document,n=>attribute(n,'class')==='tl-item').length,20);assert.equal(attribute(nodes(document,n=>attribute(n,'id')==='skip-main')[0],'href'),core.path(kind,language)+'#main-content');
  }
});
function fixture(){
  const elements=new Map(),context={DongDaCompany:core,DONGDA_COMPANY_HISTORY:input,DongDaProductPage:globalThis.DongDaProductPage,DONGDA_PUBLIC_SEO:{canonical:'https://cn-dongda.com'},lang:'zh',routeRestoring:false,companyPeriod:'all',location:{search:'?period=2020',hash:'#milestone-2021'},history:{calls:[],pushState(a,b,path){this.calls.push(['push',path]);},replaceState(a,b,path){this.calls.push(['replace',path]);}},esc:core.escape,catalogIcon:()=>'',document:{getElementById(id){if(!elements.has(id))elements.set(id,{innerHTML:'',classList:{contains:()=>id==='page-company-history'},focus(){this.focused=true;},scrollIntoView(){this.scrolled=true;}});return elements.get(id);},querySelector(){return null;},querySelectorAll(){return[];}},updatePublicPageSeo(meta){context.meta=meta;}};runInNewContext(ui,context);return context;
}
test('UI restores period/anchor before language navigation and uses replace for language changes',()=>{
  const c=fixture();assert.equal(c.restoreCompanyPage('/zh/company/history/').kind,'history');assert.equal(c.companyPeriod,'2020');assert.equal(c.companyAnchor,'milestone-2021');assert.equal(c.companyTarget('company-history'),'/zh/company/history/?period=2020#milestone-2021');assert.equal(c.companyTarget('about'),'/zh/company/');c.lang='ru';c.syncCompanyLanguage();assert.equal(c.history.calls.at(-1)[0],'replace');assert.equal(c.history.calls.at(-1)[1],'/ru/company/history/?period=2020#milestone-2021');c.focusCompanyAnchor();assert.equal(c.document.getElementById('milestone-2021').scrolled,true);
});
test('UI filters only allowed periods and isolates all personal/RFQ storage and submission state',()=>{
  const c=fixture();c.setCompanyPeriod('bad');assert.equal(c.history.calls.length,0);c.setCompanyPeriod('1990');assert.equal(c.history.calls.at(-1)[1],'/zh/company/history/?period=1990');assert.equal(c.companyAnchor,'');assert.equal(c.document.getElementById('company-period').focused,true);c.routeRestoring=true;c.syncCompanyLanguage();assert.equal(c.history.calls.length,1);c.restoreCompanyPage('/zh/company/');assert.equal(c.companyPeriod,'all');assert.equal(c.companyAnchor,'');assert.doesNotMatch(ui,/(?:local|session)Storage|fetch\(|qState|rfqListState|submitInquiry/);
});
