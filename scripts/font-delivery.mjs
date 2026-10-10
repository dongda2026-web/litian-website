import {readFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import * as css from 'css-tree';
import {digest} from './static-delivery-core.mjs';

export const fontDeliveryVersion='2026.10.09-font-delivery-v1';
export const fontStylesheet='/assets/css/local-fonts.css';
const families=['DM Serif Display','Inter','Noto Sans SC'];
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function validateWoff2(bytes){
  // Container checks are not a font decoder. Browser decode is an independent acceptance gate.
  if(!Buffer.isBuffer(bytes)||bytes.length<64||bytes.length>512*1024||bytes.toString('ascii',0,4)!=='wOF2'||bytes.readUInt32BE(8)!==bytes.length||bytes.readUInt16BE(12)<1||bytes.readUInt16BE(12)>256||bytes.readUInt16BE(14)!==0||bytes.readUInt32BE(16)<12||bytes.readUInt32BE(16)>32*1024*1024||bytes.readUInt32BE(20)<1||bytes.readUInt32BE(20)>bytes.length-48)throw new TypeError('Invalid bounded WOFF2 container');
  return bytes;
}
export function validateFontManifest(data){
  if(!exact(data,['version','source','stylesheet','files','licenses'])||data.version!==fontDeliveryVersion||!exact(data.source,['cssUrl','cssSha256','userAgent','gitCommit'])||data.source.cssUrl!=='https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@300;400;500;600;700&family=Noto+Sans+SC:wght@300;400;500;700;900&display=swap'||!hash(data.source.cssSha256)||typeof data.source.userAgent!=='string'||data.source.userAgent.length>300||!/^[a-f0-9]{40}$/.test(data.source.gitCommit)||!exact(data.stylesheet,['path','size','sha256'])||data.stylesheet.path!==fontStylesheet||!Number.isSafeInteger(data.stylesheet.size)||data.stylesheet.size<1||data.stylesheet.size>512*1024||!hash(data.stylesheet.sha256)||!Array.isArray(data.files)||!data.files.length||data.files.length>160||!Array.isArray(data.licenses)||data.licenses.length!==3)throw new TypeError('Invalid font delivery manifest');
  const paths=new Set(),sources=new Set();let total=0;
  for(const file of data.files){
    if(!exact(file,['path','size','sha256','sourceUrl'])||!hash(file.sha256)||file.path!=='/assets/fonts/'+file.sha256+'.woff2'||!Number.isSafeInteger(file.size)||file.size<64||file.size>512*1024||typeof file.sourceUrl!=='string'||!/^https:\/\/fonts\.gstatic\.com\/s\/(?:dmserifdisplay|inter|notosanssc)\/v[1-9][0-9]*\/[A-Za-z0-9_-]+(?:\.[0-9]+)?\.woff2$/.test(file.sourceUrl)||paths.has(file.path)||sources.has(file.sourceUrl))throw new TypeError('Invalid font delivery identity');
    paths.add(file.path);sources.add(file.sourceUrl);total+=file.size;
  }
  if(total>20*1024*1024)throw new TypeError('Font delivery exceeds total byte budget');
  for(const [i,license] of data.licenses.entries())if(!exact(license,['family','path','size','sha256','sourceUrl'])||license.family!==families[i]||license.path!=='/assets/fonts/'+['dm-serif-display','inter','noto-sans-sc'][i]+'-OFL.txt'||!hash(license.sha256)||!Number.isSafeInteger(license.size)||license.size<100||license.size>64*1024||license.sourceUrl!=='https://raw.githubusercontent.com/google/fonts/'+data.source.gitCommit+'/ofl/'+['dmserifdisplay','inter','notosanssc'][i]+'/OFL.txt')throw new TypeError('Invalid font license identity');
  return data;
}
export function fontCssAst(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>1024*1024)throw new TypeError('Font CSS exceeds byte budget');
  return css.parse(text,{onParseError(){throw new TypeError('Invalid font CSS grammar');}});
}
export function validateFontCss(text,manifest){
  validateFontManifest(manifest);
  const ast=fontCssAst(text),used=new Set(),seenFamilies=new Set();let faces=0;
  ast.children.forEach(rule=>{
    if(rule.type!=='Atrule'||rule.name!=='font-face'||rule.prelude||!rule.block)throw new TypeError('Only font-face rules are allowed');
    const properties=new Set();let urls=0;
    rule.block.children.forEach(declaration=>{
      if(declaration.type!=='Declaration'||declaration.important||properties.has(declaration.property)||!['font-family','font-style','font-weight','font-display','src','unicode-range'].includes(declaration.property))throw new TypeError('Invalid font descriptor');
      properties.add(declaration.property);
      if(css.lexer.matchAtruleDescriptor('font-face',declaration.property,declaration.value).error)throw new TypeError('Invalid font descriptor grammar');
      const value=css.generate(declaration.value);
      if(declaration.property==='font-family'){
        const family=declaration.value.children.first;
        if(family?.type!=='String'||!families.includes(family.value)||declaration.value.children.size!==1)throw new TypeError('Unapproved font family');
        seenFamilies.add(family.value);
      }
      if(declaration.property==='font-style'&&value!=='normal'||declaration.property==='font-display'&&value!=='swap'||declaration.property==='font-weight'&&!/^(300|400|500|600|700|900)$/.test(value))throw new TypeError('Unapproved font settings');
      css.walk(declaration.value,node=>{
        if(node.type==='Raw')throw new TypeError('Unparsed font descriptor');
        if(node.type==='Url'){
          if(declaration.property!=='src'||!manifest.files.some(file=>file.path===node.value))throw new TypeError('Untracked or external font URL');
          used.add(node.value);urls++;
        }
        if(node.type==='Function'&&(declaration.property!=='src'||node.name!=='format'||css.generate(node)!=='format("woff2")'))throw new TypeError('Unapproved font source');
      });
      if(declaration.property==='src'&&!/^url\(\/assets\/fonts\/[a-f0-9]{64}\.woff2\)format\("woff2"\)$/.test(value))throw new TypeError('Noncanonical font source');
    });
    if(properties.size!==6||urls!==1)throw new TypeError('Incomplete font-face');
    faces++;
  });
  if(!faces||faces>800||seenFamilies.size!==3||used.size!==manifest.files.length)throw new TypeError('Unreachable or missing font files');
  return {faces,files:used.size};
}
export async function loadFontDelivery(root,{optional=false}={}){
  const manifestPath=join(root,'assets/fonts/manifest.json');let bytes;
  try{const info=await lstat(manifestPath);if(!info.isFile()||info.size>256*1024)throw new TypeError('Font manifest must be regular and bounded');bytes=await readFile(manifestPath);}catch(error){if(optional&&error.code==='ENOENT')return null;throw error;}
  if(bytes.length>256*1024)throw new TypeError('Font manifest exceeds byte budget');
  const manifest=validateFontManifest(JSON.parse(bytes));
  for(const file of [manifest.stylesheet,...manifest.files,...manifest.licenses]){
    // Fixed direct paths prevent nested path traversal; deny symbolic directory substitution too.
    for(const directory of ['assets',file.path.startsWith('/assets/fonts/')?'assets/fonts':'assets/css'])if(!(await lstat(join(root,directory))).isDirectory())throw new TypeError('Font directory must be regular');
    const path=join(root,file.path),info=await lstat(path);if(!info.isFile()||info.size!==file.size)throw new TypeError('Font delivery file must be regular and size-matched');
    const content=await readFile(path);if(content.length!==file.size||digest(content)!==file.sha256)throw new TypeError('Font delivery integrity mismatch');
    if(file.path.endsWith('.woff2'))validateWoff2(content);
    if(file.path.endsWith('-OFL.txt')&&!content.toString('utf8').includes('SIL OPEN FONT LICENSE Version 1.1'))throw new TypeError('Font license missing');
  }
  const checks=validateFontCss(await readFile(join(root,fontStylesheet),'utf8'),manifest);
  return {manifest,checks,immutablePaths:manifest.files.map(file=>file.path)};
}
