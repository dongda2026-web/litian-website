import {readFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {validateAssetManifest,digest} from './static-delivery-core.mjs';
import {loadFontDelivery,fontDeliveryVersion,fontStylesheet} from './font-delivery.mjs';

export async function loadStaticDelivery(root) {
  const assets=validateAssetManifest(JSON.parse(await readFile(join(root,'content/asset-files.json'),'utf8')));
  const documents=JSON.parse(await readFile(join(root,'content/resource-files.json'),'utf8'));
  if(documents.version!=='2026.10.09-resource-delivery-v2'||!Array.isArray(documents.files)||documents.files.length!==12)throw new TypeError('Invalid resource delivery manifest');
  const paths=[];
  for(const file of [...assets.files,...documents.files]){
    if(!/^\/assets\//.test(file.path)||!Number.isSafeInteger(file.size)||file.size<1||file.size>4*1024*1024||!/^[a-f0-9]{64}$/.test(file.sha256)||(!file.originalPath&&!/^\/assets\/documents\/[a-z0-9-]+-sha256-[a-f0-9]{64}\.txt$/.test(file.path))||paths.includes(file.path))throw new TypeError('Invalid delivery file');
    const path=join(root,file.path);if(!(await lstat(path)).isFile())throw new TypeError('Delivery file must be regular');
    const bytes=await readFile(path);if(bytes.length!==file.size||digest(bytes)!==file.sha256)throw new TypeError('Delivery file integrity mismatch');
    paths.push(file.path);
  }
  const site=JSON.parse(await readFile(join(root,'site-manifest.json'),'utf8'));
  const fonts=await loadFontDelivery(root,{optional:site.font_delivery_version===undefined&&!assets.files.some(file=>file.originalPath===fontStylesheet)});
  if(site.font_delivery_version!==undefined&&site.font_delivery_version!==fontDeliveryVersion)throw new TypeError('Unsupported font delivery version');
  return Object.freeze({delivery:true,immutablePaths:Object.freeze([...paths,...(fonts?.immutablePaths||[])])});
}
