import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parse} from 'parse5';
import {nodes,attribute} from './build-product-pages.mjs';
import '../assets/js/accessibility-core.js';

export function auditNavigationDocument(document,locale){
  const core=globalThis.DongDaAccessibility,buttons=nodes(document,n=>attribute(n,'id')==='backToTop');assert.equal(buttons.length,1);
  const button=buttons[0];assert.equal(button.tagName,'button');assert.equal(attribute(button,'type'),'button');assert.equal(attribute(button,'onclick'),'DongDaPublicAccessibility.backToTop()');assert.equal(attribute(button,'data-a11y-label'),'backToTop');
  assert.equal(attribute(button,'aria-label'),core.text('backToTop',locale));assert.equal(attribute(button,'title'),core.text('backToTop',locale));assert.equal(attribute(button,'data-a11y-icon'),'ArrowUp');assert.equal(nodes(button,n=>n.tagName==='svg').length,1);
  assert.equal(nodes(document,n=>n.tagName==='dialog').length,6);return{locale,backToTop:1,dialogs:6};
}
export async function auditPublicNavigation(root=process.cwd()){
  const client=join(root,'dist/client'),manifest=JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8'));assert.equal(manifest.navigation_version,globalThis.DongDaAccessibility.navigationVersion);
  const checks=[];for(const path of manifest.pages){const document=parse(await readFile(join(client,path),'utf8'));checks.push(auditNavigationDocument(document,attribute(nodes(document,n=>n.tagName==='html')[0],'lang')));}
  const css=await readFile(join(client,'assets/css/public-accessibility.css'),'utf8');assert.match(css,/\.ai-widget\{[^}]*pointer-events:none/);assert.match(css,/\.ai-widget :is\(\.ai-fab,\.ai-panel\)\{pointer-events:auto/);assert.match(css,/\.back-to-top\{[^}]*var\(--dd-consent-height,0px\)/);
  process.stdout.write(`Public navigation audit: ${checks.length} static documents; actual pointer/scroll acceptance is separate.\n`);return checks;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await auditPublicNavigation();
