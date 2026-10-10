import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, serialize } from 'parse5';
import { nodes, attribute, setAttribute, inner, applyDocumentSeo, localizeDocument } from './build-product-pages.mjs';
import '../assets/js/industry-core.js';
import '../assets/js/catalog-data.js';

export function renderIndustryDocument(source, entry, locale, origin, catalog, industries) {
  const core = globalThis.DongDaIndustry, document = parse(source);
  const info = core.metadata(entry, locale, origin, catalog);
  applyDocumentSeo(document, info, 'industry-seo', globalThis.DongDaProductPage.origin(origin) + core.path(entry,'en'));
  localizeDocument(document,locale);
  const byId = id => { const node = nodes(document, n => attribute(n,'id')===id)[0]; if (!node) throw new TypeError(`Missing industry hook: ${id}`); return node; };
  for (const node of nodes(document, n => (attribute(n,'class') || '').split(' ').includes('page'))) setAttribute(node,'class','page');
  setAttribute(byId(entry?'page-industry-detail':'page-industries'),'class','page on');
  setAttribute(byId('pageLoader'),'class','page-loader hide');
  inner(byId(entry?'page-industry-detail':'page-industries'),core.body(entry,locale,catalog,industries.entries));
  inner(byId('industry-entry-grid'),core.cards(industries.entries,locale,catalog));
  for (const node of nodes(document,n=>attribute(n,'data-industry-overview')!==undefined)) {
    setAttribute(node,'href',core.path(null,locale));inner(node,globalThis.DongDaProductPage.escape(core.text('back',locale)));
  }
  return serialize(document);
}

export async function buildIndustryPages({root,client,productRoutes}) {
  const core = globalThis.DongDaIndustry;
  const catalog = globalThis.DongDaCatalog.create(JSON.parse(await readFile(join(root,'content/products.json'),'utf8')));
  const industries = core.create(JSON.parse(await readFile(join(root,'content/industries.json'),'utf8')),catalog);
  const source = await readFile(join(root,'index.html'),'utf8');
  const settings = JSON.parse(await readFile(join(root,'content/site-settings.json'),'utf8'));
  const origin = globalThis.DongDaProductPage.origin(settings.seo.canonical), routes=[];
  for (const entry of [null,...industries.entries]) for (const locale of core.languages) {
    const path = core.path(entry,locale), directory = join(client,path);
    await mkdir(directory,{recursive:true});
    await writeFile(join(directory,'index.html'),renderIndustryDocument(source,entry,locale,origin,catalog,industries));
    routes.push({path,industryId:entry?.id || null,language:locale,indexable:false});
  }
  for (const route of [{path:'/',language:'en'},...productRoutes]) {
    const file=join(client,route.path,'index.html'),document=parse(await readFile(file,'utf8'));
    const entryGrid=nodes(document,n=>attribute(n,'id')==='industry-entry-grid')[0];
    inner(entryGrid,core.cards(industries.entries,route.language,catalog));
    for (const link of nodes(document,n=>attribute(n,'data-industry-overview')!==undefined)) {
      setAttribute(link,'href',core.path(null,route.language));inner(link,globalThis.DongDaProductPage.escape(core.text('back',route.language)));
    }
    await writeFile(file,serialize(document));
  }
  await writeFile(join(client,'content/industry-routes.json'),JSON.stringify({version:core.version,origin,routes},null,2)+'\n');
  const redirects=(await readFile(join(client,'_redirects'),'utf8')).replace('/* /404.html 404\n','');
  await writeFile(join(client,'_redirects'),redirects+routes.flatMap(route=>[`${route.path.slice(0,-1)} ${route.path} 301`,`${route.path}index.html ${route.path} 301`]).join('\n')+'\n/* /404.html 404\n');
  const manifest=JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8'));
  manifest.pages.push(...routes.map(route=>route.path.slice(1)+'index.html'));manifest.build_version=core.version;
  await writeFile(join(client,'site-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  process.stdout.write(`Industry pages: ${routes.length} localized routes; review-pending guidance is noindex and excluded from sitemap.\n`);
  return routes;
}
