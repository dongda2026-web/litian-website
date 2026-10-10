import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'parse5';
import { nodes,attribute } from './build-product-pages.mjs';
import '../assets/js/accessibility-core.js';
const client=join(process.cwd(),'dist/client'),manifest=JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8')),core=globalThis.DongDaAccessibility;
assert.equal(manifest.accessibility_version||manifest.build_version,core.version);
for(const page of manifest.pages){
  const document=parse(await readFile(join(client,page),'utf8')),id=value=>{const matches=nodes(document,n=>attribute(n,'id')===value);assert.equal(matches.length,1,page+': '+value);return matches[0];};
  if(page==='404.html')continue;
  const path=page==='index.html'?'/':'/'+page.replace(/index.html$/,''),locale=path.split('/')[1]||'en';
  assert.equal(attribute(id('skip-main'),'href'),path+'#main-content');assert.equal(attribute(id('main-content'),'tabindex'),'-1');
  assert.equal(nodes(document,n=>n.tagName==='main').length,1);
  for(const dialogId of Object.keys(core.dialogs)){const dialog=id(dialogId);assert.equal(dialog.tagName,'dialog');assert.equal(attribute(dialog,'open'),undefined);assert.ok(attribute(dialog,'aria-label')||attribute(dialog,'aria-labelledby'));assert.ok(nodes(dialog,n=>attribute(n,'data-dialog-focus')!==undefined).length);}
  assert.equal(attribute(id('nav-hamburger'),'aria-label'),core.text('openMenu',locale));assert.equal(attribute(id('nav-hamburger'),'aria-expanded'),'false');
  assert.equal(attribute(id('nav-lang-btn'),'aria-controls'),'nl-menu');assert.equal(attribute(id('nl-menu'),'hidden'),'');assert.equal(attribute(id('nl-menu'),'inert'),'');
  assert.equal(attribute(id('ai-panel'),'role'),'region');assert.equal(attribute(id('ai-panel'),'hidden'),'');
  for(const button of nodes(document,n=>attribute(n,'data-a11y-icon')!==undefined)){assert.ok(attribute(button,'aria-label'));assert.ok(nodes(button,n=>n.tagName==='svg').length);}
}
assert.match(await readFile(join(client,'assets/css/public-accessibility.css'),'utf8'),/prefers-reduced-motion/);
process.stdout.write(`Static accessibility structure: ${manifest.pages.filter(path=>path!=='404.html').length} pages; native focus behavior requires browser acceptance.\n`);
