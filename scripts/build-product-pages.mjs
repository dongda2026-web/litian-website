import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, parseFragment, serialize } from 'parse5';
import '../assets/js/catalog-core.js';
import '../assets/js/catalog-copy.js';
import '../assets/js/product-inspection-core.js';
import '../assets/js/product-page-core.js';

export function nodes(root, predicate) {
  const found = [];
  function visit(node) { if (predicate(node)) found.push(node); for (const child of node.childNodes || []) visit(child); }
  visit(root);
  return found;
}
export const attribute = (node, name) => node?.attrs?.find(item => item.name === name)?.value;
export function setAttribute(node, name, value) {
  const attr = node.attrs.find(item => item.name === name);
  if (attr) attr.value = value; else node.attrs.push({ name, value });
}
export function inner(node, html) {
  node.childNodes = parseFragment(node, html).childNodes;
  for (const child of node.childNodes) child.parentNode = node;
}
export function plainText(node) { return node.nodeName === '#text' ? node.value : (node.childNodes || []).map(plainText).join(''); }
function text(node, value) { inner(node, globalThis.DongDaProductPage.escape(value)); }
function append(node, html) { for (const child of parseFragment(html).childNodes) { child.parentNode = node; node.childNodes.push(child); } }
function meta(head, key, value, property = false) {
  const kind = property ? 'property' : 'name';
  const existing = nodes(head, n => n.tagName === 'meta' && attribute(n, kind) === key)[0];
  if (value === null) { if (existing) head.childNodes = head.childNodes.filter(n => n !== existing); return; }
  if (existing) setAttribute(existing, 'content', value);
  else append(head, `<meta ${kind}="${key}" content="${globalThis.DongDaProductPage.escape(value)}">`);
}
const labels = {
  en: {bc_home:'Home',bc_prod:'Products',n_co:'Company',n_prod:'Products',n_sus:'Sustainability',n_news:'Insights',n_fac:'Factory',n_inq:'Inquiry',n_quote:'Get Quote',pd_spec:'Specifications',pd_app:'Applications',pd_proc:'Manufacturing',rel_e:'Related Products',rel_h:'You May Also Need'},
  zh: {bc_home:'首页',bc_prod:'产品',n_co:'公司',n_prod:'产品',n_sus:'可持续发展',n_news:'资讯',n_fac:'工厂',n_inq:'询价',n_quote:'获取报价',pd_spec:'技术参数',pd_app:'应用方向',pd_proc:'生产确认',rel_e:'相关产品',rel_h:'您可能还需要'},
  ru: {bc_home:'Главная',bc_prod:'Продукция',n_co:'Компания',n_prod:'Продукция',n_sus:'Устойчивое развитие',n_news:'Новости',n_fac:'Завод',n_inq:'Запрос',n_quote:'Запросить цену',pd_spec:'Характеристики',pd_app:'Применение',pd_proc:'Производство',rel_e:'Другие серии',rel_h:'Вам также может понадобиться'}
};

export function localizeDocument(document, locale) {
  for (const node of nodes(document, n => attribute(n, 'data-i') in labels[locale])) text(node, labels[locale][attribute(node, 'data-i')]);
  const languageButton = nodes(document, n => attribute(n, 'id') === 'nav-lang-btn')[0];
  if (languageButton) text(languageButton, {en:'EN',zh:'中',ru:'RU'}[locale]);
}

export function applyDocumentSeo(document, info, schemaId, defaultHref, type = 'website') {
  const head = nodes(document, n => n.tagName === 'head')[0];
  setAttribute(nodes(document, n => n.tagName === 'html')[0], 'lang', info.language);
  text(nodes(head, n => n.tagName === 'title')[0], info.title);
  meta(head, 'description', info.description); meta(head, 'robots', info.robots);
  for (const key of ['title','description','url','locale','image']) meta(head, 'og:' + key, key === 'url' ? info.canonical : info[key], true);
  meta(head, 'og:type', type, true);
  for (const key of ['title','description','image']) meta(head, 'twitter:' + key, info[key]);
  meta(head, 'twitter:card', info.image ? 'summary_large_image' : 'summary');
  setAttribute(nodes(head, n => n.tagName === 'link' && attribute(n, 'rel') === 'canonical')[0], 'href', info.canonical);
  for (const item of info.alternates.concat({language:'x-default',href:defaultHref})) append(head, `<link rel="alternate" hreflang="${item.language}" href="${item.href}" data-product-alternate>`);
  append(head, `<script type="application/ld+json" id="${schemaId}">${JSON.stringify(info.schema).replace(/</g, '\\u003c')}</script>`);
}

export function renderProductDocument(source, product, locale, publicationOrigin) {
  const core = globalThis.DongDaProductPage, catalog = globalThis.DongDaCatalog;
  const document = parse(source), head = nodes(document, n => n.tagName === 'head')[0];
  const byId = id => { const node = nodes(document, n => attribute(n, 'id') === id)[0]; if (!node) throw new TypeError(`Missing product hook: ${id}`); return node; };
  const info = core.metadata(product, locale, publicationOrigin), content = core.sections(product, locale);
  applyDocumentSeo(document, info, 'product-seo', core.origin(publicationOrigin)+core.path(product,'en'), 'product');
  append(head, '<noscript><style>#pageLoader{display:none}#pd-apps,#pd-proc{display:block!important}#page-product-detail .pd-tabs{display:none}</style></noscript>');
  for (const node of nodes(document, n => (attribute(n, 'class') || '').split(' ').includes('page'))) setAttribute(node, 'class', 'page');
  setAttribute(byId('page-product-detail'), 'class', 'page on');
  setAttribute(byId('pageLoader'), 'class', 'page-loader hide');
  text(byId('pd-name'), catalog.localized(product.name, locale)); text(byId('pd-code'), product.code); text(byId('pd-desc'), catalog.localized(product.summary, locale));
  setAttribute(byId('pd-hero'), 'style', `background-color:#364f56;background-image:${product.mediaRole === 'production-reference' ? 'none' : `url('/${product.image}')`}`);
  for (const [id, field] of Object.entries({'pd-specs':'specs','pd-apps':'applications','pd-proc':'production','pd-aside':'aside','pd-media':'media','pd-support':'support'})) inner(byId(id), content[field]);
  localizeDocument(document, locale);
  for (const node of nodes(document, n => attribute(n, 'data-product-link'))) {
    const id = attribute(node, 'data-product-link');
    if (id === product.id) text(node, catalog.localized(product.name, locale));
  }
  return serialize(document);
}

export async function buildProductPages({ root, client }) {
  const core = globalThis.DongDaProductPage;
  const source = await readFile(join(root, 'index.html'), 'utf8');
  const catalog = globalThis.DongDaCatalog.create(JSON.parse(await readFile(join(root, 'content/products.json'), 'utf8')));
  const settings = JSON.parse(await readFile(join(root, 'content/site-settings.json'), 'utf8'));
  const base = core.origin(settings.seo.canonical), routes = [], redirects = [];
  for (const product of catalog.search({})) for (const locale of core.languages) {
    const path = core.path(product, locale), info = core.metadata(product, locale, base);
    const directory = join(client, path);
    await mkdir(directory, { recursive: true });
    let html = renderProductDocument(source, product, locale, base);
    const document = parse(html);
    const related = nodes(document, n => attribute(n, 'id') === 'rel-grid')[0];
    inner(related, catalog.search({}).filter(other=>other.id!==product.id).slice(0,3).map(other=>'<article class="pl2 catalog-product">'+core.card(other,locale)+'</article>').join(''));
    for (const node of nodes(document, n => attribute(n, 'data-product-link'))) {
      const other = catalog.resolve(attribute(node, 'data-product-link'));
      if (other?.kind === 'product') { setAttribute(node, 'href', core.path(other, locale)); text(node, globalThis.DongDaCatalog.localized(other.name, locale)); }
    }
    await writeFile(join(directory, 'index.html'), serialize(document));
    routes.push({ path, productId: product.id, language: locale, indexable: info.robots === 'index,follow' });
    redirects.push(`${path.slice(0,-1)} ${path} 301`, `${path}index.html ${path} 301`);
  }
  const rootDocument = parse(source);
  for (const node of nodes(rootDocument, n => attribute(n, 'data-product-link'))) {
    const product = catalog.resolve(attribute(node, 'data-product-link'));
    if (product?.kind === 'product') setAttribute(node, 'href', core.path(product, 'en'));
  }
  await writeFile(join(client, 'index.html'), serialize(rootDocument));
  await writeFile(join(client, 'content/product-routes.json'), JSON.stringify({version:'2026.10.08-pages-v1',origin:base,routes}, null, 2) + '\n');
  const sitemap = '<url><loc>' + base + '/</loc></url>' + routes.filter(r => r.indexable).map(r => '<url><loc>' + base + r.path + '</loc>' + core.languages.map(l => '<xhtml:link rel="alternate" hreflang="' + l + '" href="' + base + core.path(catalog.resolve(r.productId), l) + '"/>').join('') + '</url>').join('');
  await writeFile(join(client, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">' + sitemap + '</urlset>\n');
  await writeFile(join(client, 'robots.txt'), 'User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ' + base + '/sitemap.xml\n');
  await writeFile(join(client, '_redirects'), redirects.join('\n') + '\n/* /404.html 404\n');
  const manifest = JSON.parse(await readFile(join(client, 'site-manifest.json'), 'utf8'));
  manifest.site_url = base; manifest.pages = ['index.html',...routes.map(r => r.path.slice(1)+'index.html')]; manifest.build_version = '2026.10.08-pages-v1';
  await writeFile(join(client, 'site-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  process.stdout.write(`Product pages: ${routes.length} localized HTML routes; ${routes.filter(r=>r.indexable).length} indexable product URLs.\n`);
  return routes;
}
