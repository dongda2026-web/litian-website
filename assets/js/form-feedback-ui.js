(function(root){
  'use strict';
  var core=root.DongDaFormFeedbackCore,records=new Map(),attachments=new WeakMap();
  var contactIds=new Set(['fi1','fi2','fi3','fi5','q-company','q-contact','q-email','rfq-company','rfq-contact','rfq-email','rfq-destination','sample-company','sample-contact','sample-email']);
  function field(value){
    var element=typeof value==='string'?document.getElementById(value):value;
    if(!element||!['INPUT','SELECT','TEXTAREA'].includes(element.tagName)||!element.id||element.id.length>128||!/^[a-zA-Z0-9-]+$/.test(element.id)||!element.closest('#iform,#page-quote,#page-rfq,#sample-form')||/honeypot|fi_hp/.test(element.id))return null;
    return element;
  }
  function language(){return typeof root.lang==='string'?root.lang:'en';}
  function nativeError(element){return element?core.contactError({value:element.value,valid:element.checkValidity(),typeMismatch:element.validity.typeMismatch}):'required';}
  function render(element,record){
    var text=core.message(record.code,language(),record.minimum),id=element.id+'-error',node=document.getElementById(id),ownership=attachments.get(element);
    if(!ownership){
      var legacy=!!node&&node.classList.contains('q-field-error');
      if(node&&!legacy&&node.getAttribute('data-dd-field-error')!==element.id)throw new TypeError('Field feedback ID collision');
      if(!node){
        node=document.createElement('span');node.id=id;
        var holder=element.closest('.fg,.q-field,.rfq-field,.customization-field'),ack=element.closest('.sample-ack');
        if(ack)ack.insertAdjacentElement('afterend',node);else (holder||element.parentElement).appendChild(node);
      }
      var tokens=(element.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean);
      ownership={id:id,added:!tokens.includes(id),legacy:legacy};attachments.set(element,ownership);
      if(ownership.added)element.setAttribute('aria-describedby',Array.from(new Set(tokens.concat(id))).join(' '));
    }
    node.setAttribute('data-dd-field-error',element.id);node.classList.add('dd-field-error');node.textContent=text;node.hidden=false;element.setAttribute('aria-invalid','true');
  }
  function show(value,code,minimum){
    var element=field(value);if(!element)return null;
    core.message(code,language(),minimum);
    if(!records.has(element.id)&&records.size>=core.maxFields)throw new RangeError('Too many field feedback entries');
    var record={code:code};if(code==='minimum')record.minimum=minimum;
    records.set(element.id,Object.freeze(record));render(element,record);return element;
  }
  function clear(value){
    var element=field(value),id=typeof value==='string'?value:element&&element.id;if(id)records.delete(id);if(!element)return;
    var ownership=attachments.get(element),node=ownership&&document.getElementById(ownership.id);
    if(node&&node.getAttribute('data-dd-field-error')===element.id){node.textContent='';node.hidden=true;}
    if(ownership&&ownership.added){var tokens=(element.getAttribute('aria-describedby')||'').split(/\s+/).filter(function(token){return token&&token!==ownership.id;});if(tokens.length)element.setAttribute('aria-describedby',tokens.join(' '));else element.removeAttribute('aria-describedby');}
    element.removeAttribute('aria-invalid');attachments.delete(element);
  }
  function clearWithin(container){if(!container)return;Array.from(container.querySelectorAll('input,select,textarea')).forEach(clear);}
  function sync(){records.forEach(function(record,id){var element=field(id);if(element)render(element,record);else records.delete(id);});}
  function changed(event){
    var element=field(event.target);if(!element||!records.has(element.id))return;
    if(contactIds.has(element.id)){var code=nativeError(element);if(code)show(element,code);else clear(element);}
    else if(element.id.startsWith('sample-')&&typeof root.refreshSampleFeedback==='function')root.refreshSampleFeedback(element.id);
  }
  document.addEventListener('input',changed);document.addEventListener('change',changed);
  root.DongDaFieldFeedback=Object.freeze({show:show,clear:clear,clearWithin:clearWithin,sync:sync,nativeError:nativeError});
})(globalThis);
