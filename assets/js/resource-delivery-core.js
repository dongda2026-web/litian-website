(function (root) {
  'use strict';
  var version='2026.10.09-resource-delivery-v2', maxBytes=128*1024, languages=['en','zh','ru'];
  function exact(value,keys) { return value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).length===keys.length && keys.every(function(key){return Object.hasOwn(value,key);}); }
  function filename(legacy,sha) { return legacy.slice(0,-4)+'-sha256-'+sha+'.txt'; }
  function freeze(value) { if(value && typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value; }
  function create(input,registry) {
    if(!exact(input,['version','files']) || input.version!==version || !Array.isArray(input.files) || input.files.length!==registry.entries.length*3) throw new TypeError('Invalid resource delivery registry');
    var seen=new Set();
    input.files.forEach(function(file){
      if(!exact(file,['path','legacyPath','resourceId','productId','language','version','updatedAt','mediaType','size','sha256'])) throw new TypeError('Invalid resource delivery fields');
      var entry=registry.resolve(file.resourceId), key=file.resourceId+'/'+file.language;
      if(!entry || !languages.includes(file.language) || seen.has(key) || file.productId!==entry.productId || file.version!==entry.version || file.updatedAt!==entry.updatedAt || file.mediaType!=='text/plain; charset=utf-8' || !Number.isSafeInteger(file.size) || file.size<1 || file.size>maxBytes || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new TypeError('Invalid resource delivery binding');
      var legacy=root.DongDaResources.filePath(entry,file.language);
      if(file.legacyPath!==legacy || file.path!==filename(legacy,file.sha256)) throw new TypeError('Invalid resource delivery path');
      seen.add(key);
    });
    var files=freeze(JSON.parse(JSON.stringify(input.files)));
    return Object.freeze({version:version,files:files,resolve:function(id,language){return files.find(function(file){return file.resourceId===id&&file.language===language;})||null;}});
  }
  function failure(code) { var error=new Error('Resource download '+code);error.code=code;return error; }
  async function verifiedBytes(file,registry,options) {
    options=options||{};
    var encoder=options.encoder || (typeof TextEncoder==='function' ? new TextEncoder() : null), crypto=options.crypto || root.crypto;
    if(!encoder || !crypto?.subtle || !file) throw failure('unavailable');
    var entry=registry.resolve(file.resourceId);
    if(!entry || !languages.includes(file.language) || file.path!==filename(root.DongDaResources.filePath(entry,file.language),file.sha256) || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size<1 || file.size>maxBytes || typeof options.fetch!=='function') throw failure('unavailable');
    var expected=encoder.encode(root.DongDaResources.downloadText(entry,file.language,registry));
    if(expected.length!==file.size || expected.length>maxBytes) throw failure('stale');
    var url;try{url=new URL(file.path,options.origin);}catch{throw failure('unavailable');}
    if(url.origin!==options.origin || url.pathname!==file.path || url.search || url.hash || url.username || url.password) throw failure('unavailable');
    var response;
    try { response=await options.fetch(url.href,{method:'GET',credentials:'omit',redirect:'error',cache:'no-store',headers:{Accept:'text/plain'},signal:options.signal}); }
    catch { throw failure(options.signal?.aborted?'cancelled':'network'); }
    if(response.status!==200 || response.redirected || (response.url && response.url!==url.href)) throw failure('status');
    if(!/^text\/plain(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')||'')) throw failure('type');
    // Fetch exposes decoded bytes; compressed Content-Length describes the wire representation.
    var rawEncoding=response.headers.get('content-encoding'),encoding=rawEncoding===null?'identity':rawEncoding.trim().toLowerCase();
    if(!['identity','gzip','br','deflate'].includes(encoding)) throw failure('encoding');
    var advertised=response.headers.get('content-length');
    if(advertised!==null && (!/^\d+$/.test(advertised) || !Number.isSafeInteger(Number(advertised)) || Number(advertised)<1 || (encoding==='identity'?Number(advertised)!==file.size:Number(advertised)>2*maxBytes+1024))) throw failure('size');
    if(!response.body?.getReader) throw failure('unavailable');
    var reader=response.body.getReader(), chunks=[], size=0;
    try {
      while(true){
        if(options.signal?.aborted) throw failure('cancelled');
        var part=await reader.read();if(part.done)break;
        size+=part.value.byteLength;if(size>file.size || size>maxBytes)throw failure('size');chunks.push(part.value);
      }
    } catch(error) { try{await reader.cancel();}catch{}throw error.code?error:failure(options.signal?.aborted?'cancelled':'network'); }
    finally { reader.releaseLock(); }
    if(size!==file.size)throw failure('size');
    var bytes=new Uint8Array(size),offset=0;chunks.forEach(function(chunk){bytes.set(chunk,offset);offset+=chunk.byteLength;});
    var hash;try{hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(function(value){return value.toString(16).padStart(2,'0');}).join('');}catch{throw failure('unavailable');}
    if(options.signal?.aborted)throw failure('cancelled');
    if(hash!==file.sha256)throw failure('integrity');
    if(!bytes.every(function(value,index){return value===expected[index];}))throw failure('stale');
    return bytes;
  }
  root.DongDaResourceDelivery=Object.freeze({version:version,maxBytes:maxBytes,create:create,filename:filename,verifiedBytes:verifiedBytes});
})(globalThis);
