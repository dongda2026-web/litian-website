import '../assets/js/catalog-core.js';
import '../assets/js/industry-core.js';
import '../assets/js/company-core.js';
import '../assets/js/company-profile-core.js';
import '../assets/js/resource-core.js';
import '../assets/js/insight-core.js';
import { createHash } from 'node:crypto';

export const schemaVersion = '2026.10.09-cms-company-v4';
export const editorialSchemaVersion = '2026.10.09-cms-editorial-v3';
export const historySchemaVersion = '2026.10.09-cms-history-v2';
export const legacySchemaVersion = '2026.10.08-cms-v1';
export const languages = ['zh', 'en', 'ru'];
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function digest(value) { return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(canonical(value))).digest('hex'); }
const copy = value => JSON.parse(JSON.stringify(value));
export function editablePaths(kind, record) {
  const paths = [];
  if (kind === 'company-profile') return globalThis.DongDaCompanyProfile.editablePaths();
  if (kind === 'history') return ['title', 'description'].flatMap(field => languages.map(language => `${field}.${language}`));
  if (kind === 'resource') return ['title', 'summary'].flatMap(field => languages.map(language => `${field}.${language}`));
  if (kind === 'resource-field') return ['label', 'hint'].flatMap(field => languages.map(language => `${field}.${language}`));
  if (kind === 'insight') {
    const fields = ['title', 'summary', ...record.sections.flatMap((_, index) => [`sections.${index}.title`, `sections.${index}.body`]), ...record.faq.flatMap((_, index) => [`faq.${index}.question`, `faq.${index}.answer`])];
    return fields.flatMap(field => languages.map(language => `${field}.${language}`));
  }
  if (!['product', 'industry'].includes(kind)) throw new TypeError('Unknown CMS content kind');
  for (const field of ['name', 'summary']) for (const language of languages) paths.push(`${field}.${language}`);
  const fields = kind === 'product' ? record.specs.map((_, i) => [`specs.${i}.value`]) : record.requirements.map((_, i) => [`requirements.${i}.title`, `requirements.${i}.body`]);
  for (const group of fields) for (const field of group) for (const language of languages) paths.push(`${field}.${language}`);
  return paths;
}
export function getPath(object, key) { return key.split('.').reduce((value, part) => value?.[part], object); }
export function setPath(object, key, value) {
  const parts = key.split('.');
  const target = parts.slice(0, -1).reduce((item, part) => item[part], object);
  target[parts.at(-1)] = value;
}
export function seedRecords(products, industries, companyHistory = null, editorial = null, companyProfile = null) {
  const catalog = globalThis.DongDaCatalog.create(products);
  globalThis.DongDaIndustry.create(industries, catalog);
  const history = companyHistory === null ? [] : globalThis.DongDaCompany.create(companyHistory).data.milestones;
  if (editorial !== null) {
    if (!editorial || Object.keys(editorial).sort().join(',') !== 'insights,resources') throw new TypeError('Invalid editorial baseline');
    globalThis.DongDaInsights.create(editorial.insights, catalog);
    globalThis.DongDaResources.create(editorial.resources, catalog);
  }
  const profile = companyProfile === null ? [] : [{kind:'company-profile',id:globalThis.DongDaCompanyProfile.id,data:globalThis.DongDaCompanyProfile.create(companyProfile).data}];
  const extra = editorial === null ? [] : [
    ...editorial.insights.entries.map(data => ({kind: 'insight', id: data.id, data})),
    ...editorial.resources.entries.map(data => ({kind: 'resource', id: data.id, data})),
    ...editorial.resources.fields.map(data => ({kind: 'resource-field', id: data.id, data}))
  ];
  return [...products.map(data => ({ kind: 'product', id: data.id, data })), ...industries.map(data => ({ kind: 'industry', id: data.id, data })), ...history.map(data => ({kind: 'history', id: data.id, data})), ...extra, ...profile].map(record => ({ ...copy(record), editable: editablePaths(record.kind, record.data), baselineHash: digest(record.data) }));
}
function fail(message) { throw new TypeError(message); }
export function textLimit(field, kind = 'product') {
  if (kind === 'company-profile') return globalThis.DongDaCompanyProfile.textLimit(field);
  if (kind === 'resource' || kind === 'resource-field') return 800;
  if (kind === 'insight') {
    if (field.startsWith('summary.')) return 500;
    if (field.startsWith('sections.') && field.includes('.body.')) return 2000;
    if (field.startsWith('faq.')) return field.includes('.question.') ? 200 : 1000;
    return 160;
  }
  return field.startsWith('name.') || field.startsWith('title.') || field.includes('.title.') ? 120 : field.startsWith('specs.') ? 400 : 600;
}
export function composeExport(envelope, products, industries, scope = 'published', companyHistory = null, editorial = null, companyProfile = null) {
  const limits = {[legacySchemaVersion]:11, [historySchemaVersion]:31, [editorialSchemaVersion]:44, [schemaVersion]:45};
  if (!envelope || Object.keys(envelope).sort().join(',') !== 'records,schema,scope' || !Object.hasOwn(limits, envelope.schema) || envelope.scope !== scope || !['published', 'preview'].includes(scope) || !Array.isArray(envelope.records) || envelope.records.length > limits[envelope.schema]) fail('Invalid CMS export envelope');
  const seeds = seedRecords(products, industries, envelope.schema === legacySchemaVersion ? null : companyHistory, [editorialSchemaVersion,schemaVersion].includes(envelope.schema) ? editorial : null, envelope.schema === schemaVersion ? companyProfile : null), seen = new Set(), nextProducts = copy(products), nextIndustries = copy(industries), nextHistory = companyHistory === null ? null : copy(companyHistory), nextInsights = editorial === null ? null : copy(editorial.insights), nextResources = editorial === null ? null : copy(editorial.resources);
  let nextProfile=companyProfile===null?null:copy(companyProfile);
  for (const record of envelope.records) {
    if (!record || Object.keys(record).sort().join(',') !== 'baselineHash,data,id,kind,modifiedAt,postId,revision,status' || !Number.isSafeInteger(record.postId) || record.postId < 1 || !Number.isSafeInteger(record.revision) || record.revision < 1 || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(record.modifiedAt)) fail('Invalid CMS record metadata');
    if (!['publish', 'draft', 'pending'].includes(record.status) || (scope === 'published' && record.status !== 'publish')) fail('Draft or private data in public export');
    const seed = seeds.find(s => s.kind === record.kind && s.id === record.id);
    const key = `${record.kind}/${record.id}`;
    if (!seed || seen.has(key) || record.baselineHash !== seed.baselineHash) fail('Unknown, duplicate or stale content mapping');
    seen.add(key);
    const permitted = copy(seed.data);
    for (const field of seed.editable) {
      const value = getPath(record.data, field), limit = textLimit(field, record.kind);
      const invalid = ['company-profile', 'insight', 'resource', 'resource-field'].includes(record.kind) ? /[<>\u0000-\u001f\u007f]/ : /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
      if (typeof value !== 'string' || !value.trim() || value.length > limit || invalid.test(value)) fail('Invalid plain-text content');
      setPath(permitted, field, value.trim());
    }
    if (digest(permitted) !== digest(record.data)) fail('CMS changed protected fields or content structure');
    if(record.kind==='company-profile'){nextProfile=permitted;continue;}
    const list = record.kind === 'history' ? nextHistory.milestones : record.kind === 'product' ? nextProducts : record.kind === 'industry' ? nextIndustries : record.kind === 'insight' ? nextInsights.entries : record.kind === 'resource' ? nextResources.entries : nextResources.fields;
    list[list.findIndex(item => item.id === record.id)] = permitted;
  }
  const catalog = globalThis.DongDaCatalog.create(nextProducts);
  globalThis.DongDaIndustry.create(nextIndustries, catalog);
  if (nextHistory) globalThis.DongDaCompany.create(nextHistory);
  if (nextInsights) globalThis.DongDaInsights.create(nextInsights, catalog);
  if (nextResources) globalThis.DongDaResources.create(nextResources, catalog);
  if (nextProfile) globalThis.DongDaCompanyProfile.create(nextProfile);
  return { products: nextProducts, industries: nextIndustries, companyHistory: nextHistory, companyProfile: nextProfile, insights: nextInsights, resources: nextResources, fingerprint: digest(envelope), changedRecords: envelope.records.length };
}
