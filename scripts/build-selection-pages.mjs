import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {parse,serialize} from 'parse5';
import {nodes,attribute,setAttribute,inner,applyDocumentSeo,localizeDocument} from './build-product-pages.mjs';
import {localizeResourceLinks} from './build-resource-pages.mjs';
import {localizeInsightLinks} from './build-insight-pages.mjs';
import {localizeSiteSearchLinks} from './build-site-search-pages.mjs';
import {localizeFaqLinks} from './build-faq-pages.mjs';
import {localizeAccessibility} from './build-public-accessibility.mjs';
import '../assets/js/customization-core.js';
import '../assets/js/catalog-data.js';
import '../assets/js/selection-core.js';
import '../assets/js/selection-view.js';

export function localizeSelectionLinks(document,language){
  const core=globalThis.DongDaSelection,view=globalThis.DongDaSelectionView;
  for(const link of nodes(document,n=>attribute(n,'data-selection-link')!==undefined)){
    setAttribute(link,'href',core.path(language));inner(link,globalThis.DongDaProductPage.escape(core.text('entry',language))+view.icon('SlidersHorizontal'));
  }
}
export function renderSelectionDocument(source,language,origin,catalog){
  const core=globalThis.DongDaSelection,view=globalThis.DongDaSelectionView,product=globalThis.DongDaProductPage,document=parse(source);
  core.create(catalog);
  applyDocumentSeo(document,core.metadata(language,origin),'selection-seo',origin+core.path('en'));
  const schema=nodes(document,n=>attribute(n,'id')==='selection-seo')[0];schema.parentNode.childNodes=schema.parentNode.childNodes.filter(n=>n!==schema);
  localizeDocument(document,language);localizeResourceLinks(document,language);localizeInsightLinks(document,language);localizeSiteSearchLinks(document,language);localizeFaqLinks(document,language);localizeSelectionLinks(document,language);
  for(const node of nodes(document,n=>(attribute(n,'class')||'').split(' ').includes('page')))setAttribute(node,'class','page');
  setAttribute(nodes(document,n=>attribute(n,'id')==='pageLoader')[0],'class','page-loader hide');
  const active=nodes(document,n=>attribute(n,'id')==='page-selection')[0];setAttribute(active,'class','page on');
  const fallback='<noscript><p>'+product.escape(core.text('fallback',language))+'</p><ul>'+catalog.all.filter(p=>p.kind==='product'&&p.homepage).map(p=>'<li><a href="'+product.path(p,language)+'">'+product.escape(p.name[language])+'</a></li>').join('')+'</ul><style>#selection-form,.selection-steps{display:none}</style></noscript>';
  inner(active,view.shell(language,view.form(language,core.defaults,1,1,[])+fallback));
  localizeAccessibility(document,language,core.path(language));return serialize(document);
}
export async function buildSelectionPages({root,client,existingRoutes}){
  const core=globalThis.DongDaSelection,source=await readFile(join(root,'index.html'),'utf8'),catalog=globalThis.DongDaCatalog.create(JSON.parse(await readFile(join(root,'content/products.json'),'utf8')));
  const settings=JSON.parse(await readFile(join(root,'content/site-settings.json'),'utf8')),origin=globalThis.DongDaProductPage.origin(settings.seo.canonical),routes=[];
  for(const language of ['en','zh','ru']){const path=core.path(language);await mkdir(join(client,path),{recursive:true});await writeFile(join(client,path,'index.html'),renderSelectionDocument(source,language,origin,catalog));routes.push({path,language,indexable:false});}
  for(const route of [{path:'/',language:'en'},...existingRoutes]){const file=join(client,route.path,'index.html'),document=parse(await readFile(file,'utf8'));localizeSelectionLinks(document,route.language);await writeFile(file,serialize(document));}
  await writeFile(join(client,'content/selection-routes.json'),JSON.stringify({version:core.version,origin,routes},null,2)+'\n');
  const redirects=(await readFile(join(client,'_redirects'),'utf8')).replace('/* /404.html 404\n','');
  await writeFile(join(client,'_redirects'),redirects+routes.flatMap(route=>[`${route.path.slice(0,-1)} ${route.path} 301`,`${route.path}index.html ${route.path} 301`]).join('\n')+'\n/* /404.html 404\n');
  const manifest=JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8'));manifest.pages.push(...routes.map(route=>route.path.slice(1)+'index.html'));manifest.selection_version=core.version;
  await writeFile(join(client,'site-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  process.stdout.write(`Guided selection: ${routes.length} noindex routes, existing quote/RFQ handoff.\n`);return routes;
}
