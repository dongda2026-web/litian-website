import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readonlyPreview,previewLimits} from '../cms/preview-document.mjs';

// Structural raster fixture, not antivirus or visual-production evidence.
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=','base64');
const page=(body,head='',tail='')=>'<html lang="zh"><head>'+head+'</head><body><section id="page-resource-detail">'+body+'</section>'+tail+'</body></html>';
async function preview(source,assets={}){const reads=[];const result=await readonlyPreview({source,wanted:'page-resource-detail',readAsset:async(path,limit)=>{reads.push({path,limit});assert.ok(Object.hasOwn(assets,path),'Unexpected asset '+path);return assets[path];}});return {...result,reads};}
test('CMS preview discards dedicated local font sheets without increasing read budgets or allowing fonts',async()=>{
  for(const path of ['/assets/css/local-fonts.css','/assets/releases/'+'a'.repeat(64)+'/assets/css/local-fonts.css']){
    const result=await preview(page('Public content','<link rel="stylesheet" href="'+path+'"><style>.preserved{color:red}</style>'));
    assert.equal(result.reads.length,0);assert.match(result.html,/\.preserved/);assert.doesNotMatch(result.html,/local-fonts|@font-face/);assert.match(result.html,/font-src 'none'/);
  }
});
test('CMS preview embeds hashed CSS and public raster bytes in exact head/body order',async()=>{
  const bytes=Buffer.from('.hashed{background:url(/assets/img/a.png)}'),hex=createHash('sha256').update(bytes).digest('hex'),sri='sha256-'+createHash('sha256').update(bytes).digest('base64'),path='/assets/releases/'+hex+'/assets/css/resources.css';
  const result=await preview(page('<img src="/assets/img/a.png"><style>.inner{color:red}</style>','<style>.first{color:red}</style><link rel="stylesheet" href="'+path+'" integrity="'+sri+'"><style>.third{color:blue}</style>','<link rel="stylesheet" href="/assets/css/public-motion.css">'),{[path]:bytes,'/assets/css/public-motion.css':Buffer.from('.last{color:green}'),'/assets/img/a.png':png});
  for(const [a,b] of [['.first','.hashed'],['.hashed','.third'],['.third','.inner'],['.inner','.last']])assert.ok(result.html.indexOf(a)<result.html.indexOf(b));
  assert.equal(result.observations.styles,5);assert.equal(result.observations.images,1);assert.equal(result.reads.filter(row=>row.path.endsWith('.png')).length,1);
  assert.match(result.html,/data:image\/png;base64,/);assert.doesNotMatch(result.html,/<link|href="\/assets/);
});
test('CMS preview strips external references, font imports, network and active elements',async()=>{
  const source=page('<img src="https://external.invalid/a.png" srcset="https://external.invalid/b.png" onerror="bad()"><form><input></form><iframe srcdoc="bad"></iframe><script>bad()</script><template><script>bad()</script></template><a href="https://external.invalid" ping="https://external.invalid">Go</a><button onclick="bad()">Save</button><svg><image href="https://external.invalid/a.png"></image><foreignObject>bad</foreignObject><animate></animate></svg>','<link rel="stylesheet" href="https://external.invalid/a.css"><style>@import "https://external.invalid/b.css";@font-face{font-family:x;src:url(https://external.invalid/x.woff2)}.safe{background:url(https://external.invalid/a.png)}</style>');
  const result=await preview(source);assert.equal(result.reads.length,0);
  assert.doesNotMatch(result.html,/external.invalid|<script|<form|<iframe|<template|onerror|onclick|srcset|ping=|@font-face|@import|foreignObject|<animate/);
  assert.match(result.html,/connect-src 'none'/);assert.match(result.html,/font-src 'none'/);assert.match(result.html,/<button[^>]*disabled/);assert.match(result.html,/<a[^>]*href="#"[^>]*tabindex="-1"/);
});
test('CMS preview retains noscript style positions and media constraints',async()=>{
  const {html}=await preview(page('<p>body</p>','<style>.one{color:red}</style><noscript><style media="(max-width:400px)">.two{color:blue}</style></noscript><style>.three{color:green}</style>'));
  assert.ok(html.indexOf('.one')<html.indexOf('.two')&&html.indexOf('.two')<html.indexOf('.three'));assert.match(html,/media="\(max-width:400px\)"/);
});
test('CMS preview preserves parsed supports fallbacks and discards invalid standalone declarations',async()=>{
  const {html,observations}=await preview(page('x','<style>.x{padding:10px 0;16px}@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.x{background:white}}</style>'));
  assert.match(html,/padding:10px 0/);assert.doesNotMatch(html,/;16px/);assert.match(html,/@supports not/);assert.match(html,/background:white/);assert.equal(observations.discardedSyntaxNodes,1);
});
test('CMS preview rejects malformed CSS and unsupported executable or ambiguous values',async()=>{
  for(const value of ['.x{color:???}','.x{width:expression(bad())}','.x{background:image-set(url(/assets/img/a.png) 1x)}','.x{--injection:???}'])await assert.rejects(preview(page('x','<style>'+value+'</style>')),/validation failed/);
});
test('CMS preview rejects forged fingerprints and integrity even for existing asset paths',async()=>{
  const path='/assets/releases/'+'0'.repeat(64)+'/assets/css/resources.css';await assert.rejects(preview(page('x','<link rel="stylesheet" href="'+path+'" integrity="sha256-bad">'),{[path]:Buffer.from('.x{color:red}')}),/validation failed/);
  await assert.rejects(preview(page('x','<link rel="stylesheet" href="/assets/css/resources.css" integrity="sha256-bad">'),{'/assets/css/resources.css':Buffer.from('.x{color:red}')}),/validation failed/);
});
test('CMS preview refuses private paths, traversal, encoded names, query and non-raster signatures',async()=>{
  for(const path of ['/var/private.png','/assets/../assets/img/a.png','/assets/img/%61.png','/assets/img/a.png?private=1','/assets/img/a.png#private','/assets/img/a.svg'])await assert.rejects(preview(page('<img src="'+path+'">')),/validation failed/);
  await assert.rejects(preview(page('<img src="/assets/img/a.jpg">'),{'/assets/img/a.jpg':Buffer.from('%PDF-1.7\nprivate bytes')}),/validation failed/);
});
test('CMS preview retains legacy public raster bytes with their true MIME instead of rewriting originals',async()=>{
  const result=await preview(page('<img src="/assets/img/a.jpg">'),{'/assets/img/a.jpg':png});assert.match(result.html,/data:image\/png;base64,/);assert.equal(result.observations.legacyImageExtensions,1);
});
test('CMS preview enforces HTML, CSS, image and aggregate resource budgets',async()=>{
  await assert.rejects(preview('x'.repeat(previewLimits.html+1)),/validation failed/);
  await assert.rejects(preview(page('x','<style>'+'.x{color:red}'.repeat(50000)+'</style>')),/validation failed/);
  await assert.rejects(preview(page('<img src="/assets/img/a.png">'),{'/assets/img/a.png':Buffer.concat([png,Buffer.alloc(previewLimits.image)])}),/validation failed/);
  const assets={},names=[];for(let i=0;i<=previewLimits.images;i++){const path='/assets/img/a'+i+'.png';assets[path]=png;names.push('<img src="'+path+'">');}await assert.rejects(preview(page(names.join('')),assets),/validation failed/);
  const big=Buffer.concat([png,Buffer.alloc(1800000)]),total={};for(let i=0;i<5;i++)total['/assets/img/b'+i+'.png']=big;
  await assert.rejects(preview(page(Object.keys(total).map(path=>'<img src="'+path+'">').join('')),total),/validation failed/);
});
test('CMS preview validates page identity, language and local asset reader failures',async()=>{
  for(const source of ['<html lang="zh"><head></head><body></body></html>',page('x').replace('lang="zh"','lang="xx"'),page('<div id="page-resource-detail"></div>')])await assert.rejects(preview(source),/validation failed/);
  await assert.rejects(preview(page('<img src="/assets/img/missing.png">')),/Unexpected asset/);
});
