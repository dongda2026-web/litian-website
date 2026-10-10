import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import '../assets/js/catalog-core.js';
import '../assets/js/catalog-copy.js';
import '../assets/js/product-page-core.js';
import '../assets/js/industry-core.js';
import '../assets/js/insight-core.js';
import '../assets/js/faq-core.js';

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
const insights = globalThis.DongDaInsights.create(await readJson('insights.json'),globalThis.DongDaCatalog.create(products));
const industries = globalThis.DongDaIndustry.create(await readJson('industries.json'),globalThis.DongDaCatalog.create(products));
const faqs=globalThis.DongDaFAQ.create(await readJson('faqs.json'),globalThis.DongDaCatalog.create(products),insights);

const records = [];
for (const entry of industries.entries) {
  records.push({type:'industry',id:'industry:'+entry.id,slug:globalThis.DongDaIndustry.path(entry,'en'),languagePaths:Object.fromEntries(globalThis.DongDaIndustry.languages.map(language=>[language,globalThis.DongDaIndustry.path(entry,language)])),title:entry.name,summary:entry.summary,keywords:entry.productIds,indexable:false});
}

for (const product of products) {
  records.push({
    type: "product",
    id: `product:${product.id}`,
    slug: product.kind === 'technical' ? `/#products` : globalThis.DongDaProductPage.path(product, 'en'),
    languagePaths: product.kind === 'technical' ? {} : Object.fromEntries(globalThis.DongDaProductPage.languages.map(language => [language, globalThis.DongDaProductPage.path(product, language)])),
    title: product.name,
    summary: product.summary,
    image: product.image,
    keywords: compact([
      product.code,
      ...(product.industries || []),
      ...product.specs.flatMap(spec => Object.values(spec.value))
    ])
  });
}

for (const item of insights.entries) {
  records.push({
    type: "insight",
    id: `insight:${item.id}`,
    slug: globalThis.DongDaInsights.path(item,'en'),
    languagePaths: Object.fromEntries(globalThis.DongDaInsights.languages.map(language=>[language,globalThis.DongDaInsights.path(item,language)])),
    title: item.title,
    summary: item.summary,
    keywords: compact([item.topic,...item.productIds]),
    indexable: false,
    reviewStatus: item.reviewStatus
  });
}

for(const entry of faqs.entries)records.push({type:'faq',id:'faq:'+entry.id,slug:globalThis.DongDaFAQ.path('en',entry.id),languagePaths:Object.fromEntries(globalThis.DongDaFAQ.languages.map(locale=>[locale,globalThis.DongDaFAQ.path(locale,entry.id)])),title:entry.question,summary:entry.answer,keywords:entry.productIds,indexable:false,reviewStatus:entry.reviewStatus});

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
    industries: industries.entries.length,
    news: 0,
    insights: insights.entries.length,
    faqs: faqs.entries.length,
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
