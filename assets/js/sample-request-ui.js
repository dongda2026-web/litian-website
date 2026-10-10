var sampleState={productId:'',busy:false,receipt:null,retryConflict:false};
function sampleText(key){return (DONGDA_SAMPLE_COPY[lang]||DONGDA_SAMPLE_COPY.en)[key]||key;}
function sampleProductChanged(id){
  if(sampleState.busy)return;
  var product=catalog.resolve(id);sampleState.productId=product&&product.kind==='product'?product.id:'';
  if(sampleState.productId&&window.DongDaFieldFeedback)DongDaFieldFeedback.clear('sample-product');
  try{sessionStorage.setItem('dongda-sample-product-v1',sampleState.productId);}catch(error){}
  renderSampleRequest();
  if(document.getElementById('page-sample').classList.contains('on'))history.replaceState(null,'','/#sample'+(sampleState.productId?'/'+sampleState.productId:''));
}
function startSampleRequest(id){
  if(sampleState.busy)return;
  var next=catalog.resolve(id);
  if(sampleState.receipt&&next&&next.kind==='product'&&next.id!==sampleState.productId)newSampleRequest();
  if(id)sampleProductChanged(id);
  nav('sample');
}
function restoreSampleRequest(){
  try{
    var product=catalog.resolve(sessionStorage.getItem('dongda-sample-product-v1'));
    if(product&&product.kind==='product')sampleState.productId=product.id;
    var receipt=sessionStorage.getItem('dongda-sample-receipt-v1');
    if(/^DD-[A-Z0-9-]{8,80}$/.test(receipt||''))sampleState.receipt=receipt;
  }catch(error){}
}
function renderSampleRequest(){
  var select=document.getElementById('sample-product');if(!select)return;
  select.innerHTML='<option value="">'+esc(sampleText('choose'))+'</option>'+catalog.all.filter(function(product){return product.kind==='product';}).map(function(product){return '<option value="'+esc(product.id)+'"'+(product.id===sampleState.productId?' selected':'')+'>'+esc(localText(product.name))+'</option>';}).join('');
  document.querySelectorAll('[data-sample-copy]').forEach(function(el){el.textContent=sampleText(el.getAttribute('data-sample-copy'));});
  var product=catalog.resolve(sampleState.productId),image=document.getElementById('sample-image');
  image.hidden=!product||product.mediaRole==='production-reference';
  if(!image.hidden){image.src='/'+product.image;image.alt=localText(product.name);}
  document.getElementById('sample-name').textContent=product?localText(product.name):sampleText('product');
  document.getElementById('sample-media-note').textContent=product?catalogText(product.mediaRole==='production-reference'?'samplePending':product.mediaRole==='customer-example'?'customerExample':'sample'):'';
  document.getElementById('sample-form').hidden=!!sampleState.receipt;
  document.getElementById('sample-receipt').hidden=!sampleState.receipt;
  document.getElementById('sample-reference').textContent=sampleState.receipt?sampleText('received')+sampleState.receipt:'';
  document.getElementById('sample-fields').disabled=sampleState.busy;
  document.getElementById('sample-submit').innerHTML=catalogIcon('ClipboardList')+esc(sampleText(sampleState.busy?'pending':'submit'));
  document.getElementById('sample-submit').disabled=sampleState.busy;
  document.getElementById('sample-new').innerHTML=catalogIcon('ListPlus')+esc(sampleText('newRequest'));
  document.getElementById('sample-new').hidden=!sampleState.receipt&&!sampleState.retryConflict;
  if(window.DongDaFieldFeedback)DongDaFieldFeedback.sync();
}
function sampleNeeds(){
  var raw={};Object.keys(DongDaSampleRequest.limits).forEach(function(key){raw[key]=fieldValue('sample-'+key);});
  raw.costTermsAcknowledged=document.getElementById('sample-costTermsAcknowledged').checked;return raw;
}
function sampleFeedbackCode(key){
  if(key==='quantity'||key==='expectedPurchaseQuantity')return 'quantity';
  if(key==='costTermsAcknowledged')return 'acknowledge';
  if(key==='product')return 'choose';
  return fieldValue('sample-'+key)?'invalid':'required';
}
function refreshSampleFeedback(id){
  var key=id.slice(7),invalid=key==='product'?!catalog.resolve(sampleState.productId):DongDaSampleRequest.errors(sampleNeeds()).includes(key);
  if(invalid)DongDaFieldFeedback.show(id,sampleFeedbackCode(key));else DongDaFieldFeedback.clear(id);
}
async function submitSampleRequest(event){
  event.preventDefault();if(sampleState.busy||sampleState.receipt)return;
  document.querySelectorAll('#sample-form [aria-invalid]').forEach(function(el){el.removeAttribute('aria-invalid');});
  if(window.DongDaFieldFeedback)DongDaFieldFeedback.clearWithin(document.getElementById('sample-form'));
  if(!validateContactFields(['sample-company','sample-contact','sample-email'],'sample-status'))return;
  var raw=sampleNeeds();
  var errors=DongDaSampleRequest.errors(raw),product=catalog.resolve(sampleState.productId);
  if(!product||product.kind!=='product')errors.unshift('product');
  if(errors.length){errors.forEach(function(key){document.getElementById('sample-'+key)?.setAttribute('aria-invalid','true');if(window.DongDaFieldFeedback)DongDaFieldFeedback.show('sample-'+key,sampleFeedbackCode(key));});setLeadStatus('error',sampleText('invalid'),'sample-status','sample','invalid');document.getElementById('sample-'+errors[0])?.focus();return;}
  var payload={type:'sample-request',company:fieldValue('sample-company'),contact:fieldValue('sample-contact'),email:fieldValue('sample-email'),phone:fieldValue('sample-phone'),product:DongDaCatalog.localized(product.name,'en'),productId:product.id,quantity:'',quantityUnit:'',specifications:'',sampleRequest:DongDaSampleRequest.validate(raw),notes:fieldValue('sample-notes'),language:lang,page:location.href,honeypot:fieldValue('sample-honeypot')};
  sampleState.busy=true;renderSampleRequest();setLeadStatus('pending',sampleText('pending'),'sample-status','sample','pending');
  try{
    var key=await rfqRequestKey(payload,'dongda-sample-request-v1');
    var result=await DongDaProcurement.submitInquiry(payload,{endpoint:window.DONGDA_INQUIRY_ENDPOINT||window.LITIAN_INQUIRY_ENDPOINT||'',idempotencyKey:key});
    if(result.ok){sampleState.receipt=result.leadId;saveLeadLocal(result);try{sessionStorage.setItem('dongda-sample-receipt-v1',result.leadId);}catch(error){}document.getElementById('sample-form').reset();document.getElementById('sample-status').classList.remove('show');if(window.DongDaLeadStatus)DongDaLeadStatus.clear('sample-status');}
    else{var source=['timeout','rate-limit','conflict'].includes(result.reason)?'rfq':'sample',key=result.reason==='email-only'?'notConnected':source==='rfq'?result.reason:'retry';sampleState.retryConflict=key==='conflict';setLeadStatus('error',source==='rfq'?rfqText(key):sampleText(key),'sample-status',source,key);}
  }catch(error){var conflict=error.code==='retry_identity_conflict';sampleState.retryConflict=conflict;setLeadStatus('error',conflict?rfqText('conflict'):sampleText('retry'),'sample-status',conflict?'rfq':'sample',conflict?'conflict':'retry');}
  finally{sampleState.busy=false;renderSampleRequest();}
}
function newSampleRequest(){
  if(sampleState.busy)return;
  sampleState.retryConflict=false;rfqRetryRecords['dongda-sample-request-v1']=null;
  sampleState.receipt=null;document.getElementById('sample-form').reset();document.getElementById('sample-status').classList.remove('show');
  if(window.DongDaLeadStatus)DongDaLeadStatus.clear('sample-status');
  if(window.DongDaFieldFeedback)DongDaFieldFeedback.clearWithin(document.getElementById('sample-form'));
  document.querySelectorAll('#sample-form [aria-invalid]').forEach(function(el){el.removeAttribute('aria-invalid');});
  try{sessionStorage.removeItem('dongda-sample-request-v1');sessionStorage.removeItem('dongda-sample-receipt-v1');}catch(error){}
  renderSampleRequest();
}
