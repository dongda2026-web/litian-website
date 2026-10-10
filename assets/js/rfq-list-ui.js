var rfqListState={items:[],busy:false,receipt:null,retryConflict:false},rfqListStorageKey='dongda-rfq-list-v1',rfqRetryRecords=Object.create(null);
function listText(key){return (DONGDA_LIST_COPY[lang]||DONGDA_LIST_COPY.en)[key]||key;}
function listStatus(text,error,source,key){setLeadStatus(error?'error':'pending',text,'rfq-list-status',source,key);}
function clearRfqFeedback(){document.getElementById('rfq-list-status').classList.remove('show');if(window.DongDaLeadStatus)DongDaLeadStatus.clear('rfq-list-status');document.getElementById('rfq-list-email').hidden=true;}
function persistRfqList(){
  try{sessionStorage.setItem(rfqListStorageKey,DongDaRfqList.serialize(rfqListState.items,catalog));}
  catch(error){listStatus(listText('storage'),true,'list','storage');}
}
function restoreRfqList(){
  try{
    var savedLanguage=sessionStorage.getItem('dongda-rfq-language-v1');
    if(['en','zh','ru','kk','ky','tg','tk','uz'].includes(savedLanguage))lang=savedLanguage;
    var saved=sessionStorage.getItem(rfqListStorageKey);if(saved)rfqListState.items=DongDaRfqList.restore(saved,catalog);
    var receipt=sessionStorage.getItem('dongda-rfq-receipt-v1');
    if(!rfqListState.items.length&&/^DD-[A-Z0-9-]{8,80}$/.test(receipt||''))rfqListState.receipt=receipt;
  }
  catch(error){listStatus(listText('restoration'),true,'list','restoration');}
}
function resetRfqReceipt(){
  rfqListState.receipt=null;
  rfqListState.retryConflict=false;rfqRetryRecords['dongda-rfq-request-v1']=null;
  try{sessionStorage.removeItem('dongda-rfq-receipt-v1');sessionStorage.removeItem('dongda-rfq-request-v1');}catch(error){}
  clearRfqFeedback();
}
function addRfqProduct(id,specifications,customization){
  if(rfqListState.busy)return;
  if(rfqListState.items.length>=DongDaRfqList.maxItems){nav('rfq');listStatus(listText('limit'),true,'list','limit');return;}
  var product=catalog.resolve(id);if(!product||product.kind!=='product')return;
  if(rfqListState.receipt)resetRfqReceipt();
  rfqListState.items=DongDaRfqList.draft(rfqListState.items.concat(Object.assign({lineId:'line-'+crypto.randomUUID(),productId:product.id,specifications:specifications||{}},customization ? {customization:DongDaCustomization.draft(customization)} : {})),catalog);
  clearRfqFeedback();
  persistRfqList();renderRfqList();nav('rfq');
}
function addConfiguredRfqProduct(){if(qValidateSpecs())addRfqProduct(qState.prodId,Object.assign({},qState.specs),qState.customization);}
function removeRfqItem(id){
  if(rfqListState.busy)return;
  rfqListState.items=rfqListState.items.filter(function(item){return item.lineId!==id;});clearRfqFeedback();persistRfqList();renderRfqList();
}
function updateRfqField(id,key,value){
  if(rfqListState.busy)return;
  var item=rfqListState.items.find(function(row){return row.lineId===id;});if(!item)return;
  item.specifications[key]=value;persistRfqList();
  document.getElementById('rfq-'+id+'-'+key)?.setAttribute('aria-invalid','false');
  if(window.DongDaFieldFeedback)DongDaFieldFeedback.clear('rfq-'+id+'-'+key);
  if(!document.querySelector('#rfq-list-items [aria-invalid=true]'))clearRfqFeedback();
}
function rfqInput(item,field){
  var id='rfq-'+item.lineId+'-'+field.id,value=item.specifications[field.id]||'';
  var label='<label for="'+id+'">'+esc(localText(field.label))+'</label>';
  if(field.type==='select')return '<div class="rfq-field">'+label+'<select id="'+id+'" onchange="updateRfqField(\''+item.lineId+'\',\''+field.id+'\',this.value)"><option value="">'+esc(rfqText('choose'))+'</option>'+field.opts.map(function(option){return '<option value="'+esc(option.v)+'"'+(value===option.v?' selected':'')+'>'+esc(localText(option.l))+'</option>';}).join('')+'</select></div>';
  return '<div class="rfq-field rfq-quantity">'+label+'<div class="rfq-quantity-input"><input id="'+id+'" type="number" inputmode="numeric" step="1" min="'+DongDaProcurement.minimumQuantity(catalog.resolve(item.productId))+'" max="1000000000" value="'+esc(value)+'" oninput="updateRfqField(\''+item.lineId+'\',\''+field.id+'\',this.value)"><span>'+esc(listText('unit'))+'</span></div></div>';
}
function renderRfqList(){
  var grid=document.getElementById('rfq-list-items');if(!grid)return;
  try{sessionStorage.setItem('dongda-rfq-language-v1',lang);}catch(error){}
  var opened=Array.from(grid.querySelectorAll('details[open]')).map(function(el){return el.getAttribute('data-line')||el.getAttribute('data-custom-prefix');});
  grid.innerHTML=rfqListState.items.map(function(item){
    var product=catalog.resolve(item.productId),quantity=product.configuration.find(function(field){return field.type==='qty';});
    var media=product.mediaRole==='production-reference'?'<span class="rfq-thumb-pending">'+esc(product.code)+'</span>':'<img src="/'+esc(product.image)+'" alt="" loading="lazy" width="88" height="88">';
    return '<article class="rfq-item"><div class="rfq-item-header">'+media+'<div class="rfq-item-name"><span>'+esc(product.code)+'</span><h2><a href="'+DongDaProductPage.path(product,lang)+'" onclick="navProd(\''+product.id+'\');return false;">'+esc(localText(product.name))+'</a></h2></div><button type="button" class="catalog-icon-button" title="'+esc(listText('remove'))+'" aria-label="'+esc(listText('remove'))+' '+esc(localText(product.name))+'" onclick="removeRfqItem(\''+item.lineId+'\')">'+catalogIcon('Trash2')+'</button></div>'
      +rfqInput(item,quantity)+'<details data-line="'+item.lineId+'"'+(opened.includes(item.lineId)?' open':'')+'><summary>'+catalogIcon('Pencil')+esc(listText('specifications'))+'</summary><div class="rfq-spec-grid">'+product.configuration.filter(function(field){return field.type==='select';}).map(function(field){return rfqInput(item,field);}).join('')+'</div></details>'
      +customizationFields('rfq-custom-'+item.lineId,item.customization,'updateRfqCustomization.bind(null,\''+item.lineId+'\')',opened.includes('rfq-custom-'+item.lineId))+'</article>';
  }).join('');
  document.getElementById('rfq-list-empty').hidden=rfqListState.items.length>0;
  document.getElementById('rfq-list-selected').hidden=rfqListState.receipt!==null;
  document.getElementById('rfq-list-selected').setAttribute('aria-label',listText('selected'));
  document.getElementById('rfq-list-layout').classList.toggle('is-received',rfqListState.receipt!==null);
  document.getElementById('rfq-list-form').hidden=rfqListState.receipt!==null;
  document.getElementById('rfq-list-receipt').hidden=rfqListState.receipt===null;
  document.getElementById('rfq-list-new').hidden=!rfqListState.receipt&&!rfqListState.retryConflict;
  document.getElementById('rfq-list-reference').textContent=rfqListState.receipt?listText('received')+rfqListState.receipt:'';
  document.querySelectorAll('[data-rfq-copy]').forEach(function(el){el.textContent=listText(el.getAttribute('data-rfq-copy'));});
  var header=document.getElementById('rfq-header-button');header.title=listText('title');header.setAttribute('aria-label',listText('title')+' '+rfqListState.items.length);header.innerHTML=catalogIcon('ClipboardList')+'<span class="rfq-header-count">'+rfqListState.items.length+'</span>';
  document.getElementById('rfq-list-count').textContent=rfqListState.receipt?listText('submitted'):rfqListState.items.length+' / '+DongDaRfqList.maxItems+' '+listText('items');
  document.getElementById('q-list-add').innerHTML=catalogIcon('ListPlus')+esc(listText('configured'));
  document.getElementById('rfq-list-submit').disabled=rfqListState.items.length===0||rfqListState.busy;
  if(rfqListState.busy)document.getElementById('rfq-list-submit').textContent=listText('ackPending');
  document.getElementById('rfq-contact-fields').disabled=rfqListState.busy;
  grid.querySelectorAll('input,select,textarea,button').forEach(function(el){el.disabled=rfqListState.busy;});
  if(window.DongDaFieldFeedback)DongDaFieldFeedback.sync();
}
async function rfqRequestKey(payload,storageKey){
  storageKey=storageKey||'dongda-rfq-request-v1';
  var cached=rfqRetryRecords[storageKey],saved;
  if(!Object.hasOwn(rfqRetryRecords,storageKey)){
    try{saved=sessionStorage.getItem(storageKey);}catch(error){}
    if(saved)try{cached=JSON.parse(saved);if(!cached)throw new Error('Invalid retry record');}catch(error){error.code='retry_identity_conflict';throw error;}
  }
  var request=await DongDaProcurement.prepareRequest(payload,cached,{language:payload.language,page:payload.page});
  rfqRetryRecords[storageKey]=request.record;
  try{sessionStorage.setItem(storageKey,JSON.stringify(request.record));}catch(error){}
  Object.keys(payload).forEach(function(key){delete payload[key];});Object.assign(payload,request.payload);
  return request.key;
}
async function submitRfqList(event){
  event.preventDefault();if(rfqListState.busy||rfqListState.receipt)return;
  var first=null;
  if(window.DongDaFieldFeedback)DongDaFieldFeedback.clearWithin(document.getElementById('rfq-list-items'));
  rfqListState.items.forEach(function(item){
    var errors=DongDaProcurement.validateConfiguration(catalog.resolve(item.productId),item.specifications);
    Object.keys(errors).forEach(function(key){var el=document.getElementById('rfq-'+item.lineId+'-'+key);if(el){el.setAttribute('aria-invalid','true');if(window.DongDaFieldFeedback)DongDaFieldFeedback.show(el,DongDaFormFeedbackCore.configurationCode(errors[key]),errors[key]==='minimum'?DongDaProcurement.minimumQuantity(catalog.resolve(item.productId)):undefined);var details=el.closest('details');if(details)details.open=true;if(!first)first=el;}});
    var customError=item.customization&&customValidation(item.customization,'rfq-custom-'+item.lineId);if(customError&&!first)first=customError;
  });
  if(first){listStatus(first.id.indexOf('rfq-custom-')===0?customText('invalid'):listText('invalid'),true,first.id.indexOf('rfq-custom-')===0?'customization':'list','invalid');first.focus();return;}
  if(!validateContactFields(['rfq-company','rfq-contact','rfq-email','rfq-destination'],'rfq-list-status'))return;
  var payload;
  try{payload={type:'multi-product-rfq',company:fieldValue('rfq-company'),contact:fieldValue('rfq-contact'),email:fieldValue('rfq-email'),phone:fieldValue('rfq-phone'),product:listText('request')+' ('+rfqListState.items.length+')',productId:'',quantity:'',quantityUnit:'',specifications:'',items:DongDaRfqList.items(rfqListState.items,catalog,'en'),destination:fieldValue('rfq-destination'),deliveryWindow:fieldValue('rfq-delivery'),notes:fieldValue('rfq-notes'),language:lang,page:location.href,honeypot:fieldValue('rfq-honeypot')};}
  catch(error){listStatus(listText('invalid'),true,'list','invalid');return;}
  rfqListState.busy=true;document.getElementById('rfq-list-email').hidden=true;renderRfqList();listStatus(listText('ackPending'),false,'list','ackPending');
  try{
    var key=await rfqRequestKey(payload),result=await DongDaProcurement.submitInquiry(payload,{endpoint:window.DONGDA_INQUIRY_ENDPOINT||window.LITIAN_INQUIRY_ENDPOINT||'',idempotencyKey:key});
    if(result.ok){rfqListState.receipt=result.leadId;saveLeadLocal(result);rfqListState.items=[];persistRfqList();try{sessionStorage.setItem('dongda-rfq-receipt-v1',result.leadId);}catch(error){}document.getElementById('rfq-list-form').reset();document.getElementById('rfq-list-status').classList.remove('show');if(window.DongDaLeadStatus)DongDaLeadStatus.clear('rfq-list-status');}
    else{var customized=payload.items.some(function(item){return item.customization;}),key=result.reason==='conflict'?'conflict':customized?'retry':result.reason==='email-only'?'emailOnly':result.reason==='timeout'?'timeout':result.reason==='rate-limit'?'rate-limit':'retry';rfqListState.retryConflict=key==='conflict';listStatus(customized&&key!=='conflict'?customText(key):rfqText(key),true,customized&&key!=='conflict'?'customization':'rfq',key);if(!customized&&key!=='conflict')showEmailFallback(payload,'rfq-list-email');}
  }catch(error){var key=error.code==='retry_identity_conflict'?'conflict':'retry';rfqListState.retryConflict=key==='conflict';listStatus(rfqText(key),true,'rfq',key);}
  finally{rfqListState.busy=false;renderRfqList();}
}
function newRfqList(){if(rfqListState.busy)return;resetRfqReceipt();renderRfqList();nav('products');}
