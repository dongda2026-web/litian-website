(function(root){
  'use strict';
  var version='2026.10.09-motion-v1';
  var fade='.adv-item,.esg-metric,.esg-pillar,.fade-in-up,.hnav-card,.pillar,.base-row,.news-item,.cert,.pl2,.gstat,.partner-logo,.num-item';
  var images='.card-media,.prod-card-img,.fw,.fac-cell';
  var reveals='.rv,.rv-title,.rv-body,.rv-num,.reveal,.reveal-left,.reveal-right';
  var selector=fade+','+images+','+reveals;

  function createController(host){
    var doc=host.document,observer=null,frame=null,stopped=false,failed=false;
    var pending=new Set(),completed=new WeakSet(),media=null;
    try{if(typeof host.matchMedia==='function')media=host.matchMedia('(prefers-reduced-motion: reduce)');}catch(_error){}
    function reduced(){return Boolean(media&&media.matches);}
    function active(el){var page=el.closest('.page');return el.isConnected&&(!page||page.classList.contains('on'));}
    function show(el){
      el.classList.remove('dd-motion-pending');
      el.classList.add('in','visible','is-visible');
      completed.add(el);pending.delete(el);
    }
    function disconnect(){if(observer)observer.disconnect();pending.forEach(show);pending.clear();}
    function plain(){disconnect();doc.querySelectorAll(selector).forEach(function(el){el.style.transitionDelay='';show(el);});doc.documentElement.dataset.ddMotion='static';}
    function intersect(entries){
      entries.forEach(function(entry){
        if(!pending.has(entry.target))return;
        if(!active(entry.target)){observer.unobserve(entry.target);show(entry.target);return;}
        if(entry.isIntersecting){observer.unobserve(entry.target);show(entry.target);}
      });
    }
    function refreshNow(){
      frame=null;if(stopped)return;
      if(reduced()||failed||typeof host.IntersectionObserver!=='function'){plain();return;}
      if(doc.hidden){disconnect();doc.documentElement.dataset.ddMotion='paused';return;}
      try{
        if(!observer)observer=new host.IntersectionObserver(intersect,{threshold:0.08,rootMargin:'0px 0px -30px 0px'});
        pending.forEach(function(el){if(!active(el)){observer.unobserve(el);show(el);}});
        var groups=new Map();
        doc.querySelectorAll(selector).forEach(function(el){
          if(!active(el)||completed.has(el)||pending.has(el))return;
          if(el.matches(images))el.classList.add('reveal-img-wrapper');
          if(el.matches(fade))el.classList.add('fade-in-up');
          if(el.classList.contains('in')||el.classList.contains('visible')||el.classList.contains('is-visible')){show(el);return;}
          var parent=el.parentNode,index=groups.get(parent)||0;groups.set(parent,index+1);
          el.style.transitionDelay=((index%4)*0.08).toFixed(2)+'s';
          pending.add(el);el.classList.add('dd-motion-pending');observer.observe(el);
        });
        doc.documentElement.dataset.ddMotion='animated';
      }catch(_error){failed=true;plain();}
    }
    function refresh(){
      if(stopped||frame!==null)return;
      if(reduced()||typeof host.requestAnimationFrame!=='function'){refreshNow();return;}
      frame=host.requestAnimationFrame(refreshNow);
    }
    function cancel(){if(frame!==null&&typeof host.cancelAnimationFrame==='function')host.cancelAnimationFrame(frame);frame=null;}
    function preference(){cancel();refreshNow();}
    function pause(){cancel();disconnect();doc.documentElement.dataset.ddMotion='paused';}
    function visibility(){if(doc.hidden)pause();else refresh();}
    function destroy(){
      if(stopped)return;stopped=true;cancel();plain();
      if(media){if(typeof media.removeEventListener==='function')media.removeEventListener('change',preference);else if(typeof media.removeListener==='function')media.removeListener(preference);}
      doc.removeEventListener('visibilitychange',visibility);host.removeEventListener('pagehide',pause);host.removeEventListener('pageshow',refresh);
    }
    if(media){if(typeof media.addEventListener==='function')media.addEventListener('change',preference);else if(typeof media.addListener==='function')media.addListener(preference);}
    doc.addEventListener('visibilitychange',visibility);host.addEventListener('pagehide',pause);host.addEventListener('pageshow',refresh);
    return Object.freeze({refresh:refresh,destroy:destroy});
  }
  var controller=root.document?createController(root):null;
  var refresh=function(){if(controller)controller.refresh();};
  root.DongDaPublicMotion=Object.freeze({version:version,selector:selector,createController:createController,refresh:refresh});
  if(controller){
    root.refreshRevealObserver=refresh;root.refreshRevealImgObserver=refresh;
    if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();
  }
})(typeof window!=='undefined'?window:globalThis);
