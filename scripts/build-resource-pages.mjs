import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resourceDeliveryData } from './resource-delivery-data.mjs';
import { parse, serialize } from 'parse5';
import { nodes, attribute, setAttribute, inner, applyDocumentSeo, localizeDocument } from './build-product-pages.mjs';
import '../assets/js/resource-core.js';
import '../assets/js/catalog-data.js';

export function localizeResourceLinks(document,locale) {
  const core=globalThis.DongDaResources,copy=core.siteCopy(locale);
  for(const node of nodes(document,n=>attribute(n,'data-i') in copy)) inner(node,core.escape(copy[attribute(node,'data-i')]));
  for(const link of nodes(document,n=>attribute(n,'data-resource-library')!==undefined)) setAttribute(link,'href',core.path(null,locale));
}
export function renderResourceDocument(source,entry,locale,origin,catalog,registry,delivery) {
  const core=globalThis.DongDaResources,document=parse(source);
  const byId=id=>{const node=nodes(document,n=>attribute(n,'id')===id)[0];if(!node)throw new TypeError('Missing resource hook: '+id);return node;};
  applyDocumentSeo(document,core.metadata(entry,locale,origin,catalog),'resource-seo',globalThis.DongDaProductPage.origin(origin)+core.path(entry,'en'));
  localizeDocument(document,locale);localizeResourceLinks(document,locale);
  for(const node of nodes(document,n=>(attribute(n,'class')||'').split(' ').includes('page')))setAttribute(node,'class','page');
  setAttribute(byId(entry?'page-resource-detail':'page-resources'),'class','page on');setAttribute(byId('pageLoader'),'class','page-loader hide');
  inner(byId(entry?'page-resource-detail':'page-resources'),entry?core.detail(entry,locale,registry,catalog,delivery):core.overview(locale,registry,catalog,delivery));
  if(!entry)inner(byId('resource-count'),registry.entries.length+' / '+registry.entries.length+' '+core.escape(core.text('count',locale)));
  return serialize(document);
}
export async function buildResourcePages({root,client,existingRoutes}) {
  const core=globalThis.DongDaResources,catalog=globalThis.DongDaCatalog.create(JSON.parse(await readFile(join(root,'content/products.json'),'utf8')));
  const registry=core.create(JSON.parse(await readFile(join(root,'content/resources.json'),'utf8')),catalog);
  const source=await readFile(join(root,'index.html'),'utf8'),settings=JSON.parse(await readFile(join(root,'content/site-settings.json'),'utf8'));
  const origin=globalThis.DongDaProductPage.origin(settings.seo.canonical),routes=[];
  const fileData=resourceDeliveryData(registry),delivery=globalThis.DongDaResourceDelivery.create(fileData,registry);
  for(const entry of [null,...registry.entries])for(const locale of core.languages){
    const path=core.path(entry,locale),directory=join(client,path);await mkdir(directory,{recursive:true});
    await writeFile(join(directory,'index.html'),renderResourceDocument(source,entry,locale,origin,catalog,registry,delivery));
    routes.push({path,resourceId:entry?.id||null,language:locale,indexable:false});
    if(entry){const file=delivery.resolve(entry.id,locale),bytes=Buffer.from(core.downloadText(entry,locale,registry),'utf8');await mkdir(join(client,'assets/documents'),{recursive:true});await writeFile(join(client,file.path),bytes);await writeFile(join(client,file.legacyPath),bytes);}
  }
  for(const route of [{path:'/',language:'en'},...existingRoutes]){
    const file=join(client,route.path,'index.html'),document=parse(await readFile(file,'utf8'));localizeResourceLinks(document,route.language);await writeFile(file,serialize(document));
  }
  await writeFile(join(client,'content/resource-routes.json'),JSON.stringify({version:core.version,origin,routes},null,2)+'\n');
  await writeFile(join(client,'content/resource-files.json'),JSON.stringify(fileData,null,2)+'\n');
  const headers=await readFile(join(client,'_headers'),'utf8');
  await writeFile(join(client,'_headers'),headers+'\n'+fileData.files.map(file=>file.legacyPath+'\n  Cache-Control: no-store\n').join('\n'));
  const redirects=(await readFile(join(client,'_redirects'),'utf8')).replace('/* /404.html 404\n','');
  await writeFile(join(client,'_redirects'),redirects+routes.flatMap(route=>[`${route.path.slice(0,-1)} ${route.path} 301`,`${route.path}index.html ${route.path} 301`]).join('\n')+'\n/* /404.html 404\n');
  const manifest=JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8'));manifest.pages.push(...routes.map(route=>route.path.slice(1)+'index.html'));manifest.build_version=core.version;manifest.resource_delivery_version=delivery.version;
  await writeFile(join(client,'site-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  process.stdout.write(`Resources: ${routes.length} trilingual routes; ${fileData.files.length} content-addressed TXT checklists plus legacy aliases. Pending-review pages remain noindex.\n`);
  return routes;
}
