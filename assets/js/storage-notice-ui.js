(function(){
  'use strict';
  var core=window.DongDaStorageNotice,notice=document.getElementById('gdpr');
  function storage(){try{return window.localStorage;}catch(error){return null;}}
  function sync(locale){
    document.querySelectorAll('[data-storage-copy]').forEach(function(node){node.textContent=core.text(node.dataset.storageCopy,locale);});
    document.querySelectorAll('[data-storage-label]').forEach(function(node){var label=core.text(node.dataset.storageLabel,locale);node.setAttribute('aria-label',label);if(node.tagName==='BUTTON')node.title=label;});
  }
  function dismiss(){
    core.acknowledge(storage());
    notice.hidden=true;
  }
  sync(typeof lang==='string'?lang:'en');
  notice.hidden=core.acknowledged(storage());
  window.DongDaPublicStorage=Object.freeze({sync:sync,dismiss:dismiss});
})();
