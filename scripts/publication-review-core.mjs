import {readFile,readdir,lstat,realpath} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {parse as parseJavaScript} from 'acorn';
import {parse as parseHtml,serialize} from 'parse5';
import {nodes,attribute,plainText} from './build-product-pages.mjs';

export const reviewVersion='2026.10.08-publication-review-v1';
export const reviewPath='content/private-review/review.json';
export const claimIds=Object.freeze(['company-profile','company-history','global-footprint','quality-certificates','sustainability','factory','customer-display','service-channels','legal-policy','assistant-copy','public-content','media-rights']);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
  const encoded=JSON.stringify(value);if(encoded===undefined)throw new TypeError('Undefined publication data');return encoded;
}
export const digest=value=>sha(canonical(value));
function walk(node,visit){if(!node||typeof node!=='object')return;visit(node);for(const value of Object.values(node))if(Array.isArray(value))value.forEach(child=>walk(child,visit));else if(value&&typeof value==='object')walk(value,visit);}
export function literal(node){
  if(node?.type==='Literal'&&!node.regex&&typeof node.value!=='bigint')return node.value;
  if(node?.type==='TemplateLiteral'&&node.expressions.length===0)return node.quasis.map(part=>part.value.cooked).join('');
  if(node?.type==='ArrayExpression'&&node.elements.every(Boolean))return node.elements.map(literal);
  if(node?.type==='ObjectExpression'){
    const result=Object.create(null);
    for(const prop of node.properties){
      if(prop.type!=='Property'||prop.kind!=='init'||prop.computed||prop.method||prop.shorthand)throw new TypeError('Nonliteral review data');
      const key=prop.key.type==='Identifier'?prop.key.name:prop.key.value;
      if(typeof key!=='string'||['__proto__','prototype','constructor'].includes(key)||Object.hasOwn(result,key))throw new TypeError('Unsafe or duplicate review key');
      result[key]=literal(prop.value);
    }
    return result;
  }
  throw new TypeError('Review extraction never executes JavaScript');
}
export function staticDeclarations(code){
  const ast=parseJavaScript(code,{ecmaVersion:2022,sourceType:'script'}),data=Object.create(null);
  const selected=new Set(['T','CAPS','ABOUT_PILLARS','CERTS','SUS_METRICS','SUS_PILLARS','PCASE','PCASE_I18N','MEGA_DATA','HNAV','LB_META']);
  walk(ast,node=>{if(node.type==='VariableDeclarator'&&selected.has(node.id?.name)){if(Object.hasOwn(data,node.id.name))throw new TypeError('Duplicate review declaration');data[node.id.name]=literal(node.init);}});
  return {ast,data};
}
async function files(directory,prefix='',exclude=new Set()){
  const result=[];
  for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    const path=prefix+entry.name;
    if(exclude.has(path))continue;
    if(entry.isSymbolicLink())throw new TypeError('Symlink in publication inputs');
    if(entry.isDirectory())result.push(...await files(join(directory,entry.name),path+'/',exclude));
    else result.push({path,sha256:sha(await readFile(join(directory,entry.name)))});
  }
  return result;
}
export async function publicationSnapshot(root){
  const source=await readFile(join(root,'index.html'),'utf8');if(Buffer.byteLength(source)>2*1024*1024)throw new TypeError('Publication source exceeds limit');
  const document=parseHtml(source),declarations=Object.create(null),programs=[];
  for(const script of nodes(document,node=>node.tagName==='script'&&!attribute(node,'src')&&attribute(node,'type')!=='application/ld+json')){
    const code=plainText(script);if(!code.trim())continue;
    const extracted=staticDeclarations(code);Object.assign(declarations,extracted.data);programs.push(extracted.ast);
  }
  for(const name of ['T','CAPS','ABOUT_PILLARS','CERTS','SUS_METRICS','SUS_PILLARS','PCASE','PCASE_I18N','MEGA_DATA','HNAV','LB_META'])if(!Object.hasOwn(declarations,name))throw new TypeError('Missing reviewed declaration: '+name);
  const block=id=>{const found=nodes(document,n=>attribute(n,'id')===id);if(found.length!==1)throw new TypeError('Missing or duplicate review surface: '+id);return serialize(found[0]);};
  const classes=name=>nodes(document,n=>(attribute(n,'class')||'').split(' ').includes(name)).map(serialize);
  const translated=prefixes=>Object.fromEntries(Object.entries(declarations.T).map(([locale,values])=>[locale,Object.fromEntries(Object.entries(values).filter(([key])=>prefixes.some(prefix=>key.startsWith(prefix))))]));
  const company=JSON.parse(await readFile(join(root,'content/company.json'),'utf8'));
  const companyHistory=JSON.parse(await readFile(join(root,'content/company-history.json'),'utf8'));
  const companyProfile=JSON.parse(await readFile(join(root,'content/company-profile.json'),'utf8'));
  const payloads={
    'company-profile':{html:block('page-about'),text:translated(['ab_','company_','journey_']),caps:declarations.CAPS,pillars:declarations.ABOUT_PILLARS,company,companyHistory,companyProfile},
    'company-history':{html:classes('company-history-detail'),text:translated(['tl','journey_']),journey:company.journey,companyHistory},
    'global-footprint':{html:classes('global-sec'),text:translated(['gp_','base','tr','hs','gs_']),facts:company.facts,bases:company.bases},
    'quality-certificates':{certificates:declarations.CERTS,text:translated(['cert_']),menu:declarations.MEGA_DATA?.m1},
    sustainability:{html:block('page-sustain'),text:translated(['sus','esg']),metrics:declarations.SUS_METRICS,pillars:declarations.SUS_PILLARS},
    factory:{html:block('page-factory'),strip:classes('fac-strip'),text:translated(['fac','fact','fg']),captions:declarations.LB_META},
    'customer-display':{html:[...classes('case-marquee-sec'),...classes('partners-sec'),...classes('showcase-grid')],text:translated(['pt_','ps_','pcase_','pc_']),cases:declarations.PCASE,caseCopy:declarations.PCASE_I18N},
    'service-channels':{header:block('top-bar'),text:translated(['tr','ct','inq']),navigation:declarations.HNAV},
    'legal-policy':{html:[block('privacyModal'),block('legalModal')],text:translated(['legal','privacy'])},
    'assistant-copy':{html:block('ai-widget'),programs},
    'public-content':{html:serialize(document),javascript:await files(join(root,'assets/js')),json:await files(join(root,'content'),'',new Set(['private-review','news.json','content-index.json']))},
    'media-rights':await files(join(root,'assets/img'))
  };
  for(const id of claimIds)if(payloads[id]===undefined)throw new TypeError('Missing publication group');
  return claimIds.map(id=>({id,contentSha256:digest(payloads[id])}));
}
function exact(value,keys,label){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!==keys.slice().sort().join('|'))throw new TypeError('Invalid '+label+' fields');}
const isoDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export function validateReview(review,snapshot,{today=new Date().toISOString().slice(0,10)}={}){
  exact(review,['schemaVersion','claims'],'review');if(review.schemaVersion!==reviewVersion||!Array.isArray(review.claims)||review.claims.length!==claimIds.length||!isoDate(today))throw new TypeError('Invalid review envelope');
  const expected=new Map(snapshot.map(row=>[row.id,row.contentSha256]));if(expected.size!==claimIds.length||claimIds.some(id=>!expected.has(id)))throw new TypeError('Incomplete current snapshot');
  const seen=new Set(),problems=[];
  for(const record of review.claims){
    exact(record,['id','contentSha256','status','owner','reviewer','reviewedAt','validUntil','evidence'],'claim');
    if(!expected.has(record.id)||seen.has(record.id)||!/^[a-f0-9]{64}$/.test(record.contentSha256)||!['pending','approved','rejected'].includes(record.status)||!Array.isArray(record.evidence)||record.evidence.length>12)throw new TypeError('Invalid claim identity');seen.add(record.id);
    if(record.contentSha256!==expected.get(record.id))problems.push({id:record.id,code:'source_changed'});
    if(record.status!=='approved'){
      if([record.owner,record.reviewer,record.reviewedAt,record.validUntil].some(value=>value!==null)||record.evidence.length)throw new TypeError('Unapproved record cannot assert approval');
      problems.push({id:record.id,code:'review_required'});continue;
    }
    if(![record.owner,record.reviewer].every(value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{1,79}$/.test(value))||!isoDate(record.reviewedAt)||!isoDate(record.validUntil)||record.reviewedAt>today||record.validUntil<record.reviewedAt)throw new TypeError('Incomplete approval attestation');
    if(record.validUntil<today)problems.push({id:record.id,code:'review_expired'});
    const names=new Set();
    for(const evidence of record.evidence){
      exact(evidence,['file','sha256','kind'],'evidence');
      if(!/^evidence\/[a-z0-9][a-z0-9_-]{0,79}\.(pdf|docx|txt|md|png|jpg)$/.test(evidence.file)||!/^[a-f0-9]{64}$/.test(evidence.sha256)||!['source','publication-permission'].includes(evidence.kind)||names.has(evidence.file))throw new TypeError('Invalid private evidence');names.add(evidence.file);
    }
    if(!['source','publication-permission'].every(kind=>record.evidence.some(evidence=>evidence.kind===kind)))throw new TypeError('Source and publication permission required');
  }
  return {version:reviewVersion,publishable:problems.length===0,claims:review.claims.length,problems};
}
export async function assessPublication(root,{reviewRoot=root,...options}={}){
  const privateRoot=resolve(reviewRoot,'content/private-review'),reviewFile=join(reviewRoot,reviewPath),directory=await lstat(privateRoot),registry=await lstat(reviewFile);
  if(directory.isSymbolicLink()||!directory.isDirectory()||registry.isSymbolicLink()||!registry.isFile()||registry.size<1||registry.size>256*1024)throw new TypeError('Invalid private review registry');
  const review=JSON.parse(await readFile(reviewFile,'utf8')),snapshot=await publicationSnapshot(root),result=validateReview(review,snapshot,options),checked=new Map();let total=0;
  for(const record of review.claims.filter(record=>record.status==='approved'))for(const evidence of record.evidence){
    const file=resolve(privateRoot,evidence.file);if(!file.startsWith(privateRoot+sep))throw new TypeError('Evidence path escape');
    if(!checked.has(file)){
      const stat=await lstat(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.size<1||stat.size>10*1024*1024||!(await realpath(file)).startsWith(await realpath(privateRoot)+sep))throw new TypeError('Invalid evidence file');
      total+=stat.size;if(total>64*1024*1024)throw new TypeError('Private evidence exceeds review limit');checked.set(file,sha(await readFile(file)));
    }
    if(checked.get(file)!==evidence.sha256)result.problems.push({id:record.id,code:'evidence_changed'});
  }
  result.publishable=result.problems.length===0;return result;
}
export function requirePublication(result){if(!result.publishable){const error=new Error('PUBLICATION_REVIEW_REQUIRED: '+result.problems.map(row=>row.id+'/'+row.code).join(', '));error.code='PUBLICATION_REVIEW_REQUIRED';throw error;}return result;}
