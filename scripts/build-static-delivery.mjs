import {readFile,writeFile,mkdir,readdir,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {parse,serialize} from 'parse5';
import {parse as parseScript} from 'acorn';
import {nodes,attribute,setAttribute} from './build-product-pages.mjs';
import {assetRecord,validateAssetManifest,deliveryVersion} from './static-delivery-core.mjs';
import {fontStylesheet,loadFontDelivery} from './font-delivery.mjs';

export async function htmlFiles(root,prefix='') {
  const files=[];
  for(const entry of await readdir(join(root,prefix),{withFileTypes:true})){
    if(entry.isSymbolicLink())throw new TypeError('Public symlink is not permitted');
    const path=prefix+entry.name;
    if(entry.isDirectory())files.push(...await htmlFiles(root,path+'/'));
    else if(entry.isFile()&&entry.name.endsWith('.html'))files.push(path);
  }
  return files.sort();
}
export function linkedAssets(document) {
  return nodes(document,node=>node.tagName==='script'&&attribute(node,'src')!==undefined||node.tagName==='link'&&(attribute(node,'rel')||'').split(/\s+/).includes('stylesheet')).map(node=>({node,key:node.tagName==='script'?'src':'href'}));
}
async function dependencyGuard(path,bytes,client) {
  const text=bytes.toString('utf8');
  if(path.endsWith('.css')){
    if(path===fontStylesheet){const fonts=await loadFontDelivery(client);if(fonts.manifest.stylesheet.sha256!==assetRecord(path,bytes).sha256)throw new TypeError('Font stylesheet identity mismatch');return;}
    // Current styles have no relative dependencies. A future dependency needs an explicit build rule.
    if(/@import\b|url\s*\(/i.test(text))throw new TypeError('Stylesheet dependency requires an explicit delivery rule');
    return;
  }
  const ast=parseScript(text,{ecmaVersion:'latest',sourceType:'script'});
  const visit=node=>{
    if(!node||typeof node!=='object')return;
    if(['ImportDeclaration','ImportExpression','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type) || node.type==='NewExpression'&&['Worker','SharedWorker'].includes(node.callee?.name) || node.type==='Literal'&&typeof node.value==='string'&&/assets\/(?:js|css)\//.test(node.value)) throw new TypeError('Script dependency requires an explicit delivery rule');
    for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}
  };
  visit(ast);
}
export async function buildStaticDelivery({client}) {
  try{await lstat(join(client,'assets/releases'));throw new TypeError('Preexisting release assets are not permitted');}catch(error){if(error.code!=='ENOENT')throw error;}
  const files=new Map(),pages=await htmlFiles(client);
  for(const page of pages){
    const document=parse(await readFile(join(client,page),'utf8'));
    for(const {node,key} of linkedAssets(document)){
      const value=attribute(node,key);if(!value)throw new TypeError('Missing asset URL');
      const url=new URL(value,'https://static.invalid/');
      if(url.origin!=='https://static.invalid')continue;
      if(url.search||url.hash||url.username||url.password)throw new TypeError('Local asset URL must be canonical');
      if(!/^\/assets\/(js|css)\/[a-z0-9-]+\.(js|css)$/.test(url.pathname) || !(await lstat(join(client,url.pathname))).isFile())throw new TypeError('Local asset must be a regular public script or stylesheet');
      let record=files.get(url.pathname);
      if(!record){const bytes=await readFile(join(client,url.pathname));await dependencyGuard(url.pathname,bytes,client);record=assetRecord(url.pathname,bytes);files.set(url.pathname,record);await mkdir(join(client,record.path,'..'),{recursive:true});await writeFile(join(client,record.path),bytes);}
      setAttribute(node,key,record.path);setAttribute(node,'integrity',record.integrity);
    }
    await writeFile(join(client,page),serialize(document));
  }
  const manifest=validateAssetManifest({version:deliveryVersion,files:[...files.values()].sort((a,b)=>a.originalPath.localeCompare(b.originalPath))});
  await writeFile(join(client,'content/asset-files.json'),JSON.stringify(manifest,null,2)+'\n');
  const site=JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8'));site.static_delivery_version=deliveryVersion;
  await writeFile(join(client,'site-manifest.json'),JSON.stringify(site,null,2)+'\n');
  const documents=JSON.parse(await readFile(join(client,'content/resource-files.json'),'utf8'));
  const fonts=files.has(fontStylesheet)?await loadFontDelivery(client):null;
  const headers=await readFile(join(client,'_headers'),'utf8');
  await writeFile(join(client,'_headers'),headers+'\n/assets/releases/*\n  Cache-Control: public, max-age=31536000, immutable\n\n'+[...documents.files,...(fonts?.manifest.files||[])].map(file=>file.path+'\n  Cache-Control: public, max-age=31536000, immutable\n').join('\n'));
  return manifest;
}
