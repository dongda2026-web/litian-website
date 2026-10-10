import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import './build-catalog.mjs';
import './build-content-index.mjs';
import { buildProductPages } from './build-product-pages.mjs';
import { buildIndustryPages } from './build-industry-pages.mjs';
import { buildResourcePages } from './build-resource-pages.mjs';
import { buildInsightPages } from './build-insight-pages.mjs';
import { buildSiteSearchPages } from './build-site-search-pages.mjs';
import { buildPublicAccessibility } from './build-public-accessibility.mjs';
import { buildFaqPages } from './build-faq-pages.mjs';
import { buildSelectionPages } from './build-selection-pages.mjs';
import './build-company-data.mjs';
import { buildCompanyPages } from './build-company-pages.mjs';
import { buildHomeProcurement } from './build-home-procurement.mjs';
import { buildPublicProcurement } from './build-public-procurement.mjs';
import { buildStorageNotice } from './build-storage-notice.mjs';
import { buildFormFeedback } from './build-form-feedback.mjs';
import { buildLeadStatus } from './build-lead-status.mjs';
import { buildPublicMotion } from './build-public-motion.mjs';
import { buildPublicationReview } from './build-publication-review.mjs';
import { buildStaticDelivery } from './build-static-delivery.mjs';
import { cacheControl } from './static-delivery-core.mjs';
import {loadFontDelivery,fontDeliveryVersion} from './font-delivery.mjs';
import '../assets/js/procurement-core.js';

const root = process.cwd();
const dist = join(root, "dist");
const client = join(dist, "client");
const server = join(dist, "server");

await rm(dist, { recursive: true, force: true });
await mkdir(client, { recursive: true });
await mkdir(server, { recursive: true });
await mkdir(join(dist, ".openai"), { recursive: true });

for (const item of [
  "index.html",
  "404.html",
  "assets",
  "public",
  "_headers",
  "_redirects",
  "robots.txt",
  "sitemap.xml",
  "site-manifest.json",
  "DEPLOYMENT.md",
  "ALIYUN_DEPLOYMENT.md",
  "ALIYUN_DYNAMIC_API.md",
  "workers"
]) {
  await cp(join(root, item), join(client, item), { recursive: true });
}
// Legacy "published" is not a reviewed publication grant. Keep it in private source only.
await cp(join(root,'content'),join(client,'content'),{recursive:true,filter:path=>path!==join(root,'content','news.json')&&!path.startsWith(join(root,'content','private-review'))});
await writeFile(join(client,'content/news.json'),'[]\n');

await cp(join(root, "assets", "img"), join(client, "img"), { recursive: true });
await cp(join(root, "assets", "manifest.json"), join(client, "manifest.json"));
await cp(join(root, ".openai", "hosting.json"), join(dist, ".openai", "hosting.json"));
const productRoutes = await buildProductPages({ root, client });
const industryRoutes = await buildIndustryPages({ root, client, productRoutes });
const resourceRoutes = await buildResourcePages({ root, client, existingRoutes:[...productRoutes,...industryRoutes] });
const insightRoutes = await buildInsightPages({ root, client, existingRoutes:[...productRoutes,...industryRoutes,...resourceRoutes] });
const searchRoutes = await buildSiteSearchPages({ root, client, existingRoutes:[...productRoutes,...industryRoutes,...resourceRoutes,...insightRoutes] });
await buildPublicAccessibility({client,routes:[...productRoutes,...industryRoutes,...resourceRoutes,...insightRoutes,...searchRoutes]});
const faqRoutes=await buildFaqPages({root,client,existingRoutes:[...productRoutes,...industryRoutes,...resourceRoutes,...insightRoutes,...searchRoutes]});
const selectionRoutes=await buildSelectionPages({root,client,existingRoutes:[...productRoutes,...industryRoutes,...resourceRoutes,...insightRoutes,...searchRoutes,...faqRoutes]});
const companyRoutes=await buildCompanyPages({root,client,existingRoutes:[...productRoutes,...industryRoutes,...resourceRoutes,...insightRoutes,...searchRoutes,...faqRoutes,...selectionRoutes]});
const publicRoutes=[...productRoutes,...industryRoutes,...resourceRoutes,...insightRoutes,...searchRoutes,...faqRoutes,...selectionRoutes,...companyRoutes];
await buildHomeProcurement({root,client,routes:publicRoutes});
await buildPublicProcurement({root,client,routes:publicRoutes});
await buildStorageNotice({client,routes:publicRoutes});
await buildFormFeedback({client});
await buildLeadStatus({client});
await buildPublicMotion({client});
const retryManifestPath=join(client,'site-manifest.json');
const retryManifest=JSON.parse(await readFile(retryManifestPath,'utf8'));
retryManifest.inquiry_retry_version=globalThis.DongDaProcurement.retryVersion;
await writeFile(retryManifestPath,JSON.stringify(retryManifest,null,2)+'\n');
await buildPublicationReview({root,client,routes:publicRoutes});
const fonts=await loadFontDelivery(client);
const fontSite=JSON.parse(await readFile(join(client,'site-manifest.json'),'utf8'));fontSite.font_delivery_version=fontDeliveryVersion;
await writeFile(join(client,'site-manifest.json'),JSON.stringify(fontSite,null,2)+'\n');
const assetFileData=await buildStaticDelivery({client});
const resourceFileData=JSON.parse(await readFile(join(client,'content/resource-files.json'),'utf8'));

await writeFile(join(server, "index.js"), `
const cacheControl=${cacheControl.toString()};
const immutable=${JSON.stringify([...assetFileData.files.map(file=>file.path),...resourceFileData.files.map(file=>file.path),...fonts.immutablePaths])};
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", {status:405,headers:{Allow:"GET, HEAD"}});
    const routes = ${JSON.stringify(publicRoutes.map(r=>r.path))};
    if (routes.includes(url.pathname + "/") || routes.some(path => url.pathname === path + "index.html")) {
      url.pathname = url.pathname.endsWith("index.html") ? url.pathname.slice(0,-10) : url.pathname + "/";
      return Response.redirect(url.toString(), 301);
    }
    const assetUrl = new URL(url);
    if (url.pathname === "/" || routes.includes(url.pathname)) assetUrl.pathname += "index.html";
    const response = await env.ASSETS.fetch(new Request(assetUrl, request));
    if (response.status !== 404) {
      const headers = new Headers(response.headers);
      headers.set('Cache-Control',cacheControl(url.pathname,response.status,immutable));
      if(${JSON.stringify([...resourceFileData.files.map(file=>file.path),...resourceFileData.files.map(file=>file.legacyPath)])}.includes(url.pathname)){headers.set('Content-Type','text/plain; charset=utf-8');headers.set('X-Robots-Tag','noindex');}
      return new Response(response.body,{status:response.status,headers});
    }
    const notFound = await env.ASSETS.fetch(new Request(new URL("/404.html", url), request));
    const headers=new Headers(notFound.headers);headers.set('Cache-Control','no-store');
    return new Response(notFound.body, {status:404,headers});
  }
};
`.trimStart());

console.log("Sites build created at dist/");
