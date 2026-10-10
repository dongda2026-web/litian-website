(function(root){
  'use strict';
  var core=root.DongDaProductInspectionCore,dialog=document.getElementById('lbx'),panel=document.getElementById('product-inspection');
  if(!core||!dialog||!panel)return;
  var catalog=root.DongDaCatalog.create(root.DONGDA_CATALOG_DATA),stage=document.getElementById('inspection-stage'),viewport=document.getElementById('inspection-viewport'),status=document.getElementById('inspection-status'),retry=document.getElementById('inspection-retry'),output=document.getElementById('inspection-scale');
  var image=null,panzoom=null,geometry=null,observer=null,timer=null,generation=0,current=null,lastWidth=0,lastHeight=0;
  var controls=Array.from(panel.querySelectorAll('[data-inspection-action]'));
  function locale(){return core.language(document.documentElement.lang);}
  function icon(name){
    var data=root.DONGDA_CATALOG_ICONS[name],svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');svg.setAttribute('aria-hidden','true');
    (data||[]).forEach(function(node){var child=document.createElementNS(svg.namespaceURI,node[0]);Object.keys(node[1]).forEach(function(key){child.setAttribute(key,node[1][key]);});svg.append(child);});return svg;
  }
  function labels(){
    panel.querySelectorAll('[data-inspection-label]').forEach(function(el){var label=core.text(el.dataset.inspectionLabel,locale());el.setAttribute('aria-label',label);el.setAttribute('title',label);});
    retry.textContent=core.text('retry',locale());
    panel.querySelector('.inspection-toolbar').setAttribute('aria-label',core.text('zoom',locale()));
  }
  function destroyPanzoom(){if(panzoom){panzoom.destroy();panzoom.resetStyle();panzoom=null;}}
  function dispose(){
    generation++;clearTimeout(timer);timer=null;if(observer){observer.disconnect();observer=null;}destroyPanzoom();
    if(image){image.onload=null;image.onerror=null;image.remove();image=null;}
    current=null;geometry=null;lastWidth=lastHeight=0;panel.hidden=true;dialog.classList.remove('product-inspection-mode');delete dialog.dataset.inspectionProduct;delete viewport.dataset.scale;
  }
  function close(){if(current)root.DongDaPublicAccessibility.close('lbx');}
  function state(kind){
    var retryFocused=document.activeElement===retry;
    panel.dataset.state=kind;status.textContent=kind==='ready'?'':core.text(kind==='failed'?'failed':'loading',locale());retry.hidden=kind!=='failed';output.textContent=kind==='ready'?output.textContent:'';
    controls.forEach(function(button){button.disabled=kind!=='ready';});viewport.hidden=kind!=='ready';
    if(retryFocused&&retry.hidden)dialog.querySelector('[data-dialog-focus]').focus({preventScroll:true});
  }
  function update(){
    if(!panzoom||!geometry)return;
    var focused=document.activeElement,value=panzoom.getScale();viewport.dataset.scale=String(value);output.textContent=Math.round(value/geometry.actualScale*100)+'%';
    controls.forEach(function(button){button.disabled=button.dataset.inspectionAction==='zoomIn'?value>=geometry.maxScale-0.001:button.dataset.inspectionAction==='zoomOut'?value<=1.001:false;});
    if(controls.includes(focused)&&focused.disabled)controls.find(function(button){return !button.disabled;}).focus({preventScroll:true});
  }
  function measure(){
    if(!current||!image||!image.naturalWidth||!stage.clientWidth||!stage.clientHeight)return;
    if(panzoom&&lastWidth===stage.clientWidth&&lastHeight===stage.clientHeight)return;
    lastWidth=stage.clientWidth;lastHeight=stage.clientHeight;destroyPanzoom();
    geometry=core.frame(image.naturalWidth,image.naturalHeight,lastWidth,lastHeight);viewport.style.width=geometry.width+'px';viewport.style.height=geometry.height+'px';
    panzoom=root.Panzoom(image,{canvas:true,contain:'outside',minScale:1,maxScale:geometry.maxScale,startScale:1,panOnlyWhenZoomed:true,pinchAndPan:true,animate:false});
    update();
  }
  function failed(epoch){if(epoch!==generation||!current)return;clearTimeout(timer);destroyPanzoom();if(image){image.onload=null;image.onerror=null;image.hidden=true;}state('failed');}
  function load(){
    var epoch=++generation;clearTimeout(timer);destroyPanzoom();if(image){image.onload=null;image.onerror=null;image.remove();}
    geometry=null;lastWidth=lastHeight=0;state('loading');
    image=document.createElement('img');image.className='inspection-image';image.alt=root.DongDaCatalog.localized(current.name,locale());image.draggable=false;viewport.append(image);
    image.addEventListener('panzoomchange',function(){if(epoch===generation&&current)update();});
    image.onload=function(){
      if(epoch!==generation||!current)return;clearTimeout(timer);
      try{state('ready');measure();if(!panzoom)throw new Error('Image geometry unavailable');}catch{failed(epoch);}
    };
    image.onerror=function(){failed(epoch);};timer=setTimeout(function(){failed(epoch);},12000);image.src='/'+current.image;
  }
  function open(product){
    dispose();current=product;root.lbMode='product';dialog.classList.add('product-inspection-mode');dialog.dataset.inspectionProduct=product.id;panel.hidden=false;labels();
    document.getElementById('inspection-title').textContent=root.DongDaCatalog.localized(product.name,locale());
    document.getElementById('inspection-caption').textContent=root.DongDaCatalogCopy.text(product.mediaRole==='customer-example'?'customerExample':'sample',locale());
    root.DongDaPublicAccessibility.open('lbx');observer=new ResizeObserver(function(){if(panel.dataset.state==='ready')measure();});observer.observe(stage);load();
  }
  document.addEventListener('click',function(event){
    var trigger=event.target.closest&&event.target.closest('[data-product-inspection]');
    if(!trigger||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||typeof root.Panzoom!=='function'||typeof ResizeObserver!=='function')return;
    if(!trigger.closest('#pd-media')||!trigger.closest('#page-product-detail.on'))return;
    var product=core.resolve(catalog,trigger.dataset.productInspection);
    if(!product||trigger.getAttribute('href')!=='/'+product.image)return;
    event.preventDefault();open(product);
  });
  function action(command){
    if(!panzoom||!geometry)return;
    if(command==='zoomIn')panzoom.zoomIn();else if(command==='zoomOut')panzoom.zoomOut();
    else if(command==='fit')panzoom.reset({animate:false});
    else if(command==='actual'){panzoom.zoom(core.scale(geometry.actualScale,geometry),{animate:false});var epoch=generation;requestAnimationFrame(function(){if(epoch===generation&&panzoom)panzoom.pan(0,0,{force:true});});}
  }
  controls.forEach(function(button){button.addEventListener('click',function(){action(button.dataset.inspectionAction);});});
  retry.addEventListener('click',function(){if(current)load();});
  stage.addEventListener('wheel',function(event){if(panzoom)panzoom.zoomWithWheel(event);},{passive:false});
  dialog.addEventListener('keydown',function(event){
    if(!current||!panzoom||event.ctrlKey||event.metaKey||event.altKey)return;
    var key=event.key;
    if(key==='+'||key==='='){event.preventDefault();action('zoomIn');}
    else if(key==='-'){event.preventDefault();action('zoomOut');}
    else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)){
      event.preventDefault();var pan=panzoom.getPan(),step=48/panzoom.getScale();panzoom.pan(pan.x+(key==='ArrowLeft'?step:key==='ArrowRight'?-step:0),pan.y+(key==='ArrowUp'?step:key==='ArrowDown'?-step:0));
    }
  });
  dialog.addEventListener('close',dispose);
  panel.querySelectorAll('[data-inspection-icon]').forEach(function(el){el.replaceChildren(icon(el.dataset.inspectionIcon));});
  root.DongDaProductInspection=Object.freeze({close:close,prepareLegacy:dispose});
})(globalThis);
