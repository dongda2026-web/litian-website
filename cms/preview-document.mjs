import * as html from 'parse5';
import * as css from 'css-tree';
import {fileTypeFromBuffer} from 'file-type';
import {createHash} from 'node:crypto';

export const previewVersion='2026.10.09-cms-preview-v2';
export const previewLimits=Object.freeze({html:2*1024*1024,css:512*1024,cssFile:256*1024,image:2*1024*1024,imageTotal:8*1024*1024,images:64,output:16*1024*1024});
const attr=(node,name)=>node.attrs?.find(item=>item.name===name)?.value;
function set(node,name,value){const field=node.attrs.find(item=>item.name===name);if(field)field.value=value;else node.attrs.push({name,value});}
function visit(node,callback){callback(node);for(const child of node.childNodes||[])visit(child,callback);}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function failure(){throw new TypeError('Readonly preview asset validation failed');}
function localPath(value){
  if(typeof value!=='string'||value.length>2048)failure();
  let url;try{url=new URL(value,'https://preview.invalid/');}catch{failure();}
  if(url.origin!=='https://preview.invalid')return null;
  if(value.includes('\\')||value.includes('%')||/(?:^|\/)\.{1,2}(?:\/|$)/.test(value))failure();
  if(url.search||url.hash||url.username||url.password||!/^\/assets\/(?:css\/[a-z0-9-]+\.css|releases\/[a-f0-9]{64}\/assets\/css\/[a-z0-9-]+\.css|img\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.(?:jpg|jpeg|png|webp))$/.test(url.pathname))failure();
  return url.pathname;
}
function styleNode(text,media){
  if(/<\/style/i.test(text))failure();
  const node=html.parseFragment('<style></style>').childNodes[0];node.childNodes=[{nodeName:'#text',value:text,parentNode:node}];if(media)set(node,'media',media);return node;
}
export async function readonlyPreview({source,wanted,readAsset}){
  if(typeof source!=='string'||Buffer.byteLength(source)>previewLimits.html||typeof readAsset!=='function'||!/^page-[a-z-]+$/.test(wanted))failure();
  const document=html.parse(source,{scriptingEnabled:false});let active,head;visit(document,node=>{if(node.tagName==='head')head=node;if(attr(node,'id')===wanted){if(active)failure();active=node;}});if(!active||!head)failure();
  const images=new Map(),styles=[],observations={version:previewVersion,styles:0,images:0,legacyImageExtensions:0,discardedSyntaxNodes:0,externalReferencesRemoved:0,cssBytes:0,imageBytes:0};
  async function image(value){
    const path=localPath(value);if(path===null){observations.externalReferencesRemoved++;return null;}if(!path.startsWith('/assets/img/'))failure();
    if(images.has(path))return images.get(path);
    if(images.size>=previewLimits.images)failure();
    const bytes=await readAsset(path,previewLimits.image),type=await fileTypeFromBuffer(bytes),extension=path.slice(path.lastIndexOf('.')+1),expected=extension==='jpg'||extension==='jpeg'?'image/jpeg':extension==='png'?'image/png':'image/webp';
    if(!type||!['image/jpeg','image/png','image/webp'].includes(type.mime)||bytes.length<1||bytes.length>previewLimits.image||observations.imageBytes+bytes.length>previewLimits.imageTotal)failure();
    if(type.mime!==expected)observations.legacyImageExtensions++;
    const data='data:'+type.mime+';base64,'+bytes.toString('base64');images.set(path,data);observations.images++;observations.imageBytes+=bytes.length;return data;
  }
  async function stylesheet(text,context='stylesheet'){
    observations.cssBytes+=Buffer.byteLength(text);if(observations.cssBytes>previewLimits.css)failure();
    let ast;try{ast=css.parse(text,{context,parseCustomProperty:true});}catch{failure();}
    const references=[],remove=[];
    css.walk(ast,function(node,item,list){
      // Ignore invalid standalone declarations, as browsers do; never emit raw values.
      if(node.type==='Raw'){if(this.declaration||!item||!list)failure();remove.push({item,list});observations.discardedSyntaxNodes++;return css.walk.skip;}
      if(node.type==='Atrule'&&['import','font-face'].includes(node.name.toLowerCase())){if(!item||!list)failure();remove.push({item,list});return css.walk.skip;}
      if(node.type==='Function'&&['expression','image-set','-webkit-image-set'].includes(node.name.toLowerCase()))failure();
      if(node.type==='Url')references.push(node);
    });
    for(const {item,list} of remove){list.remove(item);observations.externalReferencesRemoved++;}
    for(const node of references){const value=await image(node.value);if(value===null){node.type='Identifier';node.name='none';delete node.value;}else node.value=value;}
    return css.generate(ast);
  }
  async function sheet(node){
    if(node.tagName==='style'){
      const text=(node.childNodes||[]).map(child=>child.value||'').join('');observations.styles++;return styleNode(await stylesheet(text),attr(node,'media'));
    }
    const value=attr(node,'href'),path=localPath(value);if(path===null){observations.externalReferencesRemoved++;return null;}if(!path.endsWith('.css'))failure();
    // The dedicated font sheet is discarded, not read or trusted; readonly previews use fallback fonts.
    if(/^\/assets\/(?:css\/|releases\/[a-f0-9]{64}\/assets\/css\/)local-fonts\.css$/.test(path)){observations.externalReferencesRemoved++;return null;}
    const bytes=await readAsset(path,previewLimits.cssFile),integrity=attr(node,'integrity'),fingerprint=/^\/assets\/releases\/([a-f0-9]{64})\//.exec(path);
    if(fingerprint&&(hash(bytes)!==fingerprint[1]||integrity!=='sha256-'+createHash('sha256').update(bytes).digest('base64')))failure();
    if(!fingerprint&&integrity&&integrity!=='sha256-'+createHash('sha256').update(bytes).digest('base64'))failure();
    observations.styles++;return styleNode(await stylesheet(bytes.toString('utf8')),attr(node,'media'));
  }
  async function collectHead(node){for(const child of node.childNodes||[]){if(child.tagName==='style'||child.tagName==='link'&&(attr(child,'rel')||'').split(/\s+/).includes('stylesheet')){const replacement=await sheet(child);if(replacement)styles.push(html.serializeOuter(replacement));}else if(child.tagName==='noscript')await collectHead(child);}}
  await collectHead(head);
  const removed=new Set(['script','iframe','frame','form','object','embed','base','meta','video','audio','source','track','foreignObject','animate','animateTransform','set','use','template']);
  async function sanitize(node){
    node.childNodes=(node.childNodes||[]).filter(child=>!removed.has(child.tagName));
    const children=[];
    for(const child of node.childNodes){
      if(child.tagName==='link'){if((attr(child,'rel')||'').split(/\s+/).includes('stylesheet')){const replacement=await sheet(child);if(replacement){replacement.parentNode=node;children.push(replacement);}}continue;}
      if(child.tagName==='style'){const replacement=await sheet(child);replacement.parentNode=node;children.push(replacement);continue;}
      await sanitize(child);children.push(child);
    }
    node.childNodes=children;
    node.attrs=(node.attrs||[]).filter(item=>!/^on/i.test(item.name)&&!['srcdoc','srcset','ping','action','formaction','target','autofocus','contenteditable','download','is','poster','background'].includes(item.name));
    const style=attr(node,'style');if(style!==undefined)set(node,'style',await stylesheet(style,'declarationList'));
    if(node.tagName==='img'){
      const source=attr(node,'src');if(source){const data=await image(source);if(data)set(node,'src',data);else node.attrs=node.attrs.filter(item=>item.name!=='src');}set(node,'loading','eager');
    }else node.attrs=node.attrs.filter(item=>item.name!=='src');
    for(const item of node.attrs)if(['href','xlink:href'].includes(item.name))item.value='#';
    if(['a','button'].includes(node.tagName))set(node,'tabindex','-1');if(['button','input','select','textarea'].includes(node.tagName))set(node,'disabled','');
  }
  const body=document.childNodes.find(node=>node.tagName==='html')?.childNodes.find(node=>node.tagName==='body'),bodyParts=[];
  // Global body styles still apply to the selected page; keep their source order.
  async function collectBody(node){for(const child of node.childNodes||[]){
    if(child===active){await sanitize(child);bodyParts.push(html.serializeOuter(child));}
    else if(child.tagName==='style'||child.tagName==='link'&&(attr(child,'rel')||'').split(/\s+/).includes('stylesheet')){const replacement=await sheet(child);if(replacement)bodyParts.push(html.serializeOuter(replacement));}
    else if(!removed.has(child.tagName))await collectBody(child);
  }}
  if(!body)failure();await collectBody(body);
  const language=attr(document.childNodes.find(node=>node.tagName==='html'),'lang');if(!['zh','en','ru'].includes(language))failure();
  const policy="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'; form-action 'none'; base-uri 'none'; font-src 'none'; connect-src 'none'";
  const output='<!doctype html><html lang="'+language+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="'+policy+'">'+styles.join('')+'</head><body>'+bodyParts.join('')+'<style>body{margin:0;padding:0}.page{display:block!important}#pd-apps,#pd-proc{display:block!important}.pd-tabs{display:none}.rv,.reveal{opacity:1!important;transform:none!important}button:disabled{cursor:default}</style></body></html>';
  if(Buffer.byteLength(output)>previewLimits.output)failure();
  return{html:output,observations};
}
