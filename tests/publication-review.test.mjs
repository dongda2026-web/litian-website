import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {parse} from 'acorn';
import * as parse5 from 'parse5';
import {canonical,digest,literal,staticDeclarations,claimIds,reviewVersion,reviewPath,publicationSnapshot,validateReview,assessPublication,requirePublication} from '../scripts/publication-review-core.mjs';
import {localizeServiceBadge} from '../scripts/build-publication-review.mjs';
import {releaseBuildScript} from '../cms/build-mode.mjs';
import {nodes,attribute,plainText} from '../scripts/build-product-pages.mjs';
import '../assets/js/public-review-copy.js';

const root=path.resolve(import.meta.dirname,'..'),today='2026-10-08',hash=bytes=>createHash('sha256').update(bytes).digest('hex'),copy=value=>JSON.parse(JSON.stringify(value));
const snapshot=claimIds.map(id=>({id,contentSha256:hash(id)}));
const pending=()=>({schemaVersion:reviewVersion,claims:snapshot.map(row=>({...row,status:'pending',owner:null,reviewer:null,reviewedAt:null,validUntil:null,evidence:[]}))});
const approved=()=>{const value=pending();for(const row of value.claims)Object.assign(row,{status:'approved',owner:'synthetic-owner',reviewer:'synthetic-reviewer',reviewedAt:today,validUntil:'2027-10-08',evidence:[{file:'evidence/source.txt',sha256:hash('synthetic source'),kind:'source'},{file:'evidence/permission.txt',sha256:hash('synthetic permission'),kind:'publication-permission'}]});return value;};
const assess=value=>validateReview(value,snapshot,{today});
const expression=code=>parse('('+code+')',{ecmaVersion:2022}).body[0].expression;

test('Publication extraction decodes literals without evaluating JavaScript',()=>{
  assert.deepEqual(JSON.parse(JSON.stringify(literal(expression('{a:[1,true,null,"plain"],b:`text`}')))),{a:[1,true,null,'plain'],b:'text'});
  globalThis.publicationExecuted=false;
  for(const source of ['(()=>{globalThis.publicationExecuted=true;return 1})()','{["a"]:1}','{a}','{get a(){return 1}}','{a:1,a:2}','{__proto__:1}','{...{a:1}}','[1,,3]','/test/','1n','`x${1}`'])assert.throws(()=>literal(expression(source)));
  assert.equal(globalThis.publicationExecuted,false);delete globalThis.publicationExecuted;
  assert.throws(()=>staticDeclarations('const T=fetch("https://invalid.test");'),/never executes/);
  assert.equal(staticDeclarations('const other=fetch("https://invalid.test"); const T={zh:{label:"text"}};').data.T.zh.label,'text');
});
test('Publication canonicalization is stable and rejects undefined data',()=>{
  assert.equal(digest({b:2,a:1}),digest({a:1,b:2}));assert.notEqual(digest([1,2]),digest([2,1]));
  assert.throws(()=>canonical({a:undefined}),/Undefined/);assert.throws(()=>canonical([undefined]),/Undefined/);
});
test('Publication pending records deny production without inventing approval',()=>{
  const result=assess(pending());assert.equal(result.publishable,false);assert.equal(result.problems.length,12);assert.throws(()=>requirePublication(result),{code:'PUBLICATION_REVIEW_REQUIRED'});
  const rejected=pending();rejected.claims[0].status='rejected';assert.equal(assess(rejected).publishable,false);
  const valid=assess(approved());assert.equal(valid.publishable,true);assert.equal(requirePublication(valid),valid);
});
test('Publication envelopes reject missing duplicate unknown and extra identities',()=>{
  for(const mutate of [r=>r.claims.pop(),r=>r.claims.push(copy(r.claims[0])),r=>r.claims[0].id='unknown',r=>r.claims[1].id=r.claims[0].id,r=>r.claims[0].extra='bad',r=>r.schemaVersion='old',r=>r.extra=true,r=>r.claims[0].contentSha256='bad',r=>r.claims[0].status='ready']){const record=pending();mutate(record);assert.throws(()=>assess(record));}
  assert.throws(()=>validateReview(pending(),snapshot.slice(1),{today}));
});
test('Publication approval requires explicit identities dates source and permission',()=>{
  for(const mutate of [r=>r.owner=null,r=>r.reviewer='',r=>r.owner='name@example.test',r=>r.reviewedAt='2026-02-30',r=>r.reviewedAt='2026-10-09',r=>r.validUntil='2026-10-07',r=>r.evidence=[],r=>r.evidence.pop(),r=>r.evidence[1].file=r.evidence[0].file,r=>r.evidence[0].kind='certified',r=>r.evidence[0].sha256='invalid',r=>r.evidence[0].extra=true]){const record=approved();mutate(record.claims[0]);assert.throws(()=>assess(record));}
  const unauthorized=pending();unauthorized.claims[0].owner='synthetic';assert.throws(()=>assess(unauthorized));
});
test('Publication expired or changed content invalidates prior attestation',()=>{
  const record=approved();record.claims[0].reviewedAt='2026-01-01';record.claims[0].validUntil='2026-10-07';record.claims[1].contentSha256=hash('changed');
  const result=assess(record);assert.equal(result.publishable,false);assert.deepEqual(result.problems,[{id:claimIds[0],code:'review_expired'},{id:claimIds[1],code:'source_changed'}]);
});
test('Publication evidence paths reject traversal absolute URLs and ambiguous extensions',()=>{
  for(const file of ['../source.txt','/tmp/source.txt','evidence/../source.txt','evidence/nested/source.txt','evidence/SOURCE.txt','https://invalid.test/a.pdf','evidence/source.html','evidence/source.pdf.exe','evidence/source%2ftxt']){const record=approved();record.claims[0].evidence[0].file=file;assert.throws(()=>assess(record));}
});
async function fixture(t){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'dongda-publication-synthetic-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  for(const folder of ['content/private-review/evidence','assets/js','assets/img'])await fs.mkdir(path.join(directory,folder),{recursive:true});
  await fs.copyFile(path.join(root,'index.html'),path.join(directory,'index.html'));await fs.copyFile(path.join(root,'content/company.json'),path.join(directory,'content/company.json'));
  await fs.copyFile(path.join(root,'content/company-history.json'),path.join(directory,'content/company-history.json'));
  await fs.copyFile(path.join(root,'content/company-profile.json'),path.join(directory,'content/company-profile.json'));
  await fs.writeFile(path.join(directory,'assets/js/fixture.js'),'/* synthetic static source */');await fs.writeFile(path.join(directory,'assets/img/fixture.txt'),'synthetic media');
  const value=approved(),actual=await publicationSnapshot(directory);value.claims.forEach((row,i)=>row.contentSha256=actual[i].contentSha256);
  await fs.writeFile(path.join(directory,'content/private-review/evidence/source.txt'),'synthetic source');await fs.writeFile(path.join(directory,'content/private-review/evidence/permission.txt'),'synthetic permission');
  const save=()=>fs.writeFile(path.join(directory,reviewPath),JSON.stringify(value));await save();return{directory,value,save};
}
test('Publication real file hashes accept only synthetic attested fixture and exclude private evidence from source digest',async t=>{
  const{directory}=await fixture(t),before=await publicationSnapshot(directory);assert.equal((await assessPublication(directory,{today})).publishable,true);
  await fs.writeFile(path.join(directory,'content/private-review/evidence/extra.txt'),'not public');assert.deepEqual(await publicationSnapshot(directory),before);
  const history=JSON.parse(await fs.readFile(path.join(directory,'content/company-history.json'),'utf8'));history.milestones[0].title.zh+=' synthetic changed record';await fs.writeFile(path.join(directory,'content/company-history.json'),JSON.stringify(history));
  const after=await publicationSnapshot(directory);for(const id of ['company-profile','company-history','public-content'])assert.notEqual(after.find(row=>row.id===id).contentSha256,before.find(row=>row.id===id).contentSha256);assert.equal((await assessPublication(directory,{today})).publishable,false);
});
test('Publication missing changed and symlinked evidence fail closed',async t=>{
  const{directory}=await fixture(t),file=path.join(directory,'content/private-review/evidence/source.txt');
  await fs.writeFile(file,'changed');const result=await assessPublication(directory,{today});assert.equal(result.publishable,false);assert.ok(result.problems.every(row=>row.code==='evidence_changed'));
  await fs.unlink(file);await assert.rejects(assessPublication(directory,{today}),{code:'ENOENT'});
  await fs.symlink(path.join(directory,'index.html'),file);await assert.rejects(assessPublication(directory,{today}),/Invalid evidence/);
});
test('Publication company-profile content invalidates approval independently of unchanged legacy HTML',async t=>{
  const{directory}=await fixture(t),before=await publicationSnapshot(directory),html=await fs.readFile(path.join(directory,'index.html'));
  const file=path.join(directory,'content/company-profile.json'),profile=JSON.parse(await fs.readFile(file));profile.copy.ab_body.zh='Synthetic pending body';await fs.writeFile(file,JSON.stringify(profile));
  const after=await publicationSnapshot(directory);for(const id of ['company-profile','public-content'])assert.notEqual(after.find(row=>row.id===id).contentSha256,before.find(row=>row.id===id).contentSha256);
  assert.deepEqual(await fs.readFile(path.join(directory,'index.html')),html);assert.equal((await assessPublication(directory,{today})).publishable,false);
});
test('Publication uses current authority for frozen candidate including revocation',async t=>{
  const{directory,value,save}=await fixture(t),candidate=directory+'-candidate';t.after(()=>fs.rm(candidate,{recursive:true,force:true}));await fs.cp(directory,candidate,{recursive:true});
  assert.equal((await assessPublication(candidate,{today,reviewRoot:directory})).publishable,true);
  Object.assign(value.claims[0],{status:'pending',owner:null,reviewer:null,reviewedAt:null,validUntil:null,evidence:[]});await save();
  assert.equal((await assessPublication(candidate,{today,reviewRoot:directory})).publishable,false);
  await fs.writeFile(path.join(candidate,'assets/js/fixture.js'),'/* altered candidate */');assert.ok((await assessPublication(candidate,{today,reviewRoot:directory})).problems.some(row=>row.code==='source_changed'));
});
test('Publication registry and evidence byte limits reject empty oversized or linked inputs',async t=>{
  const{directory,save}=await fixture(t),registry=path.join(directory,reviewPath),file=path.join(directory,'content/private-review/evidence/source.txt');
  await fs.truncate(registry,256*1024+1);await assert.rejects(assessPublication(directory,{today}),/registry/);await save();
  await fs.truncate(file,0);await assert.rejects(assessPublication(directory,{today}),/Invalid evidence/);
  await fs.truncate(file,10*1024*1024+1);await assert.rejects(assessPublication(directory,{today}),/Invalid evidence/);
  await fs.unlink(registry);await fs.symlink(path.join(directory,'index.html'),registry);await assert.rejects(assessPublication(directory,{today}),/registry/);
});
test('Publication aggregate evidence limit is enforced before excess bytes are read',async t=>{
  const{directory,value,save}=await fixture(t),size=9*1024*1024,sha256=hash(Buffer.alloc(size));
  for(let i=0;i<8;i++){const file=`evidence/source-${i}.txt`;await fs.writeFile(path.join(directory,'content/private-review',file),'');await fs.truncate(path.join(directory,'content/private-review',file),size);value.claims[i].evidence[0]={file,sha256,kind:'source'};}
  await save();await assert.rejects(assessPublication(directory,{today}),/exceeds review limit/);
});
test('Publication shared header badge is neutral translated and unambiguous',()=>{
  for(const locale of ['zh','en','ru']){const document=parse5.parse('<div data-reviewed-service>old promise</div>');localizeServiceBadge(document,locale);const node=nodes(document,n=>attribute(n,'data-reviewed-service')!==undefined)[0];assert.equal(plainText(node),globalThis.DongDaPublicReviewCopy.service(locale));assert.doesNotMatch(plainText(node),/24\/7|24小时|24 часа/);}
  assert.equal(globalThis.DongDaPublicReviewCopy.service('ja'),globalThis.DongDaPublicReviewCopy.service('en'));
  assert.equal(globalThis.DongDaPublicReviewCopy.service('constructor'),globalThis.DongDaPublicReviewCopy.service('en'));
  assert.throws(()=>localizeServiceBadge(parse5.parse('<div></div>'),'en'));
  assert.throws(()=>localizeServiceBadge(parse5.parse('<div data-reviewed-service data-i="tr4s"></div>'),'en'));
});
test('Publication build modes separate draft quality from release gate',async()=>{
  assert.equal(releaseBuildScript('published'),'preflight:aliyun');assert.equal(releaseBuildScript('preview'),'preflight:preview');assert.throws(()=>releaseBuildScript('invalid'));
  const scripts=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).scripts;
  assert.equal(scripts['preflight:aliyun'],'npm run audit:publication && npm run preflight:quality && npm run audit:publication');
  assert.equal(scripts['preflight:preview'],'npm run preflight:quality');assert.match(scripts['preflight:quality'],/audit:publication:preview/);
});
