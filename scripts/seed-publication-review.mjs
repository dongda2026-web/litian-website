import {mkdir,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {publicationSnapshot,reviewPath,reviewVersion} from './publication-review-core.mjs';
if(process.argv.length!==2)throw new TypeError('Seed has no approval or overwrite option');
const path=join(process.cwd(),reviewPath),snapshot=await publicationSnapshot(process.cwd());
await mkdir(dirname(path),{recursive:true,mode:0o700});
await writeFile(path,JSON.stringify({schemaVersion:reviewVersion,claims:snapshot.map(row=>({...row,status:'pending',owner:null,reviewer:null,reviewedAt:null,validUntil:null,evidence:[]}))},null,2)+'\n',{flag:'wx',mode:0o600});
process.stdout.write(`Seeded ${snapshot.length} pending groups; no approvals inferred.\n`);
