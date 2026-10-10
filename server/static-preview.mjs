import { readFile, stat, realpath } from 'node:fs/promises';
import { resolve, sep, extname, dirname } from 'node:path';
import {promisify} from 'node:util';
import {gzip,brotliCompress,deflate} from 'node:zlib';
import {cacheControl,preferredEncoding} from '../scripts/static-delivery-core.mjs';

const compressors={gzip:promisify(gzip),br:promisify(brotliCompress),deflate:promisify(deflate)};

const types = {'.html':'text/html; charset=utf-8','.json':'application/json','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.mp4':'video/mp4','.ico':'image/x-icon','.woff2':'font/woff2','.xml':'application/xml','.txt':'text/plain; charset=utf-8'};
export function staticPreview(root, transformHtml = data => data, options = {}) {
  root = resolve(root);
  const delivery=options.delivery===true,immutable=delivery?Object.freeze([...options.immutablePaths]):[];
  return async (request, response) => {
    if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405, {Allow:'GET, HEAD'}); response.end(); return; }
    try {
      if (!request.url.startsWith('/') || request.url.startsWith('//') || request.url.length > 4096) throw new Error('Invalid path');
      const url = new URL(request.url, 'http://preview.local');
      const path = decodeURIComponent(url.pathname);
      if (path.includes('\\') || /[\u0000-\u001f]/.test(path) || path.split('/').some(part => part.startsWith('.'))) throw new Error('Invalid path');
      let file = resolve(root, '.' + path);
      if (file !== root && !file.startsWith(root + sep)) throw new Error('Invalid path');
      const info = await stat(file);
      if (info.isDirectory()) {
        if (!url.pathname.endsWith('/')) { response.writeHead(301, {Location:url.pathname+'/'+url.search}); response.end(); return; }
        file = resolve(file, 'index.html');
      } else if (path.endsWith('/index.html') && path !== '/index.html') {
        response.writeHead(301, {Location:dirname(url.pathname)+'/'+url.search}); response.end(); return;
      }
      const canonicalFile = await realpath(file), canonicalRoot = await realpath(root);
      if (!canonicalFile.startsWith(canonicalRoot + sep) || !(await stat(file)).isFile()) throw new Error('Invalid path');
      let data = await readFile(file);
      if (file.endsWith('.html')) data = Buffer.from(transformHtml(data.toString()));
      const headers={'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':delivery?cacheControl(path,200,immutable):'no-store','X-Content-Type-Options':'nosniff'};
      if(delivery){
        if(/^text\/|^application\/(?:json|xml)$/.test(headers['Content-Type'])&&data.length<=4*1024*1024){
          headers.Vary='Accept-Encoding';const encoding=preferredEncoding(request.headers['accept-encoding']);
          if(encoding==='unacceptable'){response.writeHead(406,{'Cache-Control':'no-store',Vary:'Accept-Encoding'});response.end();return;}
          if(encoding!=='identity'){data=await compressors[encoding](data);headers['Content-Encoding']=encoding;}
        }
        headers['Content-Length']=data.length;
        if(path.startsWith('/assets/documents/'))headers['X-Robots-Tag']='noindex';
      }
      response.writeHead(200, headers);
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch {
      let html; try { html = await readFile(resolve(root, '404.html')); } catch { html = 'Not found'; }
      response.writeHead(404, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      response.end(request.method === 'HEAD' ? undefined : html);
    }
  };
}
