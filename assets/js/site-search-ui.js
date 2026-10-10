var siteSearchState={q:'',type:'all',sort:'relevance'};
function restoreSiteSearchPage(pathname){var page=siteSearchRegistry.parsePath(pathname);if(page){var params=new URLSearchParams(location.search);siteSearchState=siteSearchRegistry.selection({q:params.get('q'),type:params.get('type'),sort:params.get('sort')});}return page;}
function siteSearchTarget(){var params=new URLSearchParams();if(siteSearchState.q)params.set('q',siteSearchState.q);if(siteSearchState.type!=='all')params.set('type',siteSearchState.type);if(siteSearchState.sort!=='relevance')params.set('sort',siteSearchState.sort);return DongDaSiteSearch.path(lang)+(params.size?'?'+params.toString():'');}
function renderSiteSearchResults(){
  var found=siteSearchRegistry.search(siteSearchState,lang);
  document.getElementById('site-search-results').innerHTML=DongDaSiteSearch.rows(found,lang);
  document.getElementById('site-search-empty').hidden=found.length>0;
  document.getElementById('site-search-count').textContent=found.length+' / '+siteSearchRegistry.records.length+' '+DongDaSiteSearch.text('count',lang);
  document.getElementById('site-search-query').value=siteSearchState.q;
  document.getElementById('site-search-type').value=siteSearchState.type;
  document.getElementById('site-search-sort').value=siteSearchState.sort;
  document.querySelector('.site-search-reset').disabled=!siteSearchState.q&&siteSearchState.type==='all'&&siteSearchState.sort==='relevance';
}
function renderSiteSearch(){document.getElementById('page-search').innerHTML=DongDaSiteSearch.overview(lang,siteSearchRegistry);renderSiteSearchResults();}
function navSiteSearch(){nav('search');document.getElementById('site-search-query').focus({preventScroll:true});}
function setSiteSearchFilter(key,value){if(!['q','type','sort'].includes(key))return;siteSearchState=siteSearchRegistry.selection(Object.assign({},siteSearchState,{[key]:value}));renderSiteSearchResults();history.replaceState(null,'',siteSearchTarget());}
function resetSiteSearchFilters(){siteSearchState=siteSearchRegistry.selection({});renderSiteSearchResults();history.replaceState(null,'',siteSearchTarget());document.getElementById('site-search-query').focus({preventScroll:true});}
function submitSiteSearch(event){event.preventDefault();siteSearchState=siteSearchRegistry.selection(Object.assign({},siteSearchState,{q:document.getElementById('site-search-query').value.trim()}));renderSiteSearchResults();history.replaceState(null,'',siteSearchTarget());}
function openSiteSearchResult(id){var record=siteSearchRegistry.resolve(id);if(!record)return false;var handlers={product:navProd,industry:navIndustry,resource:navResource,insight:navInsight,faq:function(key){navFaqQuestion(key);}};handlers[record.type](record.entityId);return true;}
function updateSiteSearchSeo(){var base=DongDaProductPage.origin(DONGDA_PUBLIC_SEO.canonical);updatePublicPageSeo(DongDaSiteSearch.metadata(lang,base),'website','site-search-seo',base+DongDaSiteSearch.path('en'));}
function syncSiteSearchLanguage(){
  document.querySelectorAll('[data-site-search]').forEach(function(link){link.href=DongDaSiteSearch.path(lang);link.title=DongDaSiteSearch.text('search',lang);link.setAttribute('aria-label',DongDaSiteSearch.text('search',lang));if(link.classList.contains('site-search-entry'))link.innerHTML=DongDaSiteSearch.icon('Search');else link.textContent=DongDaSiteSearch.text('search',lang);});
  renderSiteSearch();
  if(document.getElementById('page-search').classList.contains('on')&&!routeRestoring){history.replaceState(null,'',siteSearchTarget());updateSiteSearchSeo();}
}
