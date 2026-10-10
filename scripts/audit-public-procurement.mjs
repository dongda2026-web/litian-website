import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parse} from 'parse5';
import {nodes,attribute,plainText} from './build-product-pages.mjs';
import '../assets/js/public-procurement-core.js';

export function auditProcurementDocument(document,locale,catalog){
  const core=globalThis.DongDaPublicProcurement,copy=nodes(document,n=>attribute(n,'data-public-copy')!==undefined);
  assert.deepEqual(copy.map(n=>attribute(n,'data-public-copy')).sort(),core.workflowKeys.slice().sort());
  for(const node of copy){assert.equal(attribute(node,'data-i'),undefined);assert.equal(plainText(node),core.text(attribute(node,'data-public-copy'),locale));}
  const containers=['hnav-grid'].map(id=>nodes(document,n=>attribute(n,'id')===id)[0]);
  containers.forEach(container=>{
    assert.ok(container);const links=nodes(container,n=>attribute(n,'data-public-task')!==undefined);
    assert.equal(links.length,6);
    for(const link of links){assert.equal(link.tagName,'a');assert.equal(attribute(link,'href'),core.href(attribute(link,'data-public-task'),locale,catalog));assert.ok(plainText(link).trim());assert.doesNotMatch(plainText(link),/undefined|Бесплатно|Careers|Leadership|24 часа|24 hours|24小时/);}
  });
  assert.equal(nodes(document,n=>attribute(n,'id')==='ai-input')[0].attrs.find(a=>a.name==='maxlength')?.value,'2400');
  const actions=nodes(document,n=>attribute(n,'data-assistant-copy')!==undefined);assert.equal(actions.length,4);
  for(const action of actions)assert.equal(plainText(action),core.text(attribute(action,'data-assistant-copy'),locale));
  const send=nodes(document,n=>attribute(n,'data-assistant-label')!==undefined);assert.equal(send.length,1);assert.equal(attribute(send[0],'aria-label'),core.text('messageAction',locale));
  return {locale,copyFields:copy.length,nativeLinks:6};
}
export async function auditPublicProcurement(root=process.cwd()){
  const client=join(root,'dist/client'),manifest=JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8'));
  assert.equal(manifest.public_procurement_version,globalThis.DongDaPublicProcurement.version);
  const catalog=globalThis.DongDaCatalog.create(JSON.parse(await readFile(join(root,'content/products.json'),'utf8'))),checks=[];
  for(const file of manifest.pages){const document=parse(await readFile(join(client,file),'utf8'));checks.push(auditProcurementDocument(document,attribute(nodes(document,n=>n.tagName==='html')[0],'lang'),catalog));}
  process.stdout.write(`Public procurement audit: ${checks.length} documents; 6 native task links and 13 workflow fields each. No approval or backend claim.\n`);return checks;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await auditPublicProcurement();
