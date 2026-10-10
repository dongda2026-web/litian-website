(function(){
  'use strict';
  var core=window.DongDaAccessibility,active=null,opener=null,previousOverflow='',clickSource=null,backdropStarts=Object.create(null);
  var byId=function(id){return document.getElementById(id);};
  function focus(element){if(element&&element.isConnected&&!element.closest('[hidden], [inert]')&&element.getClientRects().length)element.focus({preventScroll:true});}
  function syncModal(){var hamburger=byId('nav-hamburger');if(hamburger){hamburger.classList.toggle('open',active==='nav-overlay');hamburger.setAttribute('aria-expanded',String(active==='nav-overlay'));}}
  function cleanup(id,restore){
    var dialog=byId(id);dialog.classList.remove(core.dialogs[id]);
    if(active!==id)return;
    active=null;document.body.style.overflow=previousOverflow;syncModal();
    var target=opener;opener=null;if(restore)focus(target);
  }
  function close(id,restore){
    if(!Object.hasOwn(core.dialogs,id))throw new TypeError('Unknown public dialog');
    var dialog=byId(id);if(!dialog.open)return;
    dialog.close();cleanup(id,restore!==false);
  }
  function languageMenu(open,restore){
    var menu=byId('nl-menu'),button=byId('nav-lang-btn');
    var wasInside=menu.contains(document.activeElement);
    menu.hidden=!open;menu.inert=!open;menu.classList.toggle('open',open);button.setAttribute('aria-expanded',String(open));
    if(!open&&restore&&wasInside)focus(button);
  }
  function assistant(open,restore){
    var panel=byId('ai-panel'),button=document.querySelector('.ai-fab'),wasInside=panel.contains(document.activeElement);
    panel.hidden=!open;panel.inert=!open;panel.classList.toggle('open',open);button.setAttribute('aria-expanded',String(open));
    if(open)focus(byId('ai-input'));else if(restore&&wasInside)focus(button);
  }
  function open(id){
    if(!Object.hasOwn(core.dialogs,id))throw new TypeError('Unknown public dialog');
    var dialog=byId(id);if(dialog.open)return;
    var trigger=clickSource||document.activeElement;clickSource=null;
    if(active)close(active,false);
    languageMenu(false,false);if(typeof aiClose==='function')aiClose(false);
    previousOverflow=document.body.style.overflow;opener=trigger;
    backdropStarts[id]=false;dialog.showModal();active=id;dialog.classList.add(core.dialogs[id]);document.body.style.overflow='hidden';syncModal();
    focus(dialog.querySelector('[data-dialog-focus]'));
  }
  function closeForNavigation(){if(active)close(active,false);languageMenu(false,false);if(typeof aiClose==='function')aiClose(false);}
  function focusPage(){var target=document.querySelector('.page.on h1')||byId('main-content');if(target){target.setAttribute('tabindex','-1');focus(target);}}
  function scrollPage(){var target=document.querySelector('.page.on');if(target)target.scrollIntoView({block:'start',behavior:'instant'});}
  function backToTop(){scrollPage();focusPage();}
  function sync(locale){
    document.querySelectorAll('[data-a11y-label]').forEach(function(node){var label=core.text(node.dataset.a11yLabel,locale);node.setAttribute('aria-label',label);if(node.tagName==='BUTTON'||node.tagName==='A')node.setAttribute('title',label);});
    document.querySelectorAll('[data-a11y-text]').forEach(function(node){node.textContent=core.text(node.dataset.a11yText,locale);});
    document.querySelectorAll('[data-a11y-icon]').forEach(function(node){node.innerHTML=catalogIcon(node.dataset.a11yIcon);});
    byId('skip-main').setAttribute('href',location.pathname+'#main-content');
  }
  document.addEventListener('click',function(event){clickSource=event.target.closest('button,a,[role="button"]');queueMicrotask(function(){clickSource=null;});},true);
  Object.keys(core.dialogs).forEach(function(id){
    var dialog=byId(id);
    dialog.addEventListener('cancel',function(event){event.preventDefault();close(id);});
    dialog.addEventListener('close',function(){if(!dialog.open)cleanup(id,true);});
    dialog.addEventListener('pointerdown',function(event){backdropStarts[id]=event.target===dialog;});
    dialog.addEventListener('click',function(event){var started=backdropStarts[id];backdropStarts[id]=false;if(started&&event.target===dialog&&id!=='nav-overlay')close(id);});
  });
  byId('skip-main').addEventListener('click',function(event){event.preventDefault();backToTop();});
  document.addEventListener('click',function(event){if(!event.target.closest('#nav-lang-switch'))languageMenu(false,false);});
  document.addEventListener('focusin',function(event){if(!byId('nav-lang-switch').contains(event.target))languageMenu(false,false);});
  document.addEventListener('keydown',function(event){
    // Keep the native dialog's Tab boundary inside embedded browser hosts.
    if(event.key==='Tab'&&active){
      var dialog=byId(active),controls=Array.from(dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(function(node){return node.tabIndex>=0&&!node.closest('[hidden], [inert]')&&node.getClientRects().length;});
      var first=controls[0],last=controls[controls.length-1];
      if((event.shiftKey&&document.activeElement===first)||(!event.shiftKey&&document.activeElement===last)){event.preventDefault();focus(event.shiftKey?last:first);}
    }
    if(event.key==='Escape'&&!active){
      if(byId('nl-menu').classList.contains('open')){event.preventDefault();languageMenu(false,true);}
      else if(byId('ai-panel').contains(document.activeElement)&&byId('ai-panel').classList.contains('open')){event.preventDefault();aiClose();}
    }
    var trigger=event.target.closest('[data-media-trigger]');
    if(trigger&&(event.key==='Enter'||event.key===' ')&&trigger.tagName!=='BUTTON'){event.preventDefault();trigger.click();}
  });
  var consent=byId('gdpr');
  if(consent&&typeof ResizeObserver==='function'){
    new ResizeObserver(function(){var height=consent.getBoundingClientRect().height;document.documentElement.style.setProperty('--dd-consent-height',height?Math.ceil(height)+12+'px':'0px');}).observe(consent);
  }
  languageMenu(false,false);assistant(false,false);sync(typeof lang==='string'?lang:'en');
  window.DongDaPublicAccessibility=Object.freeze({open:open,close:close,closeForNavigation:closeForNavigation,focusPage:focusPage,scrollPage:scrollPage,backToTop:backToTop,languageMenu:languageMenu,assistant:assistant,sync:sync});
})();
