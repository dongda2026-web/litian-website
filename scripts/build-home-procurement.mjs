import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {parse,serialize} from 'parse5';
import {nodes,attribute,setAttribute,inner} from './build-product-pages.mjs';
import '../assets/js/home-procurement-core.js';

export function localizeHomeProcurement(document,locale,catalog){
  const core=globalThis.DongDaHomeProcurement;
  for(const node of nodes(document,n=>attribute(n,'data-home-copy')!==undefined)){
    if(attribute(node,'data-i')!==undefined)throw new TypeError('Competing homepage translation owner');
    inner(node,globalThis.DongDaProductPage.escape(core.text(attribute(node,'data-home-copy'),locale)));
  }
  for(const node of nodes(document,n=>attribute(n,'data-home-link')!==undefined)){
    const key=attribute(node,'data-home-link');if(!Object.hasOwn(core.links(locale),key))throw new TypeError('Unknown procurement link');
    setAttribute(node,'href',core.links(locale)[key]);
  }
  const home=nodes(document,n=>attribute(n,'id')==='page-home')[0];
  const grid=home&&nodes(home,n=>(attribute(n,'class')||'').split(' ').includes('series-grid'))[0];
  if(!grid)throw new TypeError('Missing homepage series hook');
  inner(grid,core.cards(catalog,locale));
  setAttribute(nodes(home,n=>(attribute(n,'class')||'').split(' ').includes('home-procurement-path'))[0],'aria-label',core.text('pathLabel',locale));
}
export async function buildHomeProcurement({root,client,routes}){
  const core=globalThis.DongDaHomeProcurement,catalog=globalThis.DongDaCatalog.create(JSON.parse(await readFile(join(root,'content/products.json'),'utf8')));
  for(const route of [{path:'/',language:'en'},...routes]){
    const file=join(client,route.path,'index.html'),document=parse(await readFile(file,'utf8'));
    localizeHomeProcurement(document,route.language,catalog);await writeFile(file,serialize(document));
  }
  const manifest=JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8'));manifest.home_procurement_version=core.version;
  await writeFile(join(client,'site-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  process.stdout.write(`Homepage procurement: ${routes.length+1} documents; shared catalog cards; neutral public copy.\n`);
}
