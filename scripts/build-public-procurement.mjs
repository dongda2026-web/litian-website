import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {parse,serialize} from 'parse5';
import {nodes,attribute,inner,setAttribute} from './build-product-pages.mjs';
import {companyLegacy} from './company-legacy.mjs';
import '../assets/js/public-procurement-core.js';

export function localizePublicProcurement(document,locale,catalog,legacy){
  const core=globalThis.DongDaPublicProcurement;
  for(const node of nodes(document,n=>attribute(n,'data-public-copy')!==undefined)){
    if(attribute(node,'data-i')!==undefined)throw new TypeError('Competing procurement translation owner');
    inner(node,globalThis.DongDaProductPage.escape(core.text(attribute(node,'data-public-copy'),locale)));
  }
  for(const node of nodes(document,n=>attribute(n,'data-assistant-copy')!==undefined))inner(node,globalThis.DongDaProductPage.escape(core.text(attribute(node,'data-assistant-copy'),locale)));
  for(const node of nodes(document,n=>attribute(n,'data-assistant-label')!==undefined)){
    const label=core.text(attribute(node,'data-assistant-label'),locale);setAttribute(node,'aria-label',label);setAttribute(node,'title',label);
  }
  const home=nodes(document,n=>attribute(n,'id')==='hnav-grid')[0];
  if(!home)throw new TypeError('Missing home navigation');inner(home,core.home(legacy.HNAV,locale,catalog));
}
export async function buildPublicProcurement({root,client,routes}){
  const legacy=companyLegacy(await readFile(join(root,'index.html'),'utf8'));
  const catalog=globalThis.DongDaCatalog.create(JSON.parse(await readFile(join(root,'content/products.json'),'utf8')));
  for(const route of [{path:'/',language:'en'},...routes]){
    const file=join(client,route.path,'index.html'),document=parse(await readFile(file,'utf8'));
    localizePublicProcurement(document,route.language,catalog,legacy);await writeFile(file,serialize(document));
  }
  const manifest=JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8'));
  manifest.public_procurement_version=globalThis.DongDaPublicProcurement.version;
  await writeFile(join(client,'site-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  process.stdout.write(`Public procurement: ${routes.length+1} documents; shared workflow and native task links.\n`);
}
