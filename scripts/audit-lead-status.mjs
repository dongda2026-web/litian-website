import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as parse5 from 'parse5';
import {nodes,attribute} from './build-product-pages.mjs';
import '../assets/js/lead-status-ui.js';
export function auditLeadStatusDocument(document){
  const scripts=nodes(document,n=>n.tagName==='script'&&attribute(n,'src')).map(n=>attribute(n,'src'));
  const at=name=>scripts.findIndex(path=>path.endsWith('assets/js/'+name+'.js'));
  if(scripts.filter(path=>path.endsWith('assets/js/lead-status-ui.js')).length!==1)throw new TypeError('Missing or duplicated lead status adapter');
  for(const name of ['procurement-copy','rfq-list-copy','sample-request-copy','customization-copy','public-procurement-core'])if(at(name)<0||at(name)>=at('lead-status-ui'))throw new TypeError('Missing status translation dependency');
  if(at('lead-status-ui')>=at('rfq-list-ui'))throw new TypeError('Incorrect lead status dependency order');
  for(const id of globalThis.DongDaLeadStatus.ids){const matches=nodes(document,n=>attribute(n,'id')===id);if(matches.length!==1||attribute(matches[0],'role')!=='status'||attribute(matches[0],'aria-live')!=='polite')throw new TypeError('Missing accessible status region');}
  return true;
}
export async function auditLeadStatus(root=process.cwd()){
  const client=join(root,'dist/client'),manifest=JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8'));
  if(manifest.lead_status_version!==globalThis.DongDaLeadStatus.version)throw new TypeError('Wrong lead status version');
  const routes=[];for(const type of ['product','industry','resource','insight','site-search','faq','selection','company'])routes.push(...JSON.parse(await readFile(join(client,'content/'+type+'-routes.json'),'utf8')).routes);
  const paths=['/',...routes.map(row=>row.path)];for(const path of paths)auditLeadStatusDocument(parse5.parse(await readFile(join(client,path,'index.html'),'utf8')));
  return {ok:true,pages:paths.length,version:manifest.lead_status_version,scope:'static dependencies and accessible regions; actual state behavior checked separately'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))try{process.stdout.write(JSON.stringify(await auditLeadStatus())+'\n');}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
