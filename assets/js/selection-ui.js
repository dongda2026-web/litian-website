var selectionState={value:Object.assign({},DongDaSelection.defaults),step:1,reached:1,errors:[],pendingQuote:null};
var selectionEngine=null,selectionCatalog=null;
function getSelectionEngine(){if(selectionCatalog!==catalog){selectionEngine=DongDaSelection.create(catalog);selectionCatalog=catalog;}return selectionEngine;}
function selectionText(key){return DongDaSelection.text(key,lang);}
function selectionTarget(){return DongDaSelection.path(lang);}
function restoreSelectionPage(path){return DongDaSelection.parsePath(path);}
function updateSelectionSeo(){var origin=DongDaProductPage.origin(DONGDA_PUBLIC_SEO.canonical);updatePublicPageSeo(DongDaSelection.metadata(lang,origin),'website','selection-seo',origin+DongDaSelection.path('en'));}
function renderSelectionLinks(){
  document.querySelectorAll('[data-selection-link]').forEach(function(link){link.href=selectionTarget();link.innerHTML=esc(selectionText('entry'))+catalogIcon('SlidersHorizontal');});
}
function renderSelection(){
  var page=document.getElementById('page-selection');if(!page)return;
  try{page.innerHTML=DongDaSelectionView.shell(lang,selectionState.step===4?DongDaSelectionView.results(lang,selectionState.value,getSelectionEngine(),catalogState.compare):DongDaSelectionView.form(lang,selectionState.value,selectionState.step,selectionState.reached,selectionState.errors));}
  catch(error){selectionState.pendingQuote=null;page.innerHTML=DongDaSelectionView.shell(lang,'<p role="alert">'+esc(selectionText('unavailable'))+'</p>');}
  renderSelectionLinks();if(selectionState.pendingQuote)renderSelectionConflict();
}
function setSelectionRequirement(key,value){
  if(!Object.hasOwn(DongDaSelection.defaults,key))return;
  var next=Object.assign({},selectionState.value);next[key]=value;if(key==='loadMode'&&value!=='value')next.loadKg='';
  try{selectionState.value=DongDaSelection.draft(next);}catch(error){return;}
  selectionState.pendingQuote=null;selectionState.errors=selectionState.errors.filter(function(field){return field!==key;});
  var input=document.getElementById('selection-'+key),error=document.getElementById('selection-'+key+'-error');if(input)input.removeAttribute('aria-invalid');if(error)error.textContent='';
  if(key==='loadMode'){var load=document.getElementById('selection-load-field');load.hidden=value!=='value';if(value!=='value')document.getElementById('selection-loadKg').value='';}
  if(!selectionState.errors.length)document.getElementById('selection-status').textContent='';
}
function focusSelectionStep(){document.getElementById('selection-step-title')?.focus();}
function goSelectionStep(step){
  if(![1,2,3,4].includes(step)||step>selectionState.reached)return;
  if(step===4&&DongDaSelection.errors(selectionState.value).length)return;
  selectionState.step=step;selectionState.errors=[];selectionState.pendingQuote=null;renderSelection();focusSelectionStep();
}
function nextSelectionStep(event){
  event.preventDefault();if(![1,2,3].includes(selectionState.step))return;selectionState.errors=DongDaSelection.errors(selectionState.value,selectionState.step);
  if(selectionState.errors.length){renderSelection();document.getElementById('selection-'+selectionState.errors[0])?.focus();return;}
  if(selectionState.step===3){selectionState.errors=DongDaSelection.errors(selectionState.value);if(selectionState.errors.length){selectionState.step=['industry','contents'].includes(selectionState.errors[0])?1:['filling','handling'].includes(selectionState.errors[0])?2:3;renderSelection();document.getElementById('selection-'+selectionState.errors[0])?.focus();return;}}
  selectionState.step++;selectionState.reached=Math.max(selectionState.reached,selectionState.step);renderSelection();focusSelectionStep();
}
function resetSelection(){selectionState={value:Object.assign({},DongDaSelection.defaults),step:1,reached:1,errors:[],pendingQuote:null};renderSelection();focusSelectionStep();}
function toggleSelectionCompare(id){
  catalogState.compare=catalog.toggle(catalogState.compare,id).ids;persistCatalogCompare();renderCatalog();renderSelection();document.getElementById('selection-compare-'+id)?.focus();
}
function clearSelectionCompare(){clearCatalogCompare();renderSelection();document.getElementById('selection-step-title')?.focus();}
function selectionStatus(key){var status=document.getElementById('selection-status');if(status)status.textContent=selectionText(key);}
function selectionHandoff(id){try{return getSelectionEngine().handoff(selectionState.value,id,lang);}catch(error){selectionStatus('invalid');return null;}}
function addSelectionRfq(id){
  if(rfqListState.busy){selectionStatus('busy');return;}
  if(rfqListState.items.length>=DongDaRfqList.maxItems){selectionStatus('limited');return;}
  var demand=selectionHandoff(id);if(!demand)return;addRfqProduct(demand.productId,Object.assign({},demand.specifications),Object.assign({},demand.customization));
}
function hasSelectionQuoteDraft(){return Boolean(qState.prodId||qState.receipt||DongDaCustomization.hasValue(qState.customization)||['q-company','q-contact','q-email','q-tel','q-note'].some(function(id){return fieldValue(id)!=='';}));}
function prepareSelectionQuote(id){
  if(qState.busy){selectionStatus('busy');return;}var demand=selectionHandoff(id);if(!demand)return;
  if(hasSelectionQuoteDraft()){selectionState.pendingQuote=demand;renderSelectionConflict();return;}applySelectionQuote(demand,false);
}
function renderSelectionConflict(){
  var panel=document.getElementById('selection-quote-conflict');if(!panel)return;panel.hidden=false;panel.innerHTML='<p role="alert">'+esc(selectionText('conflict'))+'</p><div><button type="button" class="catalog-command" onclick="keepSelectionQuote()">'+esc(selectionText('keep'))+'</button><button type="button" class="catalog-command" onclick="confirmSelectionQuote()">'+esc(selectionText('replace'))+'</button><button type="button" class="catalog-icon-button" title="'+esc(selectionText('cancel'))+'" aria-label="'+esc(selectionText('cancel'))+'" onclick="cancelSelectionQuote()">'+catalogIcon('X')+'</button></div>';panel.querySelector('button').focus();
}
function cancelSelectionQuote(){selectionState.pendingQuote=null;var panel=document.getElementById('selection-quote-conflict');if(panel)panel.hidden=true;}
function keepSelectionQuote(){cancelSelectionQuote();nav('quote');}
function confirmSelectionQuote(){if(!selectionState.pendingQuote)return;if(qState.busy){selectionStatus('busy');return;}var demand=selectionState.pendingQuote;applySelectionQuote(demand,true);}
function applySelectionQuote(demand,replace){
  if(qState.busy)return;
  if(replace){qReset();['q-company','q-contact','q-email','q-tel','q-note'].forEach(function(id){var field=document.getElementById(id);if(field)field.value='';});}
  selectionState.pendingQuote=null;qSelectProd(demand.productId);qState.specs=Object.assign({},demand.specifications);qState.qty=0;qState.customization=DongDaCustomization.draft(demand.customization);nav('quote');if(qState.step===1)qNext(1);
}
