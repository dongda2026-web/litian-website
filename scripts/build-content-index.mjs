import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const contentDir = join(root, "content");

async function readJson(fileName) {
  return JSON.parse(await readFile(join(contentDir, fileName), "utf8"));
}

function compact(value) {
  return [...new Set(value.filter(Boolean).map(item => String(item).trim()).filter(Boolean))];
}

function localizedText(value, fallback = "") {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return fallback;
  return value.en || value.zh || value.ru || fallback;
}

const settings = await readJson("site-settings.json");
const products = await readJson("products.json");
const company = await readJson("company.json");
const news = await readJson("news.json");

const records = [];

for (const product of products) {
  records.push({
    type: "product",
    id: `product:${product.id}`,
    slug: `products#${product.id}`,
    title: product.name,
    summary: product.summary,
    image: product.image,
    keywords: compact([
      product.code,
      ...(product.industries || []),
      ...(product.specs || [])
    ])
  });
}

for (const item of news.filter(entry => entry.status === "published")) {
  records.push({
    type: "news",
    id: `news:${item.id}`,
    slug: `news#${item.id}`,
    title: { en: item.title },
    summary: { en: item.summary },
    keywords: compact([item.category, item.date])
  });
}

for (const base of company.bases) {
  records.push({
    type: "company-base",
    id: `company-base:${base.id}`,
    slug: "about#global-presence",
    title: { en: base.name },
    summary: { en: base.role },
    keywords: compact(["base", "factory", "service", base.name])
  });
}

for (const item of company.journey) {
  records.push({
    type: "company-journey",
    id: `company-journey:${item.year}`,
    slug: "about#timeline",
    title: { en: `${item.year} ${item.title}` },
    summary: { en: item.summary },
    keywords: compact(["history", "journey", item.year])
  });
}

const index = {
  schemaVersion: "2026-10-02",
  site: {
    name: settings.brand.name,
    legalName: settings.brand.legalName,
    canonical: settings.seo.canonical,
    targetHosting: settings.deployment.target
  },
  contacts: settings.contacts,
  counts: {
    products: products.length,
    news: news.filter(entry => entry.status === "published").length,
    companyBases: company.bases.length,
    companyJourney: company.journey.length,
    records: records.length
  },
  records: records.map(record => ({
    ...record,
    titleText: localizedText(record.title),
    summaryText: localizedText(record.summary)
  }))
};

await writeFile(join(contentDir, "content-index.json"), `${JSON.stringify(index, null, 2)}\n`);

console.log(`Content index built with ${index.counts.records} records.`);
