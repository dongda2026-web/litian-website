import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {parse,parseFragment,serialize} from 'parse5';
import {nodes,attribute,setAttribute,inner,applyDocumentSeo,localizeDocument} from './build-product-pages.mjs';
import {localizeResourceLinks} from './build-resource-pages.mjs';
import {localizeInsightLinks} from './build-insight-pages.mjs';
import {localizeSiteSearchLinks} from './build-site-search-pages.mjs';
import {localizeAccessibility} from './build-public-accessibility.mjs';
import '../assets/js/faq-core.js';

export async function loadFaq(root){
  const catalog=globalThis.DongDaCatalog.create(JSON.parse(await readFile(join(root,'content/products.json'),'utf8')));
  const insights=globalThis.DongDaInsights.create(JSON.parse(await readFile(join(root,'content/insights.json'),'utf8')),catalog);
  return {catalog,registry:globalThis.DongDaFAQ.create(JSON.parse(await readFile(join(root,'content/faqs.json'),'utf8')),catalog,insights)};
}
export function localizeFaqLinks(document,locale){
  const core=globalThis.DongDaFAQ;
  for(const link of nodes(document,n=>attribute(n,'data-faq-link')!==undefined)){setAttribute(link,'href',core.path(locale));inner(link,core.escape(core.text('title',locale))+(attribute(link,'class')==='footer-lnk'?'':globalThis.DongDaSiteSearch.icon('ArrowRight')));}
  const library=nodes(document,n=>attribute(n,'id')==='page-news')[0];
  const heading=library&&nodes(library,n=>(attribute(n,'class')||'').split(' ').includes('insight-heading'))[0];
  if(heading&&!nodes(library,n=>attribute(n,'data-faq-link')!==undefined).length){const fragment=parseFragment(core.entryLink(locale));for(const node of fragment.childNodes)node.parentNode=heading;heading.childNodes.push(...fragment.childNodes);}
}
export function renderFaqDocument(source,locale,origin,{catalog,registry}){
  const core=globalThis.DongDaFAQ,document=parse(source),byId=id=>nodes(document,n=>attribute(n,'id')===id)[0];
  applyDocumentSeo(document,core.metadata(locale,origin),'faq-seo',globalThis.DongDaProductPage.origin(origin)+core.path('en'));
  localizeDocument(document,locale);localizeResourceLinks(document,locale);localizeInsightLinks(document,locale);localizeSiteSearchLinks(document,locale);
  for(const node of nodes(document,n=>(attribute(n,'class')||'').split(' ').includes('page')))setAttribute(node,'class','page');
  setAttribute(byId('page-faq'),'class','page on');setAttribute(byId('pageLoader'),'class','page-loader hide');
  inner(byId('page-faq'),core.overview(locale,registry,catalog));inner(byId('faq-count'),registry.entries.length+' / '+registry.entries.length+' '+core.escape(core.text('count',locale)));
  setAttribute(nodes(document,n=>attribute(n,'class')==='faq-tool faq-reset')[0],'disabled','');
  localizeFaqLinks(document,locale);localizeAccessibility(document,locale,core.path(locale));
  return serialize(document);
}
export async function buildFaqPages({root,client,existingRoutes}){
  const core=globalThis.DongDaFAQ,data=await loadFaq(root),source=await readFile(join(root,'index.html'),'utf8');
  const settings=JSON.parse(await readFile(join(root,'content/site-settings.json'),'utf8')),origin=globalThis.DongDaProductPage.origin(settings.seo.canonical),routes=[];
  for(const locale of core.languages){const path=core.path(locale),directory=join(client,path);await mkdir(directory,{recursive:true});await writeFile(join(directory,'index.html'),renderFaqDocument(source,locale,origin,data));routes.push({path,language:locale,indexable:false});}
  for(const route of [{path:'/',language:'en'},...existingRoutes]){const file=join(client,route.path,'index.html'),document=parse(await readFile(file,'utf8'));localizeFaqLinks(document,route.language);await writeFile(file,serialize(document));}
  await writeFile(join(client,'content/faq-routes.json'),JSON.stringify({version:core.version,origin,routes},null,2)+'\n');
  const redirects=(await readFile(join(client,'_redirects'),'utf8')).replace('/* /404.html 404\n','');
  await writeFile(join(client,'_redirects'),redirects+routes.flatMap(route=>[`${route.path.slice(0,-1)} ${route.path} 301`,`${route.path}index.html ${route.path} 301`]).join('\n')+'\n/* /404.html 404\n');
  const manifest=JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8'));manifest.pages.push(...routes.map(route=>route.path.slice(1)+'index.html'));manifest.build_version=core.version;manifest.faq_version=core.version;
  await writeFile(join(client,'site-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  process.stdout.write(`Procurement FAQ: ${routes.length} routes, ${data.registry.entries.length} reused answers, noindex.\n`);return routes;
}
