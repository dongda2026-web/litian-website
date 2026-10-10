var faqState={q:'',product:'all',topic:'all'},faqQuestion=null;
function restoreFaqPage(pathname){var page=faqRegistry.parsePath(pathname);if(page){var params=new URLSearchParams(location.search);faqState=faqRegistry.selection({q:params.get('q'),product:params.get('product'),topic:params.get('topic')});faqQuestion=location.hash.startsWith('#question-')?faqRegistry.resolve(location.hash.slice(10))?.id||null:null;}return page;}
function faqTarget(){var params=new URLSearchParams();if(faqState.q)params.set('q',faqState.q);if(faqState.product!=='all')params.set('product',faqState.product);if(faqState.topic!=='all')params.set('topic',faqState.topic);return DongDaFAQ.path(lang)+(params.size?'?'+params.toString():'')+(faqQuestion?'#question-'+faqQuestion:'');}
function renderFaqResults(){
  var host=document.getElementById('faq-questions'),opened=Array.from(host.querySelectorAll('details[open]')).map(function(node){return node.id;}),found=faqRegistry.search(faqState);
  if(faqQuestion&&!found.some(function(entry){return entry.id===faqQuestion;}))faqQuestion=null;
  host.innerHTML=DongDaFAQ.rows(found,lang,catalog);
  host.querySelectorAll('details').forEach(function(node){node.open=opened.includes(node.id)||node.id==='question-'+faqQuestion;});
  document.getElementById('faq-empty').hidden=found.length>0;
  document.getElementById('faq-count').textContent=found.length+' / '+faqRegistry.entries.length+' '+DongDaFAQ.text('count',lang);
  document.getElementById('faq-query').value=faqState.q;document.getElementById('faq-product').value=faqState.product;document.getElementById('faq-topic').value=faqState.topic;
  document.querySelector('.faq-reset').disabled=!faqState.q&&faqState.product==='all'&&faqState.topic==='all';
}
function renderFaq(){var opened=Array.from(document.querySelectorAll('#faq-questions details[open]')).map(function(node){return node.id;});document.getElementById('page-faq').innerHTML=DongDaFAQ.overview(lang,faqRegistry,catalog);opened.forEach(function(id){var node=document.getElementById(id);if(node)node.open=true;});renderFaqResults();}
function navFaq(){faqQuestion=null;nav('faq');}
function navRfqList(){nav('rfq');}
function focusFaqQuestion(){var node=faqQuestion&&document.getElementById('question-'+faqQuestion);if(node){node.open=true;node.querySelector('summary').focus({preventScroll:true});node.scrollIntoView({behavior:'instant',block:'start'});}}
function navFaqQuestion(id){if(!faqRegistry.resolve(id))return false;faqState=faqRegistry.selection({});faqQuestion=id;nav('faq');setTimeout(focusFaqQuestion,180);return true;}
function setFaqFilter(key,value){if(!['q','product','topic'].includes(key))return;faqState=faqRegistry.selection(Object.assign({},faqState,{[key]:value}));renderFaqResults();history.replaceState(null,'',faqTarget());}
function resetFaqFilters(){faqState=faqRegistry.selection({});faqQuestion=null;renderFaqResults();history.replaceState(null,'',faqTarget());document.getElementById('faq-query').focus({preventScroll:true});}
function submitFaq(event){event.preventDefault();setFaqFilter('q',document.getElementById('faq-query').value.trim());}
function updateFaqSeo(){var base=DongDaProductPage.origin(DONGDA_PUBLIC_SEO.canonical);updatePublicPageSeo(DongDaFAQ.metadata(lang,base),'website','faq-seo',base+DongDaFAQ.path('en'));}
function syncFaqLanguage(){document.querySelectorAll('[data-faq-link]').forEach(function(link){link.href=DongDaFAQ.path(lang);link.innerHTML=DongDaFAQ.escape(DongDaFAQ.text('title',lang))+DongDaSiteSearch.icon('ArrowRight');});renderFaq();if(document.getElementById('page-faq').classList.contains('on')&&!routeRestoring){history.replaceState(null,'',faqTarget());updateFaqSeo();}}
