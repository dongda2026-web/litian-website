import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, serialize } from 'parse5';
import { nodes, attribute, setAttribute, inner, applyDocumentSeo, localizeDocument } from './build-product-pages.mjs';
import { localizeResourceLinks } from './build-resource-pages.mjs';
import '../assets/js/insight-core.js';

export function localizeInsightLinks(document,locale) {
  const core=globalThis.DongDaInsights,copy=core.siteCopy(locale);
  for(const node of nodes(document,n=>attribute(n,'data-i') in copy)) inner(node,core.escape(copy[attribute(node,'data-i')]));
  for(const link of nodes(document,n=>attribute(n,'data-insight-overview')!==undefined)) setAttribute(link,'href',core.path(null,locale));
}
export function renderInsightDocument(source,entry,locale,origin,catalog,registry) {
  const core=globalThis.DongDaInsights,document=parse(source);
  const byId=id=>{const node=nodes(document,n=>attribute(n,'id')===id)[0];if(!node)throw new TypeError('Missing insight hook: '+id);return node;};
  applyDocumentSeo(document,core.metadata(entry,locale,origin,catalog),'insight-seo',globalThis.DongDaProductPage.origin(origin)+core.path(entry,'en'));
  localizeDocument(document,locale);localizeResourceLinks(document,locale);localizeInsightLinks(document,locale);
  for(const node of nodes(document,n=>(attribute(n,'class')||'').split(' ').includes('page')))setAttribute(node,'class','page');
  setAttribute(byId(entry?'page-insight-detail':'page-news'),'class','page on');setAttribute(byId('pageLoader'),'class','page-loader hide');
  inner(byId(entry?'page-insight-detail':'page-news'),entry?core.detail(entry,locale,catalog):core.overview(locale,registry,catalog));
  if(!entry)inner(byId('insight-count'),registry.entries.length+' / '+registry.entries.length+' '+core.escape(core.text('count',locale)));
  return serialize(document);
}
export async function buildInsightPages({root,client,existingRoutes}) {
  const core=globalThis.DongDaInsights,catalog=globalThis.DongDaCatalog.create(JSON.parse(await readFile(join(root,'content/products.json'),'utf8')));
  const registry=core.create(JSON.parse(await readFile(join(root,'content/insights.json'),'utf8')),catalog);
  const source=await readFile(join(root,'index.html'),'utf8'),settings=JSON.parse(await readFile(join(root,'content/site-settings.json'),'utf8'));
  const origin=globalThis.DongDaProductPage.origin(settings.seo.canonical),routes=[];
  for(const entry of [null,...registry.entries])for(const locale of core.languages){
    const path=core.path(entry,locale),directory=join(client,path);await mkdir(directory,{recursive:true});
    await writeFile(join(directory,'index.html'),renderInsightDocument(source,entry,locale,origin,catalog,registry));
    routes.push({path,insightId:entry?.id||null,language:locale,indexable:false});
  }
  for(const route of [{path:'/',language:'en'},...existingRoutes]){
    const file=join(client,route.path,'index.html'),document=parse(await readFile(file,'utf8'));localizeInsightLinks(document,route.language);await writeFile(file,serialize(document));
  }
  await writeFile(join(client,'content/insight-routes.json'),JSON.stringify({version:core.version,origin,routes},null,2)+'\n');
  const redirects=(await readFile(join(client,'_redirects'),'utf8')).replace('/* /404.html 404\n','');
  await writeFile(join(client,'_redirects'),redirects+routes.flatMap(route=>[`${route.path.slice(0,-1)} ${route.path} 301`,`${route.path}index.html ${route.path} 301`]).join('\n')+'\n/* /404.html 404\n');
  const manifest=JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8'));manifest.pages.push(...routes.map(route=>route.path.slice(1)+'index.html'));manifest.build_version=core.version;
  await writeFile(join(client,'site-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  process.stdout.write(`Insights: ${routes.length} trilingual routes; ${registry.entries.length} complete buyer guides, noindex. Legacy news excluded.\n`);
  return routes;
}
