(function(root){
  'use strict';
  var ids=Object.freeze(['lead-status','q-spec-status','quote-status','rfq-list-status','sample-status']);
  var keys={rfq:['contact','complete','pending','emailOnly','timeout','rate-limit','retry','blocked','conflict'],list:['storage','restoration','limit','invalid','ackPending'],sample:['invalid','pending','notConnected','retry'],customization:['invalid','retry'],confirmation:['q_ok_s'],assistant:['sent']};
  Object.keys(keys).forEach(function(source){Object.freeze(keys[source]);});Object.freeze(keys);
  var bindings=new Map();
  function checkId(id){if(!ids.includes(id))throw new TypeError('Unknown lead status region');}
  function text(source,key,locale){
    if(!Object.hasOwn(keys,source)||!keys[source].includes(key))throw new TypeError('Unknown lead status message');
    var language=['en','zh','ru'].includes(locale)?locale:'en',value;
    if(source==='assistant')value=root.DongDaPublicProcurement.assistant(language)[key];
    else{
      var table=source==='list'?root.DONGDA_LIST_COPY:source==='sample'?root.DONGDA_SAMPLE_COPY:source==='customization'?root.DONGDA_CUSTOMIZATION_COPY:root.DONGDA_RFQ_COPY;
      var copy=table&&Object.hasOwn(table,language)?table[language]:null;
      if(source==='confirmation')copy=copy&&copy.copies;
      value=copy&&Object.hasOwn(copy,key)?copy[key]:null;
    }
    if(typeof value!=='string'||!value||value.length>4096)throw new TypeError('Missing lead status copy');
    return value;
  }
  function show(kind,legacyText,id,source,key){
    id=id||'lead-status';checkId(id);
    if(!['info','pending','error'].includes(kind))throw new TypeError('Unknown lead status kind');
    var message=source===undefined&&key===undefined?legacyText:text(source,key,root.lang);
    if(typeof message!=='string'||message.length>4096)throw new TypeError('Invalid lead status text');
    var el=root.document.getElementById(id);if(!el)return false;
    if(source===undefined)bindings.delete(id);else bindings.set(id,Object.freeze({kind:kind,source:source,key:key}));
    el.className='lead-status show'+(kind==='error'?' error':'');el.textContent=message;return true;
  }
  function clear(id){
    id=id||'lead-status';checkId(id);bindings.delete(id);
    var el=root.document.getElementById(id);if(el){el.className='lead-status';el.textContent='';}
  }
  function sync(locale){
    bindings.forEach(function(binding,id){
      var el=root.document.getElementById(id);
      if(!el||!el.classList.contains('show')){bindings.delete(id);return;}
      el.textContent=text(binding.source,binding.key,locale);
    });
  }
  root.DongDaLeadStatus=Object.freeze({version:'2026.10.09-lead-status-v1',ids:ids,keys:keys,text:text,show:show,clear:clear,sync:sync});
})(globalThis);
