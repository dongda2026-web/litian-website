import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as parse5 from 'parse5';
import {nodes,attribute} from './build-product-pages.mjs';
import '../assets/js/public-motion.js';
export function auditMotionDocument(document){
  const scripts=nodes(document,n=>n.tagName==='script'),external=scripts.filter(n=>attribute(n,'src'));
  if(external.filter(n=>attribute(n,'src').endsWith('assets/js/public-motion.js')).length!==1)throw new TypeError('Missing or duplicated public motion controller');
  const styles=nodes(document,n=>n.tagName==='link'&&attribute(n,'rel')==='stylesheet');
  if(styles.filter(n=>attribute(n,'href').endsWith('assets/css/public-motion.css')).length!==1)throw new TypeError('Missing or duplicated public motion CSS');
  const inline=scripts.filter(n=>!attribute(n,'src')).flatMap(n=>n.childNodes||[]).map(n=>n.value||'').join('\n');
  if(/new IntersectionObserver|applyParallax|setTimeout\(obs/.test(inline))throw new TypeError('Legacy competing motion controller');
  if(!inline.includes('DongDaPublicMotion.refresh()'))throw new TypeError('Missing motion route refresh');
  return true;
}
export async function auditPublicMotion(root=process.cwd()){
  const client=join(root,'dist/client'),manifest=JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8'));
  if(manifest.motion_version!==globalThis.DongDaPublicMotion.version)throw new TypeError('Wrong motion version');
  const routes=[];for(const type of ['product','industry','resource','insight','site-search','faq','selection','company'])routes.push(...JSON.parse(await readFile(join(client,'content/'+type+'-routes.json'),'utf8')).routes);
  const paths=['/',...routes.map(row=>row.path)];for(const path of paths)auditMotionDocument(parse5.parse(await readFile(join(client,path,'index.html'),'utf8')));
  return {ok:true,pages:paths.length,version:manifest.motion_version,scope:'Static motion ownership and dependency audit; actual media/visual behavior checked separately'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))try{process.stdout.write(JSON.stringify(await auditPublicMotion())+'\n');}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
