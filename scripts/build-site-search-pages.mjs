import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, serialize } from 'parse5';
import { nodes, attribute, setAttribute, inner, applyDocumentSeo, localizeDocument } from './build-product-pages.mjs';
import { localizeResourceLinks } from './build-resource-pages.mjs';
import { localizeInsightLinks } from './build-insight-pages.mjs';
import '../assets/js/industry-core.js';
import '../assets/js/site-search-core.js';
import '../assets/js/faq-core.js';

export async function loadSiteSearch(root) {
  const sources={};
  for(const key of ['products','industries','resources','insights','faqs'])sources[key]=JSON.parse(await readFile(join(root,'content',key+'.json'),'utf8'));
  return globalThis.DongDaSiteSearch.create(sources);
}
export function localizeSiteSearchLinks(document,locale) {
  const core=globalThis.DongDaSiteSearch;
  for(const link of nodes(document,node=>attribute(node,'data-site-search')!==undefined)){
    setAttribute(link,'href',core.path(locale));setAttribute(link,'title',core.text('search',locale));setAttribute(link,'aria-label',core.text('search',locale));
    inner(link,(attribute(link,'class')||'').split(' ').includes('site-search-entry')?core.icon('Search'):core.escape(core.text('search',locale)));
  }
}
export function renderSiteSearchDocument(source,locale,origin,registry) {
  const core=globalThis.DongDaSiteSearch,document=parse(source);
  const byId=id=>{const node=nodes(document,n=>attribute(n,'id')===id)[0];if(!node)throw new TypeError('Missing search hook: '+id);return node;};
  applyDocumentSeo(document,core.metadata(locale,origin),'site-search-seo',globalThis.DongDaProductPage.origin(origin)+core.path('en'));
  localizeDocument(document,locale);localizeResourceLinks(document,locale);localizeInsightLinks(document,locale);localizeSiteSearchLinks(document,locale);
  for(const node of nodes(document,n=>(attribute(n,'class')||'').split(' ').includes('page')))setAttribute(node,'class','page');
  setAttribute(byId('page-search'),'class','page on');setAttribute(byId('pageLoader'),'class','page-loader hide');
  inner(byId('page-search'),core.overview(locale,registry));inner(byId('site-search-count'),registry.records.length+' / '+registry.records.length+' '+core.escape(core.text('count',locale)));
  setAttribute(nodes(document,n=>(attribute(n,'class')||'').split(' ').includes('site-search-reset'))[0],'disabled','');
  return serialize(document);
}
export async function buildSiteSearchPages({root,client,existingRoutes}) {
  const core=globalThis.DongDaSiteSearch,registry=await loadSiteSearch(root),source=await readFile(join(root,'index.html'),'utf8');
  const settings=JSON.parse(await readFile(join(root,'content/site-settings.json'),'utf8')),origin=globalThis.DongDaProductPage.origin(settings.seo.canonical),routes=[];
  for(const locale of core.languages){
    const path=core.path(locale),directory=join(client,path);await mkdir(directory,{recursive:true});
    await writeFile(join(directory,'index.html'),renderSiteSearchDocument(source,locale,origin,registry));routes.push({path,language:locale,indexable:false});
  }
  for(const route of [{path:'/',language:'en'},...existingRoutes]){
    const file=join(client,route.path,'index.html'),document=parse(await readFile(file,'utf8'));localizeSiteSearchLinks(document,route.language);await writeFile(file,serialize(document));
  }
  await writeFile(join(client,'content/site-search-routes.json'),JSON.stringify({version:core.version,origin,routes},null,2)+'\n');
  await writeFile(join(client,'content/site-search-index.json'),JSON.stringify({version:core.version,scope:core.types,records:registry.records},null,2)+'\n');
  const redirects=(await readFile(join(client,'_redirects'),'utf8')).replace('/* /404.html 404\n','');
  await writeFile(join(client,'_redirects'),redirects+routes.flatMap(route=>[`${route.path.slice(0,-1)} ${route.path} 301`,`${route.path}index.html ${route.path} 301`]).join('\n')+'\n/* /404.html 404\n');
  const manifest=JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8'));manifest.pages.push(...routes.map(route=>route.path.slice(1)+'index.html'));manifest.build_version=core.version;
  await writeFile(join(client,'site-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  process.stdout.write(`Public search: ${routes.length} routes, ${registry.records.length} public entities, noindex.\n`);
  return routes;
}
