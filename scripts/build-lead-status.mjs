import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import '../assets/js/lead-status-ui.js';
export async function buildLeadStatus({client}){
  const path=join(client,'site-manifest.json'),manifest=JSON.parse(await readFile(path,'utf8'));
  manifest.lead_status_version=globalThis.DongDaLeadStatus.version;
  await writeFile(path,JSON.stringify(manifest,null,2)+'\n');
}
