var insightState={q:'',topic:'all',sort:'newest'},openInsight=null;
function restoreInsightPage(pathname) {
  var page=insightRegistry.parsePath(pathname),params=new URLSearchParams(location.search);
  openInsight=page?.entry?.id || null;
  if(page&&!page.entry)insightState=insightRegistry.selection({q:params.get('q'),topic:params.get('topic'),sort:params.get('sort')});
  return page;
}
function insightAnchor(entry) {
  var key=location.hash.slice(1),page=insightRegistry.parsePath(location.pathname);
  return entry && page?.entry?.id===entry.id && (key==='questions'||entry.sections.some(function(section){return section.id===key;})) ? '#'+key : '';
}
function insightTarget(entry) {
  var params=new URLSearchParams();
  if(!entry){if(insightState.q)params.set('q',insightState.q);if(insightState.topic!=='all')params.set('topic',insightState.topic);if(insightState.sort!=='newest')params.set('sort',insightState.sort);}
  return DongDaInsights.path(entry,lang)+(params.size?'?'+params.toString():'')+insightAnchor(entry);
}
function renderInsightRows() {
  var found=insightRegistry.search(insightState,lang);
  document.getElementById('insight-rows').innerHTML=DongDaInsights.rows(found,lang,catalog);
  document.getElementById('insight-empty').hidden=found.length>0;
  document.getElementById('insight-count').textContent=found.length+' / '+insightRegistry.entries.length+' '+DongDaInsights.text('count',lang);
  document.getElementById('insight-search').value=insightState.q;
  document.getElementById('insight-topic').value=insightState.topic;
  document.getElementById('insight-sort').value=insightState.sort;
  document.querySelector('.insight-reset').disabled=!insightState.q&&insightState.topic==='all'&&insightState.sort==='newest';
}
function renderInsightLibrary() {var host=document.getElementById('page-news');host.innerHTML=DongDaInsights.overview(lang,insightRegistry,catalog);if(typeof DongDaFAQ!=='undefined')host.querySelector('.insight-heading').insertAdjacentHTML('beforeend',DongDaFAQ.entryLink(lang));renderInsightRows();}
function renderInsightDetail(id) {var entry=insightRegistry.resolve(id);if(!entry)return false;openInsight=entry.id;document.getElementById('page-insight-detail').innerHTML=DongDaInsights.detail(entry,lang,catalog);return true;}
function navInsight(id) {if(renderInsightDetail(id))nav('insight-detail');else navInsights();}
function navInsights() {openInsight=null;renderInsightLibrary();nav('news');}
function setInsightFilter(key,value) {if(!['q','topic','sort'].includes(key))return;insightState=insightRegistry.selection(Object.assign({},insightState,{[key]:value}));renderInsightRows();history.replaceState(null,'',insightTarget(null));}
function resetInsightFilters() {insightState=insightRegistry.selection({});renderInsightRows();history.replaceState(null,'',insightTarget(null));document.getElementById('insight-search').focus();}
function updateInsightSeo(entry) {var base=DongDaProductPage.origin(DONGDA_PUBLIC_SEO.canonical);updatePublicPageSeo(DongDaInsights.metadata(entry,lang,base,catalog),'website','insight-seo',base+DongDaInsights.path(entry,'en'));}
function syncInsightLanguage() {
  document.querySelectorAll('[data-insight-overview]').forEach(function(link){link.href=DongDaInsights.path(null,lang);});
  renderInsightLibrary();if(openInsight)renderInsightDetail(openInsight);
  var active=document.getElementById('page-news').classList.contains('on')||document.getElementById('page-insight-detail').classList.contains('on');
  if(active&&!routeRestoring){var entry=document.getElementById('page-insight-detail').classList.contains('on')?insightRegistry.resolve(openInsight):null;history.replaceState(null,'',insightTarget(entry));updateInsightSeo(entry);}
}
