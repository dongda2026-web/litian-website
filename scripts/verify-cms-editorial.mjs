import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {editorialSchemaVersion as schemaVersion} from '../cms/content-contract.mjs';

// Prepared for a separately accepted private v3 migration; never run by static gates.
const root=path.resolve(import.meta.dirname,'..');
const identities=JSON.parse(await fs.readFile(path.join(root,'var/cms/local-identities.json'),'utf8'));
const checks=[];
async function call(user,route,method='GET',data) {
  const response=await fetch('http://127.0.0.1:4192/?rest_route=/dongda/v1/'+route,{
    method,redirect:'error',signal:AbortSignal.timeout(15000),
    headers:{...(user?{Authorization:'Basic '+Buffer.from(user+':'+identities.applicationPasswords[user]).toString('base64')}:{ }),...(data?{'Content-Type':'application/json'}:{})},
    ...(data?{body:JSON.stringify(data)}:{})
  });
  return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')};
}
async function expected(name,user,route,status,method,data) {
  const result=await call(user,route,method,data);assert.equal(result.status,status,name);checks.push({name,status,passed:true});return result;
}
await expected('Anonymous private export denied',null,'export',401);
await expected('Exporter cannot open editor','dd-cms-exporter','records',403);
const author=(await expected('Author reads fixed v3 registry','dd-cms-author','records',200)).body;
assert.equal(author.records.length,44);assert.equal(author.reviewer,false);
for (const [kind,count] of [['history',20],['insight',3],['resource',4],['resource-field',6]]) assert.equal(author.records.filter(record=>record.kind===kind).length,count);
const exported=await expected('Private full v3 export','dd-cms-exporter','export&scope=preview',200);
assert.equal(exported.body.schema,schemaVersion);assert.equal(exported.body.records.length,44);
assert.ok(exported.cache.split(',').map(value=>value.trim()).includes('no-store'));
for (const kind of ['insight','resource','resource-field']) {
  const record=author.records.find(row=>row.kind===kind), fields=Object.fromEntries(record.editable.map(key=>[key,key.split('.').reduce((item,part)=>item[part],record.data)]));
  const route=`records/${record.postId}`;
  await expected(kind+' author approval denied','dd-cms-author',route,403,'POST',{action:'publish',expectedRevision:record.revision,fields});
  await expected(kind+' protected field denied','dd-cms-reviewer',route,400,'POST',{action:'draft',expectedRevision:record.revision,fields:{...fields,updatedAt:'2026-10-09'}});
  await expected(kind+' stale save denied','dd-cms-reviewer',route,409,'POST',{action:'draft',expectedRevision:record.revision+20,fields});
  await expected(kind+' HTML denied','dd-cms-reviewer',route,400,'POST',{action:'draft',expectedRevision:record.revision,fields:{...fields,[record.editable[0]]:'<b>synthetic</b>'}});
  assert.deepEqual((await call('dd-cms-reviewer','records')).body.records.find(row=>row.postId===record.postId),record);
  checks.push({name:kind+' rejected writes preserve current record',passed:true});
}
const published=(await expected('Published export excludes drafts','dd-cms-exporter','export&scope=published',200)).body;
assert.ok(published.records.every(record=>record.status==='publish'));
const result={passed:true,environment:'loopback-synthetic-v3',scope:'Negative role/field/CAS subset only; positive migration/save/revision/build/rollback need separate acceptance',checks,records:44,productionWrites:false};
if (process.argv[2]) await fs.writeFile(path.resolve(process.argv[2]),JSON.stringify(result,null,2)+'\n');
process.stdout.write(JSON.stringify({passed:true,checks:checks.length,records:44})+'\n');
