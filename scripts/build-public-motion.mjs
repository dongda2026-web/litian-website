import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import '../assets/js/public-motion.js';
export async function buildPublicMotion({client}){
  const path=join(client,'site-manifest.json'),manifest=JSON.parse(await readFile(path,'utf8'));
  manifest.motion_version=globalThis.DongDaPublicMotion.version;
  await writeFile(path,JSON.stringify(manifest,null,2)+'\n');
}
