import { readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse,serialize } from 'parse5';
import { nodes,attribute,setAttribute,inner } from './build-product-pages.mjs';
import '../assets/js/accessibility-core.js';
import '../assets/js/catalog-data.js';
import '../assets/js/resource-core.js';
import '../assets/js/site-search-core.js';
export function localizeAccessibility(document,locale,path='/'){
  const core=globalThis.DongDaAccessibility;
  for(const node of nodes(document,n=>attribute(n,'data-a11y-label')!==undefined)){
    const label=core.text(attribute(node,'data-a11y-label'),locale);setAttribute(node,'aria-label',label);
    if(['button','a'].includes(node.tagName))setAttribute(node,'title',label);
  }
  for(const node of nodes(document,n=>attribute(n,'data-a11y-text')!==undefined))inner(node,globalThis.DongDaSiteSearch.escape(core.text(attribute(node,'data-a11y-text'),locale)));
  for(const node of nodes(document,n=>attribute(n,'data-a11y-icon')!==undefined))inner(node,globalThis.DongDaSiteSearch.icon(attribute(node,'data-a11y-icon')));
  for(const node of nodes(document,n=>attribute(n,'id')==='skip-main'))setAttribute(node,'href',path+'#main-content');
  for(const node of nodes(document,n=>/^lb\(/.test(attribute(n,'onclick')||''))){setAttribute(node,'role','button');setAttribute(node,'tabindex','0');setAttribute(node,'aria-haspopup','dialog');setAttribute(node,'data-media-trigger','');}
  return document;
}
export async function buildPublicAccessibility({client,routes}){
  const all=[{path:'/',language:'en'},...routes];
  for(const route of all){const file=join(client,route.path,'index.html');await writeFile(file,serialize(localizeAccessibility(parse(await readFile(file,'utf8')),route.language,route.path)));}
  const manifest=JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8'));manifest.build_version=globalThis.DongDaAccessibility.version;manifest.accessibility_version=globalThis.DongDaAccessibility.version;manifest.accessibility_scope='public-dialog-keyboard-local';
  manifest.navigation_version=globalThis.DongDaAccessibility.navigationVersion;
  await writeFile(join(client,'site-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  process.stdout.write(`Public dialog labels and native controls: ${all.length} pages.\n`);
}
