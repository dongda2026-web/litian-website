import {createHash} from 'node:crypto';

export const deliveryVersion='2026.10.09-static-delivery-v1';
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export const integrity=bytes=>'sha256-'+createHash('sha256').update(bytes).digest('base64');
export function assetRecord(originalPath,bytes) {
  if(!/^\/assets\/(js|css)\/[a-z0-9-]+\.(js|css)$/.test(originalPath) || !originalPath.endsWith(originalPath.startsWith('/assets/js/')?'.js':'.css') || bytes.length<1 || bytes.length>4*1024*1024) throw new TypeError('Invalid public asset');
  const sha256=digest(bytes);
  return{originalPath,path:'/assets/releases/'+sha256+originalPath,size:bytes.length,sha256,integrity:integrity(bytes),type:originalPath.endsWith('.js')?'script':'style'};
}
export function validateAssetManifest(data) {
  const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
  if(!exact(data,['version','files']) || data.version!==deliveryVersion || !Array.isArray(data.files) || !data.files.length || data.files.length>200) throw new TypeError('Invalid public asset manifest');
  const seen=new Set();
  for(const file of data.files){
    if(!exact(file,['originalPath','path','size','sha256','integrity','type']) || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size<1 || file.size>4*1024*1024) throw new TypeError('Invalid public asset record');
    if(!/^\/assets\/(js|css)\/[a-z0-9-]+\.(js|css)$/.test(file.originalPath) || !file.originalPath.endsWith(file.originalPath.startsWith('/assets/js/')?'.js':'.css') || file.type!==(file.originalPath.endsWith('.js')?'script':'style') || file.path!=='/assets/releases/'+file.sha256+file.originalPath || file.integrity!=='sha256-'+Buffer.from(file.sha256,'hex').toString('base64') || seen.has(file.originalPath)) throw new TypeError('Invalid public asset identity');
    seen.add(file.originalPath);
  }
  return data;
}
// This self-contained function is also serialized into the optional static worker.
export function cacheControl(path,status,immutablePaths) {
  if(status===200 && immutablePaths.includes(path)) return 'public, max-age=31536000, immutable';
  if(status===200 && (/^\/assets\/img\//.test(path)||/^\/img\//.test(path))) return 'public, max-age=0, must-revalidate';
  return 'no-store';
}
export function preferredEncoding(header) {
  if(typeof header!=='string'||header.length>1024) return 'identity';
  const values=new Map();
  for(const part of header.split(',')){
    const match=/^\s*([a-zA-Z*]+)\s*(?:;\s*q=(0(?:\.[0-9]{0,3})?|1(?:\.0{0,3})?))?\s*$/.exec(part);
    if(!match||values.has(match[1].toLowerCase()))return 'identity';
    values.set(match[1].toLowerCase(),match[2]===undefined?1:Number(match[2]));
  }
  const quality=name=>values.get(name)??values.get('*')??0;
  const choices=['br','gzip','deflate'].filter(name=>quality(name)>0).sort((a,b)=>quality(b)-quality(a));
  const identityQuality=values.get('identity')??(values.get('*')===0?0:undefined);
  if(choices.length&&(identityQuality===undefined||quality(choices[0])>=identityQuality))return choices[0];
  return identityQuality===0?'unacceptable':'identity';
}
