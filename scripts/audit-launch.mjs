import { access, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const client = join(root, "dist", "client");
const failures = [];

function fail(message) {
  failures.push(message);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function check(condition, message) {
  if (!condition) fail(message);
}

const requiredFiles = [
  "index.html",
  "_headers",
  "_redirects",
  "manifest.json",
  "assets/manifest.json",
  "robots.txt",
  "sitemap.xml",
  "content/content-index.json",
  "content/site-settings.json",
  "content/products.json",
  "content/company.json",
  "content/news.json",
  "content/runtime-config.json",
  "content/inquiry-schema.json",
  "ALIYUN_DEPLOYMENT.md",
  "ALIYUN_DYNAMIC_API.md",
  "assets/img/logo_dongda_official.png",
  "assets/img/logo_litian.png",
  "assets/img/icons/icon-192.png",
  "assets/img/icons/icon-512.png",
  "img/logo_dongda_official.png",
  "img/logo_litian.png",
  "img/icons/icon-192.png"
];

for (const file of requiredFiles) {
  check(await exists(join(client, file)), `Missing build file: ${file}`);
}

const html = await readFile(join(client, "index.html"), "utf8");
const headers = await readFile(join(client, "_headers"), "utf8");

check(!/<img\b[^>]*\bsrc=""/.test(html), "Blank image src found");
check(!/https:\/\/(instagram|facebook|linkedin)\.com\/?["']/.test(html), "Generic social homepage link found");
check(html.includes("wa.me/77075590188"), "WhatsApp link missing international number");
check(html.includes("DongDa"), "DongDa brand name missing");
check(html.includes("assets/img/logo_dongda_official.png"), "DongDa official logo missing");
check(html.includes("content/runtime-config.json"), "Runtime config loader missing");
check(html.includes("product-sheet"), "Product detail sheet missing");
check(html.includes("lead-status"), "Inquiry lead status UI missing");
check(html.includes("fi_hp"), "Inquiry spam honeypot field missing");
check(html.includes("leadId"), "Inquiry lead reference id missing");
check(html.includes("8 707 559 0188"), "Display phone number missing");
check(html.includes("rel=\"canonical\""), "Canonical link missing");
check(html.includes("application/ld+json"), "Organization JSON-LD missing");
check(html.includes("rel=\"icon\""), "Favicon link missing");
check(html.includes("openLegalModal"), "Legal modal handler missing");
check(headers.includes("Content-Security-Policy"), "CSP header missing");
check(headers.includes("https://fonts.googleapis.com"), "CSP does not allow Google Fonts CSS");
check(headers.includes("https://fonts.gstatic.com"), "CSP does not allow Google Fonts files");

const scripts = [...html.matchAll(/<script(?![^>]+application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .filter(Boolean);
for (let index = 0; index < scripts.length; index += 1) {
  try {
    new Function(scripts[index]);
  } catch (error) {
    fail(`Inline script ${index} failed to parse: ${error.message}`);
  }
}

const refs = new Set();
for (const regex of [/\b(?:src|href)=['"]([^'"]+)['"]/g, /url\(['"]?([^)'"#]+)['"]?\)/g]) {
  for (const match of html.matchAll(regex)) {
    const value = match[1];
    if (!value) continue;
    if (/^(data:|#|mailto:|tel:|javascript:|https?:)/.test(value)) continue;
    if (/[+{}()]/.test(value)) continue;
    refs.add(value.split("#")[0]);
  }
}

for (const ref of refs) {
  if (!(await exists(join(client, ref)))) {
    fail(`Missing local asset reference: ${ref}`);
  }
}

for (const image of ["assets/img/factory_panorama.jpg", "assets/img/promo.mp4"]) {
  const info = await stat(join(client, image));
  check(info.size > 1024, `Suspiciously small asset: ${image}`);
}

if (failures.length) {
  console.error("Launch audit failed:");
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log("Launch audit passed.");
