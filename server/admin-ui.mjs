import { readFile } from 'node:fs/promises';

const files = new Map([
  ['/admin', ['index.html', 'text/html; charset=utf-8']],
  ['/admin/', ['index.html', 'text/html; charset=utf-8']],
  ['/admin/workspace.css', ['workspace.css', 'text/css; charset=utf-8']],
  ['/admin/workspace.js', ['workspace.js', 'text/javascript; charset=utf-8']],
  ['/admin/icons.json', ['icons.json', 'application/json; charset=utf-8']],
  ['/admin/logo.png', ['../../assets/img/logo_dongda_official.png', 'image/png']]
]);

export async function serveAdminUi(request, response, path) {
  if (path !== '/admin' && !path.startsWith('/admin/')) return false;
  const item = files.get(path);
  const headers = {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow'
  };
  if (!item || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(item ? 405 : 404, headers); response.end('Not found'); return true;
  }
  try {
    const bytes = await readFile(new URL('./admin-ui/' + item[0], import.meta.url));
    response.writeHead(200, { ...headers, 'Content-Type': item[1] });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch { response.writeHead(503, headers); response.end('Service unavailable'); }
  return true;
}
