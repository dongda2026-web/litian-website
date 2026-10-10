var openIndustry = null;
function restoreIndustryPage(pathname) {
  var page = industryCatalog.parsePath(pathname);
  openIndustry = page && page.entry ? page.entry.id : null;
  return page;
}
function renderIndustryEntrypoints() {
  document.getElementById('industry-entry-grid').innerHTML = DongDaIndustry.cards(industryCatalog.entries, lang, catalog);
  document.getElementById('page-industries').innerHTML = DongDaIndustry.body(null, lang, catalog, industryCatalog.entries);
  document.querySelectorAll('[data-industry-overview]').forEach(function (link) { link.href = DongDaIndustry.path(null, lang); link.textContent = DongDaIndustry.text('back', lang); });
}
function renderIndustryDetail(id) {
  var entry = industryCatalog.resolve(id);
  if (!entry) return false;
  openIndustry = entry.id;
  document.getElementById('page-industry-detail').innerHTML = DongDaIndustry.body(entry, lang, catalog, industryCatalog.entries);
  return true;
}
function navIndustry(id) {
  if (renderIndustryDetail(id)) nav('industry-detail');
  else navIndustries();
}
function navIndustries() { nav('industries'); }
function updateIndustrySeo(entry) {
  var base = DongDaProductPage.origin(DONGDA_PUBLIC_SEO.canonical);
  updatePublicPageSeo(DongDaIndustry.metadata(entry, lang, base, catalog), 'website', 'industry-seo', base + DongDaIndustry.path(entry, 'en'));
}
