import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {parse,serialize} from 'parse5';
import {nodes,attribute,inner,setAttribute} from './build-product-pages.mjs';
import '../assets/js/storage-notice-core.js';

export function localizeStorageNotice(document,locale){
  const core=globalThis.DongDaStorageNotice;
  for(const node of nodes(document,n=>attribute(n,'data-storage-copy')!==undefined)){
    if(attribute(node,'data-i')!==undefined||attribute(node,'data-a11y-text')!==undefined)throw new TypeError('Competing storage translation owner');
    inner(node,globalThis.DongDaProductPage.escape(core.text(attribute(node,'data-storage-copy'),locale)));
  }
  for(const node of nodes(document,n=>attribute(n,'data-storage-label')!==undefined)){
    const label=core.text(attribute(node,'data-storage-label'),locale);setAttribute(node,'aria-label',label);if(node.tagName==='button')setAttribute(node,'title',label);
  }
}
export async function buildStorageNotice({client,routes}){
  for(const route of [{path:'/',language:'en'},...routes]){
    const file=join(client,route.path,'index.html'),document=parse(await readFile(file,'utf8'));
    localizeStorageNotice(document,route.language);await writeFile(file,serialize(document));
  }
  const manifest=JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8'));
  manifest.storage_notice_version=globalThis.DongDaStorageNotice.version;
  await writeFile(join(client,'site-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  process.stdout.write(`Storage notice: ${routes.length+1} static documents; version acknowledgement, not analytics consent.\n`);
}
