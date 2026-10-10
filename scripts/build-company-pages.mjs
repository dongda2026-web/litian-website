import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {parse,serialize} from 'parse5';
import {nodes,attribute,setAttribute,inner,applyDocumentSeo,localizeDocument} from './build-product-pages.mjs';
import {localizeResourceLinks} from './build-resource-pages.mjs';
import {localizeInsightLinks} from './build-insight-pages.mjs';
import {localizeSiteSearchLinks} from './build-site-search-pages.mjs';
import {localizeFaqLinks} from './build-faq-pages.mjs';
import {localizeSelectionLinks} from './build-selection-pages.mjs';
import {localizeAccessibility} from './build-public-accessibility.mjs';
import {companyLegacy} from './company-legacy.mjs';
import '../assets/js/company-core.js';
import '../assets/js/company-profile-core.js';

export function localizeCompanyLinks(document,language,registry){
  const core=globalThis.DongDaCompany;
  for(const link of nodes(document,n=>attribute(n,'data-company-link')!==undefined)){
    setAttribute(link,'href',core.path(attribute(link,'data-company-link'),language));
    if(attribute(link,'data-company-entry')!==undefined)inner(link,core.escape(core.text('entry',language))+globalThis.DongDaSelectionView.icon('ArrowRight'));
  }
  const timeline=nodes(document,n=>attribute(n,'data-company-timeline')!==undefined)[0];if(timeline)inner(timeline,core.inlineTimeline(registry,language));
}
function prerenderOverview(active,legacy,language,profile){
  const core=globalThis.DongDaCompany,t=legacy.T[language]||legacy.T.en,byId=id=>nodes(active,n=>attribute(n,'id')===id)[0];
  for(const node of nodes(active,n=>attribute(n,'data-i')!==undefined)){const key=attribute(node,'data-i'),value=t[key]??legacy.T.en[key];if(value!==undefined){if(attribute(node,'data-cap')!==undefined)setAttribute(node,'data-cap',value);else inner(node,value);}}
  const projected=profile?globalThis.DongDaCompanyProfile.create(profile).project(language):null;
  if(projected)for(const node of nodes(active,n=>Object.hasOwn(projected.copy,attribute(n,'data-i')))){const value=projected.copy[attribute(node,'data-i')];if(attribute(node,'data-cap')!==undefined)setAttribute(node,'data-cap',value);else inner(node,core.escape(value));}
  inner(byId('about-body'),core.escape(projected?projected.copy.ab_body:t.ab_body||''));
  inner(byId('about-caps'),(projected?projected.capabilities:legacy.CAPS[language]).map(row=>'<li class="cap-row"><span class="cap-n">'+core.escape(row[0])+'</span><span class="cap-t">'+core.escape(row[1])+'</span></li>').join(''));
  const pillars=projected?projected.pillars:legacy.ABOUT_PILLARS.map(row=>({tag:row.tag[language],code:typeof row.code==='object'?row.code[language]:row.code,title:row.title[language],desc:row.desc[language]}));
  inner(byId('about-pillars'),pillars.map(row=>'<div class="pillar"><span class="pillar-tag">'+core.escape(row.tag)+'</span><div class="pillar-num">'+core.escape(row.code)+'</div><div class="pillar-title">'+core.escape(row.title)+'</div><div class="pillar-desc">'+core.escape(row.desc)+'</div></div>').join(''));
  inner(byId('cert-grid'),legacy.CERTS.map(row=>'<div class="cert"><div class="cert-code">'+core.escape(typeof row.code==='object'?row.code[language]:row.code)+'</div><div class="cert-name">'+core.escape(typeof row.name==='object'?row.name[language]:row.name)+'</div><div class="cert-desc">'+core.escape(row.desc[language])+'</div></div>').join(''));
}
export function renderCompanyDocument(source,language,kind,origin,registry,legacy=companyLegacy(source),profile=null){
  const core=globalThis.DongDaCompany,document=parse(source);
  applyDocumentSeo(document,core.metadata(kind,language,origin),'company-seo',origin+core.path(kind,'en'));
  for(const schema of nodes(document,n=>attribute(n,'id')==='company-seo'))schema.parentNode.childNodes=schema.parentNode.childNodes.filter(n=>n!==schema);
  localizeDocument(document,language);localizeResourceLinks(document,language);localizeInsightLinks(document,language);localizeSiteSearchLinks(document,language);localizeFaqLinks(document,language);localizeSelectionLinks(document,language);
  for(const node of nodes(document,n=>(attribute(n,'class')||'').split(' ').includes('page')))setAttribute(node,'class','page');
  setAttribute(nodes(document,n=>attribute(n,'id')==='pageLoader')[0],'class','page-loader hide');
  const active=nodes(document,n=>attribute(n,'id')===(kind==='history'?'page-company-history':'page-about'))[0];setAttribute(active,'class','page on');
  if(kind==='history')inner(active,core.historyPage(registry,language,'all'));
  else {prerenderOverview(active,legacy,language,profile);const head=nodes(document,n=>n.tagName==='head')[0];inner(head,serialize(head)+'<noscript><style>#page-about .rv,#page-about .reveal{opacity:1!important;transform:none!important}</style></noscript>');}
  localizeCompanyLinks(document,language,registry);localizeAccessibility(document,language,core.path(kind,language));return serialize(document);
}
export async function buildCompanyPages({root,client,existingRoutes}){
  const core=globalThis.DongDaCompany,source=await readFile(join(root,'index.html'),'utf8'),legacy=companyLegacy(source),registry=core.create(JSON.parse(await readFile(join(root,'content/company-history.json'),'utf8')));
  const profile=globalThis.DongDaCompanyProfile.create(JSON.parse(await readFile(join(root,'content/company-profile.json'),'utf8'))).data;
  const settings=JSON.parse(await readFile(join(root,'content/site-settings.json'),'utf8')),origin=globalThis.DongDaProductPage.origin(settings.seo.canonical),routes=[];
  for(const language of core.languages)for(const kind of ['overview','history']){const path=core.path(kind,language);await mkdir(join(client,path),{recursive:true});await writeFile(join(client,path,'index.html'),renderCompanyDocument(source,language,kind,origin,registry,legacy,profile));routes.push({path,language,kind,indexable:false,reviewStatus:'legacy-pending'});}
  for(const route of [{path:'/',language:'en'},...existingRoutes]){const file=join(client,route.path,'index.html'),document=parse(await readFile(file,'utf8'));localizeCompanyLinks(document,route.language,registry);await writeFile(file,serialize(document));}
  await writeFile(join(client,'content/company-routes.json'),JSON.stringify({version:core.version,origin,routes},null,2)+'\n');
  const redirects=(await readFile(join(client,'_redirects'),'utf8')).replace('/* /404.html 404\n','');await writeFile(join(client,'_redirects'),redirects+routes.flatMap(route=>[`${route.path.slice(0,-1)} ${route.path} 301`,`${route.path}index.html ${route.path} 301`]).join('\n')+'\n/* /404.html 404\n');
  const manifest=JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8'));manifest.pages.push(...routes.map(route=>route.path.slice(1)+'index.html'));manifest.company_version=core.version;await writeFile(join(client,'site-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  process.stdout.write('Company entities: 6 noindex routes; 20 legacy milestones, 8 preserved translations.\n');return routes;
}
