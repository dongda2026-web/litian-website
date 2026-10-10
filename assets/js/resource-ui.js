var resourceState = {q:'',product:'all',sort:'newest'}, openResource = null;
function currentResourceDelivery() { return typeof resourceDelivery==='object' ? resourceDelivery : null; }
function stopResourceDownload() { if(typeof cancelResourceDownloads==='function')cancelResourceDownloads(); }
function resourceQuery() {
  var params = new URLSearchParams(location.search);
  return resourceRegistry.selection({q:params.get('q'),product:params.get('product'),sort:params.get('sort')});
}
function restoreResourcePage(pathname) {
  var page = resourceRegistry.parsePath(pathname);
  openResource = page?.entry?.id || null;
  if (page && !page.entry) resourceState = resourceQuery();
  return page;
}
function resourceTarget(entry) {
  var params = new URLSearchParams();
  if (!entry) {
    if (resourceState.q) params.set('q',resourceState.q);
    if (resourceState.product !== 'all') params.set('product',resourceState.product);
    if (resourceState.sort !== 'newest') params.set('sort',resourceState.sort);
  }
  return DongDaResources.path(entry,lang) + (params.size ? '?' + params.toString() : '');
}
function renderResourceRows() {
  stopResourceDownload();
  var found = resourceRegistry.search(resourceState,lang);
  document.getElementById('resource-rows').innerHTML = DongDaResources.rows(found,lang,catalog,currentResourceDelivery());
  document.getElementById('resource-empty').hidden = found.length > 0;
  document.getElementById('resource-count').textContent = found.length + ' / ' + resourceRegistry.entries.length + ' ' + DongDaResources.text('count',lang);
  document.getElementById('resource-search').value = resourceState.q;
  document.getElementById('resource-product').value = resourceState.product;
  document.getElementById('resource-sort').value = resourceState.sort;
  document.querySelector('.resource-reset').disabled = !resourceState.q && resourceState.product === 'all' && resourceState.sort === 'newest';
}
function renderResourceLibrary() {
  stopResourceDownload();
  document.getElementById('page-resources').innerHTML = DongDaResources.overview(lang,resourceRegistry,catalog,currentResourceDelivery());
  renderResourceRows();
}
function renderResourceDetail(id) {
  var entry = resourceRegistry.resolve(id);
  if (!entry) return false;
  stopResourceDownload();
  openResource = entry.id;
  document.getElementById('page-resource-detail').innerHTML = DongDaResources.detail(entry,lang,resourceRegistry,catalog,currentResourceDelivery());
  return true;
}
function navResource(id) { if (renderResourceDetail(id)) nav('resource-detail'); else navResources(); }
function navResources(productId) {
  if (productId) resourceState = resourceRegistry.selection({product:productId});
  openResource = null;
  renderResourceLibrary();nav('resources');
}
function setResourceFilter(key,value) {
  if (!['q','product','sort'].includes(key)) return;
  resourceState = resourceRegistry.selection(Object.assign({},resourceState,{[key]:value}));
  renderResourceRows();history.replaceState(null,'',resourceTarget(null));
}
function resetResourceFilters() {
  resourceState = resourceRegistry.selection({});
  renderResourceRows();history.replaceState(null,'',resourceTarget(null));
  document.getElementById('resource-search').focus();
}
function updateResourceSeo(entry) {
  var base = DongDaProductPage.origin(DONGDA_PUBLIC_SEO.canonical);
  updatePublicPageSeo(DongDaResources.metadata(entry,lang,base,catalog),'website','resource-seo',base + DongDaResources.path(entry,'en'));
}
function syncResourceLanguage() {
  document.querySelectorAll('[data-resource-library]').forEach(function (link) { link.href = DongDaResources.path(null,lang); });
  renderResourceLibrary();
  if (openResource) renderResourceDetail(openResource);
  var active = document.getElementById('page-resources').classList.contains('on') || document.getElementById('page-resource-detail').classList.contains('on');
  if (active && !routeRestoring) {
    var entry = document.getElementById('page-resource-detail').classList.contains('on') ? resourceRegistry.resolve(openResource) : null;
    history.replaceState(null,'',resourceTarget(entry));updateResourceSeo(entry);
  }
}
