import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { schemaVersion, seedRecords, composeExport, digest, getPath } from '../cms/content-contract.mjs';
import { ReleaseStore } from '../cms/release-store.mjs';
import { createCmsServer, createReleasedSiteServer, wordpressReader } from '../cms/service.mjs';
import { reviewVersion } from '../scripts/publication-review-core.mjs';
import '../assets/js/product-page-core.js';

const root = path.resolve(import.meta.dirname, '..'), products = JSON.parse(await fs.readFile(path.join(root, 'content/products.json'), 'utf8')), industries = JSON.parse(await fs.readFile(path.join(root, 'content/industries.json'), 'utf8'));
const companyHistory = JSON.parse(await fs.readFile(path.join(root, 'content/company-history.json'), 'utf8'));
const companyProfile = JSON.parse(await fs.readFile(path.join(root, 'content/company-profile.json'), 'utf8'));
const insights = JSON.parse(await fs.readFile(path.join(root, 'content/insights.json'), 'utf8'));
const resources = JSON.parse(await fs.readFile(path.join(root, 'content/resources.json'), 'utf8'));
const copy = value => JSON.parse(JSON.stringify(value));
function record(index = 0, status = 'publish') {
  const seed = seedRecords(products, industries)[index];
  return { postId: index + 1, kind: seed.kind, id: seed.id, data: copy(seed.data), baselineHash: seed.baselineHash, revision: 1, modifiedAt: '2026-10-08T12:00:00Z', status };
}
const envelope = (records = [], scope = 'published') => ({ schema: schemaVersion, scope, records });
test('CMS immutable identifiers and baseline remain shared with canonical catalogs', () => {
  assert.equal(seedRecords(products, industries).length, 11);
  const next = record(); next.data.summary.zh = '按装卸方式与内容物确认采购要求。';
  const result = composeExport(envelope([next]), products, industries);
  assert.equal(result.products[0].summary.zh, next.data.summary.zh);
  assert.notEqual(result.products, products); assert.notEqual(result.products[0], products[0]);
  assert.equal(digest({ a: 1, b: 2 }), digest({ b: 2, a: 1 }));
  for (const field of ['id','image','mediaRole','reviewStatus','configuration','aliases','industries']) {
    const changed = record(); changed.data[field] = field === 'configuration' ? [] : 'unauthorized';
    assert.throws(() => composeExport(envelope([changed]), products, industries), /protected/);
  }
});
test('CMS strict export prevents draft leakage, duplicates, stale baselines and unexpected metadata', () => {
  assert.throws(() => composeExport(envelope([record(0, 'draft')]), products, industries), /Draft/);
  assert.throws(() => composeExport(envelope([record(), record()]), products, industries), /duplicate/);
  const stale = record(); stale.baselineHash = 'bad'; assert.throws(() => composeExport(envelope([stale]), products, industries), /stale/);
  const unknown = record(); unknown.actorEmail = 'private@example.test'; assert.throws(() => composeExport(envelope([unknown]), products, industries), /metadata/);
  assert.throws(() => composeExport({ ...envelope(), privateNotes: 'do not export' }, products, industries), /envelope/);
  assert.equal(composeExport(envelope([record(0, 'draft')], 'preview'), products, industries, 'preview').changedRecords, 1);
});
test('CMS plain text and all translations are required; industry approval and mappings cannot be changed', () => {
  for (const text of ['', '<script>alert(1)</script>', 'x'.repeat(601), '\u0000bad']) {
    const changed = record(); changed.data.summary.ru = text; assert.throws(() => composeExport(envelope([changed]), products, industries), /plain-text/);
  }
  const changed = record(7); changed.data.publication = 'approved'; assert.throws(() => composeExport(envelope([changed]), products, industries), /protected/);
  changed.data.publication = 'review-pending'; changed.data.productIds = []; assert.throws(() => composeExport(envelope([changed]), products, industries), /protected/);
  assert.ok(seedRecords(products, industries)[7].editable.every(field => typeof getPath(record(7).data, field) === 'string'));
});
async function fixture(t, builder) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dongda-cms-test-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const sourceRoot = path.join(directory, 'source'); await fs.mkdir(sourceRoot);
  for (const item of ['assets','public','content','workers','.openai','scripts','server','tests','cms','aliyun','node_modules']) await fs.mkdir(path.join(sourceRoot, item));
  for (const file of ['index.html','404.html','_headers','_redirects','robots.txt','sitemap.xml','site-manifest.json','DEPLOYMENT.md','ALIYUN_DEPLOYMENT.md','ALIYUN_DYNAMIC_API.md','package.json','package-lock.json']) await fs.writeFile(path.join(sourceRoot, file), '{}');
  await fs.writeFile(path.join(sourceRoot, 'content/products.json'), JSON.stringify(products)); await fs.writeFile(path.join(sourceRoot, 'content/industries.json'), JSON.stringify(industries));
  await fs.writeFile(path.join(sourceRoot, 'content/company-history.json'), JSON.stringify(companyHistory));
  await fs.writeFile(path.join(sourceRoot, 'content/company-profile.json'), JSON.stringify(companyProfile));
  await fs.writeFile(path.join(sourceRoot, 'content/insights.json'), JSON.stringify(insights));
  await fs.writeFile(path.join(sourceRoot, 'content/resources.json'), JSON.stringify(resources));
  let data = envelope();
  const stub = async workspace => {
    const client = path.join(workspace, 'dist/client'), page = path.join(client, 'zh/products/fibc-bulk-bags'); await fs.mkdir(page, { recursive: true });
    const selected = JSON.parse(await fs.readFile(path.join(workspace, 'content/products.json'), 'utf8'))[0];
    await fs.writeFile(path.join(client, 'site-manifest.json'), JSON.stringify({publication_review:{version:reviewVersion,publishable:true,status:'review-records-valid'}}));
    await fs.writeFile(path.join(client, 'index.html'), selected.summary.zh);
    await fs.writeFile(path.join(client, '404.html'), 'Missing');
    await fs.mkdir(path.join(client, 'assets/css'), {recursive:true});
    for (const name of ['product-detail','company','insights','resources']) await fs.writeFile(path.join(client, 'assets/css', name+'.css'), '.'+name+'-fixture{color:rgb(1,2,3)}');
    for (const image of [...products.map(item=>item.image), 'assets/img/test.jpg', 'assets/img/factory_panorama.jpg']) {
      await fs.mkdir(path.dirname(path.join(client,image)),{recursive:true});
      await fs.copyFile(path.join(root,image==='assets/img/test.jpg'?products[1].image:image),path.join(client,image));
    }
    await fs.writeFile(path.join(page, 'index.html'), `<html lang="zh"><head><style>.page{display:none}</style><link rel="stylesheet" href="/assets/css/product-detail.css"></head><body><section id="page-product-detail" class="page"><h1>${selected.name.zh}</h1><p>${selected.summary.zh}</p><img src="/assets/img/test.jpg" onerror="bad()"><button onclick="bad()">Quote</button><script>bad()</script></section></body></html>`);
    const history = JSON.parse(await fs.readFile(path.join(workspace, 'content/company-history.json'), 'utf8'));
    const profile = JSON.parse(await fs.readFile(path.join(workspace, 'content/company-profile.json'), 'utf8'));
    await fs.mkdir(path.join(client, 'content')); await fs.writeFile(path.join(client, 'content/company-history.json'), JSON.stringify(history));
    await fs.writeFile(path.join(client, 'content/company-profile.json'), JSON.stringify(profile));
    await fs.writeFile(path.join(client, 'content/products.json'), JSON.stringify(JSON.parse(await fs.readFile(path.join(workspace, 'content/products.json'), 'utf8'))));
    const guideData = JSON.parse(await fs.readFile(path.join(workspace, 'content/insights.json'), 'utf8'));
    const resourceData = JSON.parse(await fs.readFile(path.join(workspace, 'content/resources.json'), 'utf8'));
    await fs.writeFile(path.join(client, 'content/insights.json'), JSON.stringify(guideData));
    await fs.writeFile(path.join(client, 'content/resources.json'), JSON.stringify(resourceData));
    const catalog = globalThis.DongDaCatalog.create(products);
    const resourceRegistry = globalThis.DongDaResources.create(resourceData, catalog);
    const guideRegistry = globalThis.DongDaInsights.create(guideData, catalog);
    for (const language of ['zh', 'en', 'ru']) {
      const overview = path.join(client, language, 'company'); await fs.mkdir(overview,{recursive:true});
      const projected = globalThis.DongDaCompanyProfile.create(profile).project(language);
      await fs.writeFile(path.join(overview,'index.html'), '<html lang="'+language+'"><head><style>.page{display:none}</style><link rel="stylesheet" href="/assets/css/company.css"></head><body><section id="page-about" class="page"><h1>'+globalThis.DongDaCompany.escape(projected.copy.ab_h1)+'</h1><p>'+globalThis.DongDaCompany.escape(projected.copy.ab_body)+'</p><img src="/assets/img/factory_panorama.jpg"><button onclick="bad()">Quote</button></section></body></html>');
      const folder = path.join(client, language, 'company/history'); await fs.mkdir(folder, {recursive: true});
      await fs.writeFile(path.join(folder, 'index.html'), '<html lang="'+language+'"><head><style>.page{display:none}</style><link rel="stylesheet" href="/assets/css/company.css"></head><body><section id="page-company-history" class="page">'+globalThis.DongDaCompany.historyPage(globalThis.DongDaCompany.create(history), language, 'all')+'</section></body></html>');
      for (const guide of guideRegistry.entries) {
        const target = path.join(client, globalThis.DongDaInsights.path(guide, language)); await fs.mkdir(target, {recursive: true});
        await fs.writeFile(path.join(target, 'index.html'), '<html lang="'+language+'"><head><style>.page{display:none}</style><link rel="stylesheet" href="/assets/css/insights.css"></head><body><section id="page-insight-detail" class="page">'+globalThis.DongDaInsights.detail(guide, language, catalog)+'</section></body></html>');
      }
      for (const resource of resourceRegistry.entries) {
        const target = path.join(client, globalThis.DongDaResources.path(resource, language)); await fs.mkdir(target, {recursive: true});
        await fs.writeFile(path.join(target, 'index.html'), '<html lang="'+language+'"><head><style>.page{display:none}</style><link rel="stylesheet" href="/assets/css/resources.css"></head><body><section id="page-resource-detail" class="page">'+globalThis.DongDaResources.detail(resource, language, resourceRegistry, catalog)+'</section></body></html>');
        const file = path.join(client, globalThis.DongDaResources.filePath(resource, language)); await fs.mkdir(path.dirname(file), {recursive: true});
        await fs.writeFile(file, globalThis.DongDaResources.downloadText(resource, language, resourceRegistry));
      }
    }
    return { passed: true, log: 'Synthetic build gate stub; not release acceptance' };
  };
  // Synthetic attestations keep these file-store tests independent of business approval.
  const publicationAssessor = async () => ({version:reviewVersion,publishable:true,claims:12,problems:[]});
  const store = new ReleaseStore({ sourceRoot, storageRoot: path.join(directory, 'private'), readExport: async () => copy(data), builder: builder || stub, publicationAssessor, assetOrigin: 'http://127.0.0.1:4191' });
  return { store, sourceRoot, setData: value => { data = value; }, stub };
}
test('CMS build is isolated and activation/restart/rollback preserve complete prior releases', async t => {
  const { store, sourceRoot, setData } = await fixture(t); const original = await fs.readFile(path.join(sourceRoot, 'content/products.json'), 'utf8');
  const first = await store.build('published', '1'); await store.move(first.id, 0, '1');
  const next = record(); next.data.summary.zh = '第二版采购需求。'; setData(envelope([next]));
  const second = await store.build('published', '1'); await store.move(second.id, 1, '1');
  assert.equal(await fs.readFile(path.join(sourceRoot, 'content/products.json'), 'utf8'), original);
  const restarted = new ReleaseStore({ sourceRoot, storageRoot: store.storageRoot, readExport: store.readExport, builder: store.builder, publicationAssessor:store.publicationAssessor }); assert.equal((await restarted.state()).current, second.id);
  await restarted.move(null, 2, '1', true); assert.equal((await restarted.state()).current, first.id); assert.equal((await restarted.state()).revision, 3);
  assert.equal((await restarted.verified(second.id)).status, 'ready');
});
test('CMS company-profile file fixture composes a private draft, rejects wrong IDs and cannot activate',async t=>{
  const{store,sourceRoot,setData}=await fixture(t),seed=seedRecords(products,industries,companyHistory,{insights,resources},companyProfile).at(-1);
  const original=await fs.readFile(path.join(sourceRoot,'content/company-profile.json'));
  const row={postId:45,kind:seed.kind,id:seed.id,data:copy(seed.data),baselineHash:seed.baselineHash,revision:1,modifiedAt:'2026-10-09T12:00:00Z',status:'draft'};
  for(const language of ['zh','en','ru'])row.data.copy.ab_body[language]='Synthetic overview '+language;
  setData(envelope([row],'preview'));const release=await store.build('preview','synthetic');
  for(const language of ['zh','en','ru']){const{html}=await store.preview(release.id,'company-profile',seed.id,language);assert.match(html,new RegExp('Synthetic overview '+language));assert.match(html,/script-src 'none'/);assert.doesNotMatch(html,/<script|onclick=/);}
  await assert.rejects(store.preview(release.id,'company-profile','unknown','zh'),/profile not found/);
  await assert.rejects(store.move(release.id,0,'synthetic'),/cannot be activated/);
  assert.deepEqual(await fs.readFile(path.join(sourceRoot,'content/company-profile.json')),original);assert.equal((await store.state()).current,null);
});
test('CMS source/content changes, stale CAS and tampered artifacts prevent activation', async t => {
  const { store, sourceRoot, setData } = await fixture(t); const first = await store.build('published', '1');
  await assert.rejects(store.move(first.id, 1, '1'), /Release changed/);
  setData(envelope([record()])); await assert.rejects(store.move(first.id, 0, '1'), /content changed/);
  setData(envelope()); await fs.writeFile(path.join(sourceRoot, 'index.html'), 'changed'); await assert.rejects(store.move(first.id, 0, '1'), /Source changed/);
  await fs.writeFile(path.join(sourceRoot, 'index.html'), '{}'); await fs.writeFile(path.join(store.directory(first.id), 'client/index.html'), 'tampered'); await assert.rejects(store.move(first.id, 0, '1'), /integrity/);
  assert.equal((await store.state()).current, null);
});
test('CMS gate failure retains current release and failed evidence', async t => {
  const { store } = await fixture(t); const first = await store.build('published', '1'); await store.move(first.id, 0, '1');
  store.builder = async () => ({ passed: false, log: 'intentional synthetic failure' }); await assert.rejects(store.build('published', '1'), /gates failed/);
  assert.equal((await store.state()).current, first.id); assert.ok((await store.status()).releases.some(r => r.status === 'failed'));
});
test('CMS history draft composes only its isolated workspace and three read-only previews', async t => {
  const {store, sourceRoot, setData} = await fixture(t);
  const seed = seedRecords(products, industries, companyHistory).find(row => row.kind === 'history');
  const row = {postId: 12, kind: seed.kind, id: seed.id, data: copy(seed.data), baselineHash: seed.baselineHash, revision: 1, modifiedAt: '2026-10-09T12:00:00Z', status: 'draft'};
  row.data.description.zh = 'Synthetic history revision for isolated fixture';
  setData(envelope([row], 'preview'));
  const original = await fs.readFile(path.join(sourceRoot, 'content/company-history.json'));
  const release = await store.build('preview', 'synthetic');
  assert.deepEqual(await fs.readFile(path.join(sourceRoot, 'content/company-history.json')), original);
  for (const language of ['zh','en','ru']) {
    const {html} = await store.preview(release.id, 'history', row.id, language);
    assert.match(html, /company-milestone/); assert.match(html, /noindex|script-src 'none'/);
    assert.doesNotMatch(html, /<script|onchange=|onclick=/); assert.match(html, /<select[^>]*disabled/);
    assert.match(html, /company-fixture/); assert.doesNotMatch(html, /<link/);
    if (language === 'zh') assert.match(html, /Synthetic history revision/);
  }
  await assert.rejects(store.preview(release.id, 'history', 'milestone-1900', 'zh'), /milestone not found/);
  await assert.rejects(store.preview(release.id, 'history', '../private', 'zh'), /Invalid/);
  await assert.rejects(store.preview(release.id, 'history', row.id, 'kk'), /Invalid/);
  await assert.rejects(store.move(release.id, 0, 'synthetic'), /Draft/);
  assert.equal((await store.state()).revision, 0);
});
test('CMS history approved-record fingerprint drift blocks activation without losing prior state', async t => {
  const {store, setData} = await fixture(t);
  const seed = seedRecords(products, industries, companyHistory).find(row => row.kind === 'history');
  const row = {postId:12,kind:seed.kind,id:seed.id,data:copy(seed.data),baselineHash:seed.baselineHash,revision:1,modifiedAt:'2026-10-09T12:00:00Z',status:'publish'};
  setData(envelope([row])); const first = await store.build('published', 'synthetic'); await store.move(first.id, 0, 'synthetic');
  const second = await store.build('published', 'synthetic'); row.data.title.en = 'Synthetic revised title'; setData(envelope([row]));
  await assert.rejects(store.move(second.id, 1, 'synthetic'), /content changed/); assert.equal((await store.state()).current, first.id);
});
test('CMS editorial drafts render three-language readonly article and checklist fixtures with source isolation', async t => {
  const {store,sourceRoot,setData}=await fixture(t), baseline={insights,resources};
  const seeds=seedRecords(products,industries,companyHistory,baseline);
  const records=['insight','resource','resource-field'].map((kind,index)=>{const seed=seeds.find(item=>item.kind===kind);return {postId:32+index,kind,id:seed.id,data:copy(seed.data),baselineHash:seed.baselineHash,revision:1,modifiedAt:'2026-10-09T12:00:00Z',status:'draft'};});
  records[0].data.sections[0].body.zh='Synthetic private article body';records[1].data.title.zh='Synthetic private checklist';records[2].data.hint.zh='Synthetic common field';
  const originals=await fs.readFile(path.join(sourceRoot,'content/insights.json'));
  const resourceOriginals=await fs.readFile(path.join(sourceRoot,'content/resources.json'));
  setData(envelope(records,'preview'));const release=await store.build('preview','synthetic');
  assert.deepEqual(await fs.readFile(path.join(sourceRoot,'content/insights.json')),originals);assert.deepEqual(await fs.readFile(path.join(sourceRoot,'content/resources.json')),resourceOriginals);
  for (const language of ['zh','en','ru']) for (const record of records) {
    const {html}=await store.preview(release.id,record.kind,record.id,language);assert.match(html,/script-src 'none'/);assert.doesNotMatch(html,/<script|onclick=|href="\/(?:assets|en|zh|ru)/);
    assert.match(html,record.kind==='insight'?/page-insight-detail/:/page-resource-detail/);
    if(language==='zh')assert.match(html,record.kind==='insight'?/Synthetic private article body/:record.kind==='resource'?/Synthetic private checklist/:/Synthetic common field/);
  }
  for (const kind of ['insight','resource','resource-field']) await assert.rejects(store.preview(release.id,kind,'unknown','en'),/not found/);
  await assert.rejects(store.preview(release.id,'resource-field','../private','zh'),/Invalid/);
  await assert.rejects(store.move(release.id,0,'synthetic'),/Draft/);assert.equal((await store.state()).current,null);
  const file=path.join(store.directory(release.id),'client/assets/documents/fibc-request-checklist-zh-v1.txt');assert.match(await fs.readFile(file,'utf8'),/Synthetic common field/);
});
test('CMS approved editorial drift blocks activation and retains the selected complete fixture', async t => {
  const {store,setData}=await fixture(t), first=await store.build('published','synthetic');await store.move(first.id,0,'synthetic');
  const seed=seedRecords(products,industries,companyHistory,{insights,resources}).find(item=>item.kind==='insight');
  const record={postId:32,kind:seed.kind,id:seed.id,data:copy(seed.data),baselineHash:seed.baselineHash,revision:1,modifiedAt:'2026-10-09T12:00:00Z',status:'publish'};
  record.data.title.zh='Synthetic reviewed text';setData(envelope([record]));const next=await store.build('published','synthetic');
  record.data.title.zh='Synthetic changed later';setData(envelope([record]));await assert.rejects(store.move(next.id,1,'synthetic'),/content changed/);
  assert.equal((await store.state()).current,first.id);assert.equal((await store.state()).revision,1);
});
test('CMS operation lock prevents concurrent publishing without overwriting state', async t => {
  const { store } = await fixture(t); await store.initialize(); await fs.writeFile(path.join(store.storageRoot, 'operation.lock'), 'synthetic owner');
  await assert.rejects(store.build('published', '1'), /Another/); assert.equal((await store.state()).revision, 0);
  await fs.unlink(path.join(store.storageRoot, 'operation.lock'));
});
test('CMS preview is authenticated output only, strips script/events and cannot become active', async t => {
  const { store, setData } = await fixture(t); setData(envelope([record(0, 'draft')], 'preview'));
  const result = await store.build('preview', '1'); await assert.rejects(store.move(result.id, 0, '1'), /Draft/);
  const { html } = await store.preview(result.id, 'product', 'fibc-bulk-bags', 'zh'); assert.match(html, /集装袋/); assert.match(html, /script-src 'none'/); assert.doesNotMatch(html, /<script|onclick=|onerror=/);
  assert.match(html, /data:image\/jpeg;base64,/);
  assert.match(html, /product-detail-fixture/); assert.doesNotMatch(html, /<link|@import|http:\/\/127\.0\.0\.1:4191/); assert.match(html, /<button[^>]*disabled/);
  await assert.rejects(store.preview(result.id, 'product', '../private', 'zh'), /Invalid/);
});
test('CMS readonly preview stays on its exact release and detects asset changes after verification', async t=>{
  const {store,stub,setData}=await fixture(t);setData(envelope([],'preview'));
  let colour='red'; store.builder=async workspace=>{const result=await stub(workspace);await fs.writeFile(path.join(workspace,'dist/client/assets/css/product-detail.css'),'.release-proof{color:'+colour+'}');return result;};
  const first=await store.build('preview','synthetic');colour='blue';const second=await store.build('preview','synthetic');
  assert.match((await store.preview(first.id,'product','fibc-bulk-bags','zh')).html,/release-proof\{color:red\}/);
  assert.match((await store.preview(second.id,'product','fibc-bulk-bags','zh')).html,/release-proof\{color:blue\}/);
  const verified=store.verified.bind(store);store.verified=async(...args)=>{const result=await verified(...args);await fs.writeFile(path.join(store.directory(args[0]),'client/assets/img/test.jpg'),'changed after verification');return result;};
  await assert.rejects(store.preview(first.id,'product','fibc-bulk-bags','zh'),/integrity mismatch/);
  assert.equal((await store.state()).current,null);
});
test('CMS public artifact refuses private files', async t => {
  const { store, stub } = await fixture(t); store.builder = async workspace => { const result = await stub(workspace); await fs.mkdir(path.join(workspace, 'dist/client/server')); await fs.writeFile(path.join(workspace, 'dist/client/server/private.txt'), 'private'); return result; };
  await assert.rejects(store.build('published', '1'), /Private content/); assert.equal((await store.state()).current, null);
});
test('CMS publication denial preserves state and blocks rollback with current attestations', async t => {
  const {store,sourceRoot}=await fixture(t),first=await store.build('published','synthetic');
  const calls=[];let allowed=false;
  store.publicationAssessor=async(candidate,options)=>{calls.push({candidate,options});return{publishable:allowed,problems:allowed?[]:[{id:'company-profile',code:'review_required'}]};};
  await assert.rejects(store.move(first.id,0,'synthetic'),/Publication review required/);
  assert.deepEqual(await store.state(),{current:null,previous:null,revision:0});
  assert.equal(calls[0].candidate,path.join(store.directory(first.id),'source'));assert.equal(calls[0].options.reviewRoot,sourceRoot);
  allowed=true;await store.move(first.id,0,'synthetic');const second=await store.build('published','synthetic');await store.move(second.id,1,'synthetic');
  const before=await fs.readFile(path.join(store.storageRoot,'state.json')),events=await fs.readFile(path.join(store.storageRoot,'events.jsonl'));
  allowed=false;await assert.rejects(store.move(null,2,'synthetic',true),/Publication review required/);
  assert.deepEqual(await fs.readFile(path.join(store.storageRoot,'state.json')),before);assert.deepEqual(await fs.readFile(path.join(store.storageRoot,'events.jsonl')),events);
});
test('CMS draft build uses preview scope and does not request publication approval',async t=>{
  const{store,stub,setData}=await fixture(t);let scope;setData(envelope([],'preview'));
  store.builder=async(workspace,options)=>{scope=options.scope;return stub(workspace);};store.publicationAssessor=async()=>{throw new Error('must not assess draft');};
  const release=await store.build('preview','synthetic');assert.equal(scope,'preview');assert.match((await store.preview(release.id,'product','fibc-bulk-bags','zh')).html,/集装袋/);
  await assert.rejects(store.move(release.id,0,'synthetic'),/Draft/);
});
test('CMS production artifact requires cleared metadata independently of attestations',async t=>{
  const{store,stub}=await fixture(t);store.builder=async workspace=>{const result=await stub(workspace);await fs.writeFile(path.join(workspace,'dist/client/site-manifest.json'),JSON.stringify({publication_review:{version:reviewVersion,publishable:false,status:'review-required'}}));return result;};
  const release=await store.build('published','synthetic');await assert.rejects(store.move(release.id,0,'synthetic'),/not cleared/);assert.equal((await store.state()).revision,0);
});
test('CMS candidate source tampering fails before publication assessment',async t=>{
  const{store}=await fixture(t),release=await store.build('published','synthetic');store.publicationAssessor=async()=>{assert.fail('tampered source must not reach assessment');};
  await fs.writeFile(path.join(store.directory(release.id),'source/index.html'),'tampered');await assert.rejects(store.move(release.id,0,'synthetic'),/source integrity mismatch/);assert.equal((await store.state()).revision,0);
});
test('CMS public artifact rejects private publication evidence',async t=>{
  const{store,stub}=await fixture(t);store.builder=async workspace=>{const result=await stub(workspace);await fs.mkdir(path.join(workspace,'dist/client/content/private-review'),{recursive:true});await fs.writeFile(path.join(workspace,'dist/client/content/private-review/review.json'),'synthetic private');return result;};
  await assert.rejects(store.build('published','synthetic'),/Private content/);assert.equal((await store.state()).current,null);
});
async function listen(t, server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); })); return `http://127.0.0.1:${server.address().port}`; }
test('CMS real HTTP rejects anonymous/browser/oversize/unknown requests and hides credentials', async t => {
  const { store } = await fixture(t), key = 'synthetic'.repeat(8), base = await listen(t, createCmsServer(store, key));
  const call = (data, headers = {}, method = 'POST', url = '/api/cms') => fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(method === 'POST' ? { body: typeof data === 'string' ? data : JSON.stringify(data) } : {}) });
  assert.equal((await call({ action: 'status', actor: '1' })).status, 401);
  const headers = { Authorization: 'Bearer ' + key };
  assert.equal((await call({ action: 'status', actor: '1' }, { ...headers, Origin: 'http://other.test' })).status, 403);
  assert.equal((await call('x'.repeat(17000), headers)).status, 413);
  assert.equal((await call({ action: 'status', actor: '1', credential: key }, headers)).status, 400);
  assert.equal((await call(null, headers, 'GET')).status, 405);
  assert.equal((await call(null, headers, 'GET', '/var/private')).status, 404);
  const response = await call({ action: 'status', actor: '1' }, headers); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.doesNotMatch(await response.text(), new RegExp(key));
});
test('CMS released frontend serves only activated content, not drafts or private store', async t => {
  const { store } = await fixture(t), base = await listen(t, createReleasedSiteServer(store)); assert.equal((await fetch(base)).status, 503);
  const release = await store.build('published', '1'); await store.move(release.id, 0, '1'); assert.equal((await fetch(base)).status, 200); assert.equal((await fetch(base + '/state.json')).status, 404); assert.equal((await fetch(base + '/cms/private')).status, 404);
});
test('CMS transport requires HTTPS and dedicated identity; admin code parses without credential storage', async () => {
  assert.throws(() => wordpressReader({ url: 'http://remote.test', username: 'read', applicationPassword: 'test' }), /HTTPS/);
  assert.throws(() => wordpressReader({ url: 'https://user:secret@remote.test', username: 'read', applicationPassword: 'test' }), /HTTPS/);
  assert.throws(() => wordpressReader({ url: 'https://remote.test', username: '', applicationPassword: '' }), /identity/);
  const code = await fs.readFile(path.join(root, 'cms/wordpress/dongda-content/admin.js'), 'utf8'); new Function(code); assert.doesNotMatch(code, /localStorage|sessionStorage|innerHTML|CMS_BRIDGE_KEY|applicationPassword/); assert.match(code, /dataset.lock = String\(disabled\)/);
  assert.match(code, /button\('只读预览', \(\) => preview\(item.id\), !previewSupported\)/); assert.match(code, /record.data.kind === 'technical'/);
});
