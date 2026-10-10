import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as parse5 from 'parse5';
import {nodes,attribute} from './build-product-pages.mjs';
import '../assets/js/form-feedback-core.js';
export function auditFormFeedbackDocument(document){
  const scripts=nodes(document,n=>n.tagName==='script'&&attribute(n,'src')).map(n=>attribute(n,'src'));
  const assets=['assets/js/form-feedback-core.js','assets/js/form-feedback-ui.js'];
  for(const asset of assets)if(scripts.filter(path=>path.endsWith(asset)).length!==1)throw new TypeError('Missing or duplicated feedback script');
  if(scripts.findIndex(path=>path.endsWith(assets[0]))>=scripts.findIndex(path=>path.endsWith(assets[1]))||scripts.findIndex(path=>path.endsWith(assets[1]))>=scripts.findIndex(path=>path.endsWith('assets/js/rfq-list-ui.js')))throw new TypeError('Incorrect feedback dependency order');
  if(nodes(document,n=>n.tagName==='link'&&attribute(n,'href')?.endsWith('assets/css/form-feedback.css')).length!==1)throw new TypeError('Missing feedback stylesheet');
  for(const id of ['iform','q-spec-fields','rfq-list-form','sample-form'])if(nodes(document,n=>attribute(n,'id')===id).length!==1)throw new TypeError('Missing procurement surface');
  if(nodes(document,n=>n.tagName==='dialog').length!==6)throw new TypeError('Dialog inventory changed');
  return true;
}
export async function auditFormFeedback(root=process.cwd()){
  const client=join(root,'dist/client'),manifest=JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8'));
  if(manifest.form_feedback_version!==globalThis.DongDaFormFeedbackCore.version)throw new TypeError('Wrong feedback version');
  const routes=[];for(const type of ['product','industry','resource','insight','site-search','faq','selection','company'])routes.push(...JSON.parse(await readFile(join(client,'content/'+type+'-routes.json'),'utf8')).routes);
  const paths=['/',...routes.map(row=>row.path)];for(const path of paths)auditFormFeedbackDocument(parse5.parse(await readFile(join(client,path,'index.html'),'utf8')));
  return {ok:true,pages:paths.length,version:manifest.form_feedback_version,scope:'static dependency/field surfaces only; real field behavior separately accepted'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))try{process.stdout.write(JSON.stringify(await auditFormFeedback())+'\n');}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
