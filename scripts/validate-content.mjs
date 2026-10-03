import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(join(root, relativePath), "utf8"));
  } catch (error) {
    fail(`${relativePath}: ${error.message}`);
    return null;
  }
}

async function exists(relativePath) {
  try {
    await access(join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function check(condition, message) {
  if (!condition) fail(message);
}

const settings = await readJson("content/site-settings.json");
const products = await readJson("content/products.json");
const company = await readJson("content/company.json");
const news = await readJson("content/news.json");
const contentIndex = await readJson("content/content-index.json");
const runtimeConfig = await readJson("content/runtime-config.json");
const inquirySchema = await readJson("content/inquiry-schema.json");

if (settings) {
  check(hasText(settings.brand?.name), "site-settings brand.name is required");
  check(hasText(settings.contacts?.salesEmail), "site-settings contacts.salesEmail is required");
  check(/^https:\/\/wa\.me\/\d+/.test(settings.contacts?.whatsappLink || ""), "site-settings contacts.whatsappLink must use wa.me international format");
  check(settings.deployment?.webRoot === "dist/client", "site-settings deployment.webRoot must be dist/client");
}

if (Array.isArray(products)) {
  const ids = new Set();
  for (const product of products) {
    check(hasText(product.id), "product.id is required");
    check(!ids.has(product.id), `duplicate product id: ${product.id}`);
    ids.add(product.id);
    check(hasText(product.name?.en), `${product.id}: English name is required`);
    check(hasText(product.summary?.en), `${product.id}: English summary is required`);
    check(Array.isArray(product.specs) && product.specs.length > 0, `${product.id}: specs are required`);
    check(hasText(product.image), `${product.id}: image is required`);
    if (hasText(product.image)) {
      check(await exists(product.image), `${product.id}: missing image ${product.image}`);
    }
  }
} else if (products !== null) {
  fail("content/products.json must be an array");
}

if (company) {
  check(Array.isArray(company.facts) && company.facts.length >= 4, "company.facts must include at least four facts");
  check(Array.isArray(company.bases) && company.bases.length >= 3, "company.bases must include the main operating bases");
  check(Array.isArray(company.journey) && company.journey.length >= 4, "company.journey must include history milestones");
}

if (Array.isArray(news)) {
  const ids = new Set();
  for (const item of news) {
    check(hasText(item.id), "news.id is required");
    check(!ids.has(item.id), `duplicate news id: ${item.id}`);
    ids.add(item.id);
    check(hasText(item.title), `${item.id}: title is required`);
    check(hasText(item.date), `${item.id}: date is required`);
    check(item.status === "published" || item.status === "draft", `${item.id}: status must be published or draft`);
  }
} else if (news !== null) {
  fail("content/news.json must be an array");
}

if (contentIndex) {
  check(contentIndex.schemaVersion === "2026-10-02", "content-index schemaVersion must be 2026-10-02");
  check(Array.isArray(contentIndex.records), "content-index records must be an array");
  const productRecords = contentIndex.records?.filter(record => record.type === "product") || [];
  const newsRecords = contentIndex.records?.filter(record => record.type === "news") || [];
  check(productRecords.length === (Array.isArray(products) ? products.length : 0), "content-index product count must match products.json");
  check(newsRecords.length === (Array.isArray(news) ? news.filter(item => item.status === "published").length : 0), "content-index news count must match published news");
  for (const record of contentIndex.records || []) {
    check(hasText(record.id), "content-index record.id is required");
    check(hasText(record.type), `${record.id || "record"}: type is required`);
    check(hasText(record.slug), `${record.id || "record"}: slug is required`);
    check(hasText(record.titleText), `${record.id || "record"}: titleText is required`);
    check(hasText(record.summaryText), `${record.id || "record"}: summaryText is required`);
  }
}

if (runtimeConfig) {
  check(runtimeConfig.schemaVersion === "2026-10-02", "runtime-config schemaVersion must be 2026-10-02");
  check(runtimeConfig.mode === "static" || runtimeConfig.mode === "dynamic", "runtime-config mode must be static or dynamic");
  check(runtimeConfig.endpoints && typeof runtimeConfig.endpoints === "object", "runtime-config endpoints are required");
  for (const [key, value] of Object.entries(runtimeConfig.endpoints || {})) {
    check(typeof value === "string", `runtime-config endpoint ${key} must be a string`);
    check(!/(api[_-]?key|token|password|secret)=/i.test(value), `runtime-config endpoint ${key} must not contain credentials`);
  }
}

if (inquirySchema) {
  check(inquirySchema.schemaVersion === "2026-10-02", "inquiry-schema schemaVersion must be 2026-10-02");
  check(Array.isArray(inquirySchema.leadTypes) && inquirySchema.leadTypes.includes("inquiry"), "inquiry-schema leadTypes must include inquiry");
  check(Array.isArray(inquirySchema.required) && inquirySchema.required.includes("email") && inquirySchema.required.includes("product"), "inquiry-schema required fields must include email and product");
  check(inquirySchema.limits && typeof inquirySchema.limits === "object", "inquiry-schema limits are required");
  for (const [key, value] of Object.entries(inquirySchema.limits || {})) {
    check(Number.isFinite(value) && value > 0, `inquiry-schema limit ${key} must be a positive number`);
  }
  if (settings?.contacts?.salesEmail && inquirySchema.fallback?.salesEmail) {
    check(inquirySchema.fallback.salesEmail === settings.contacts.salesEmail, "inquiry-schema fallback.salesEmail must match site-settings contacts.salesEmail");
  }
}

if (failures.length) {
  console.error("Content validation failed:");
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log("Content validation passed.");
