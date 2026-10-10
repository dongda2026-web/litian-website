import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parse} from 'parse5';
import {nodes,attribute,plainText} from './build-product-pages.mjs';
import '../assets/js/storage-notice-core.js';

export function auditStorageDocument(document,locale){
  const core=globalThis.DongDaStorageNotice,copy=nodes(document,n=>attribute(n,'data-storage-copy')!==undefined);
  assert.deepEqual(copy.map(n=>attribute(n,'data-storage-copy')).sort(),core.copyKeys.filter(key=>!['noticeLabel','dismiss'].includes(key)).sort());
  for(const node of copy){assert.equal(attribute(node,'data-i'),undefined);assert.equal(attribute(node,'data-a11y-text'),undefined);assert.equal(plainText(node),core.text(attribute(node,'data-storage-copy'),locale));}
  const notice=nodes(document,n=>attribute(n,'id')==='gdpr');assert.equal(notice.length,1);assert.equal(attribute(notice[0],'role'),'region');assert.equal(attribute(notice[0],'hidden'),'');assert.equal(attribute(notice[0],'aria-label'),core.text('noticeLabel',locale));
  const close=nodes(notice[0],n=>attribute(n,'data-storage-label')==='dismiss');assert.equal(close.length,1);assert.equal(close[0].tagName,'button');assert.equal(attribute(close[0],'aria-label'),core.text('dismiss',locale));assert.equal(attribute(close[0],'onclick'),'DongDaPublicStorage.dismiss()');
  assert.equal(nodes(notice[0],n=>attribute(n,'onclick')==='openPrivacyModal()').length,1);
  const policy=nodes(document,n=>attribute(n,'id')==='privacyModal');assert.equal(policy.length,1);assert.equal(policy[0].tagName,'dialog');assert.equal(attribute(policy[0],'aria-labelledby'),'privacy-title');
  assert.doesNotMatch(plainText(policy[0]),/privacy@dongdaltd\.com|By using this site, you consent|Your data is never sold/);
  for(const file of ['storage-notice-core.js','storage-notice-ui.js'])assert.equal(nodes(document,n=>n.tagName==='script'&&('/'+attribute(n,'src')).endsWith('/assets/js/'+file)).length,1);
  return{locale,copyFields:copy.length,notice:1,policyDraft:true};
}
export async function auditStorageNotice(root=process.cwd()){
  const client=join(root,'dist/client'),manifest=JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8'));
  assert.equal(manifest.storage_notice_version,globalThis.DongDaStorageNotice.version);
  const checks=[];for(const file of manifest.pages){const document=parse(await readFile(join(client,file),'utf8'));checks.push(auditStorageDocument(document,attribute(nodes(document,n=>n.tagName==='html')[0],'lang')));}
  process.stdout.write(`Storage notice audit: ${checks.length} documents; one native privacy dialog, draft retained, no blanket consent.\n`);return checks;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await auditStorageNotice();
