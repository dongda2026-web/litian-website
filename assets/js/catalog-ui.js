var catalogState={query:'',family:'all',industry:'all',compare:[]};
try{catalogState.compare=JSON.parse(sessionStorage.getItem('dongda-catalog-compare-v1')||'[]');}catch(error){}
function catalogText(key){return DongDaCatalogCopy.text(key,lang);}
function catalogIcon(name){
  var nodes=DONGDA_CATALOG_ICONS[name]||[];
  return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+nodes.map(function(node){return '<'+node[0]+' '+Object.keys(node[1]).map(function(key){return key+'="'+esc(node[1][key])+'"';}).join(' ')+'></'+node[0]+'>';}).join('')+'</svg>';
}
function persistCatalogCompare(){try{sessionStorage.setItem('dongda-catalog-compare-v1',JSON.stringify(catalogState.compare));}catch(error){}}
function setCatalogQuery(query){catalogState.query=query.slice(0,160);renderCatalog();}
function setF(family){catalogState.family=family;renderCatalog();}
function setCatalogIndustry(industry){catalogState.industry=industry;renderCatalog();}
function resetCatalogFilters(){catalogState.query='';catalogState.family='all';catalogState.industry='all';document.getElementById('catalog-search').value='';renderCatalog();}
function toggleCatalogCompare(id){
  catalogState.compare=catalog.toggle(catalogState.compare,id).ids;persistCatalogCompare();renderCatalog();
  var checkbox=document.getElementById('compare-'+id);if(checkbox)checkbox.focus();
}
function clearCatalogCompare(){catalogState.compare=[];persistCatalogCompare();renderCatalog();}
function catalogProductCard(product,withCompare){
  var checked=catalogState.compare.includes(product.id);
  return '<article class="pl2 catalog-product">'+DongDaProductPage.card(product,lang,catalogIcon('ArrowRight'))
    +'<button type="button" class="catalog-command catalog-list-add" onclick="addRfqProduct(\''+product.id+'\')">'+catalogIcon('ListPlus')+esc(catalogText('addList'))+'</button>'
    +(withCompare?'<label class="catalog-compare-check" for="compare-'+product.id+'"><input type="checkbox" id="compare-'+product.id+'"'+(checked?' checked':'')+(!checked&&catalogState.compare.length===3?' disabled':'')+' onchange="toggleCatalogCompare(\''+product.id+'\')"><span>'+esc(catalogText('selection'))+'</span></label>':'')+'</article>';
}
function renderCatalog(){
  var grid=document.getElementById('prod-l2-grid');if(!grid)return;
  document.querySelectorAll('[data-product-link]').forEach(function(link){var product=catalog.resolve(link.getAttribute('data-product-link'));if(product){link.textContent=localText(product.name);if(product.kind==='product')link.href=DongDaProductPage.path(product,lang);}});
  catalogState.compare=catalog.selection(catalogState.compare);
  var found=catalog.search(catalogState);
  grid.innerHTML=found.map(function(product){return catalogProductCard(product,true);}).join('');
  ['search','family','industry'].forEach(function(key){document.getElementById('catalog-'+key+'-label').textContent=catalogText(key);});
  var input=document.getElementById('catalog-search');input.placeholder=catalogText('placeholder');input.value=catalogState.query;
  document.getElementById('catalog-search-icon').innerHTML=catalogIcon('Search');
  ['family','industry'].forEach(function(key){
    var values=key==='family'?DongDaCatalog.families.filter(function(value){return value!=='technical';}):DongDaCatalog.industries;
    var select=document.getElementById('catalog-'+key);
    select.innerHTML='<option value="all">'+esc(catalogText(key==='family'?'all':'allUses'))+'</option>'+values.map(function(value){return '<option value="'+value+'">'+esc(catalogText(key+'_'+value))+'</option>';}).join('');select.value=catalogState[key];
  });
  var reset=document.getElementById('catalog-reset');reset.innerHTML=catalogIcon('X');reset.title=catalogText('clear');reset.setAttribute('aria-label',catalogText('clear'));
  reset.disabled=!catalogState.query&&catalogState.family==='all'&&catalogState.industry==='all';
  document.getElementById('catalog-count').textContent=found.length+' / '+PRODS.length+' '+catalogText('count');
  document.getElementById('catalog-review').textContent=catalogText('terms');
  document.getElementById('catalog-empty').hidden=found.length>0;
  document.getElementById('catalog-empty-title').textContent=catalogText('empty');document.getElementById('catalog-empty-text').textContent=catalogText('emptyText');document.getElementById('catalog-empty-reset').textContent=catalogText('clear');
  document.getElementById('catalog-selection').hidden=catalogState.compare.length===0;
  document.getElementById('catalog-selection-label').textContent=catalogText('selected')+' '+catalogState.compare.length+' / 3';
  var compare=document.getElementById('catalog-compare');compare.innerHTML=catalogIcon('Columns3')+esc(catalogText('compare'));compare.disabled=catalogState.compare.length<2;
  var clear=document.getElementById('catalog-clear-compare');clear.innerHTML=catalogIcon('X');clear.title=catalogText('clearCompare');clear.setAttribute('aria-label',catalogText('clearCompare'));
  var material=catalog.resolve('materials-construction');
  document.getElementById('catalog-technical').innerHTML=material?'<img src="'+esc(material.image)+'" alt="'+esc(localText(material.name))+'" loading="lazy"><div><h2>'+esc(localText(material.name))+'</h2><p>'+esc(localText(material.summary))+'</p><button type="button" class="catalog-command" onclick="openProductSheet(\''+material.id+'\')">'+esc(catalogText('discuss'))+catalogIcon('ArrowRight')+'</button></div>':'';
  var subtitle=document.querySelector('#page-products [data-i="prod_sub"]');if(subtitle)subtitle.textContent=['FIBC','VB','PP'].join(' / ')+' — '+catalogText('review');
}
function openCatalogCompare(){
  var products=catalog.selection(catalogState.compare).map(function(id){return catalog.resolve(id);});if(products.length<2)return;
  document.getElementById('catalog-dialog-title').textContent=catalogText('compare');document.getElementById('catalog-dialog-note').textContent=catalogText('compareNote');
  var close=document.getElementById('catalog-dialog-close');close.innerHTML=catalogIcon('X');close.title=catalogText('close');close.setAttribute('aria-label',catalogText('close'));
  document.getElementById('catalog-table').innerHTML='<thead><tr><th scope="col">'+esc(catalogText('family'))+'</th>'+products.map(function(product){return '<th scope="col">'+(product.mediaRole==='production-reference'?'<p>'+esc(catalogText('samplePending'))+'</p>':'<img src="'+esc(product.image)+'" alt="" width="120" height="90">')+'<a href="'+DongDaProductPage.path(product,lang)+'" onclick="closeCatalogCompare();navProd(\''+product.id+'\');return false;">'+esc(localText(product.name))+'</a><small>'+esc(product.code)+'</small></th>';}).join('')+'</tr></thead><tbody>'
    +products[0].specs.map(function(spec,index){return '<tr><th scope="row">'+esc(localText(spec.label))+'</th>'+products.map(function(product){return '<td>'+esc(localText(product.specs[index].value))+'</td>';}).join('')+'</tr>';}).join('')
    +'<tr><th scope="row">'+esc(catalogText('request'))+'</th>'+products.map(function(product){return '<td><button type="button" class="catalog-command" onclick="closeCatalogCompare();startCatalogQuote(\''+product.id+'\')">'+esc(catalogText('configure'))+'</button></td>';}).join('')+'</tr></tbody>';
  DongDaPublicAccessibility.open('catalog-dialog');
}
function closeCatalogCompare(){DongDaPublicAccessibility.close('catalog-dialog');}
function startCatalogQuote(id){
  var product=catalog.resolve(id);if(!product||product.kind!=='product')return;
  if(qState.receipt||(qState.prodId&&qState.prodId!==product.id))qReset();
  qSelectProd(product.id);nav('quote');if(qState.step===1)qNext(1);
}
function renderCatalogDetail(id){
  var product=catalog.resolve(id);if(!product||product.kind!=='product')return;
  var active=openProd===product.id?Array.prototype.indexOf.call(document.querySelectorAll('.pd-tab'),document.querySelector('.pd-tab.on')):0;openProd=product.id;
  document.getElementById('pd-name').textContent=localText(product.name);document.getElementById('pd-code').textContent=product.code;document.getElementById('pd-desc').textContent=localText(product.summary);
  document.getElementById('pd-hero').style.backgroundImage=product.mediaRole==='production-reference'?'none':'url('+product.image+')';
  document.getElementById('pd-hero').style.backgroundColor='#364f56';
  var sections=DongDaProductPage.sections(product,lang);
  document.getElementById('pd-specs').innerHTML=sections.specs;
  document.getElementById('pd-apps').innerHTML=sections.applications;
  document.getElementById('pd-proc').innerHTML=sections.production;
  document.getElementById('pd-aside').innerHTML=sections.aside;
  document.getElementById('pd-media').innerHTML=sections.media;
  document.getElementById('pd-support').innerHTML=sections.support;
  document.getElementById('rel-grid').innerHTML=PRODS.filter(function(other){return other.id!==product.id;}).slice(0,3).map(function(other){return catalogProductCard(other,false);}).join('');
  switchTab(['specs','apps','proc'][Math.max(0,active)],document.querySelectorAll('.pd-tab')[Math.max(0,active)]);
}

function updateCatalogSeo(product){
  var base=DongDaProductPage.origin(DONGDA_PUBLIC_SEO.canonical);
  var meta=product?DongDaProductPage.metadata(product,lang,base):{title:DONGDA_PUBLIC_SEO.title,description:DONGDA_PUBLIC_SEO.description,canonical:base+'/',locale:'en_US',image:base+'/assets/img/factory_panorama.jpg',robots:'index,follow',alternates:[]};
  updatePublicPageSeo(meta,product?'product':'website','product-seo',product?base+DongDaProductPage.path(product,'en'):null);
}
function updatePublicPageSeo(meta,type,schemaId,defaultHref){
  var head=document.head;
  document.title=meta.title;
  function setMeta(key,value,property){var selector='meta['+(property?'property':'name')+'="'+key+'"]',node=head.querySelector(selector);if(value===null){if(node)node.remove();return;}if(!node){node=document.createElement('meta');node.setAttribute(property?'property':'name',key);head.appendChild(node);}node.content=value;}
  setMeta('description',meta.description);setMeta('robots',meta.robots);
  ['title','description','url','image','locale'].forEach(function(key){setMeta('og:'+key,key==='url'?meta.canonical:meta[key],true);});setMeta('og:type',type,true);
  ['title','description','image'].forEach(function(key){setMeta('twitter:'+key,meta[key]);});setMeta('twitter:card',meta.image?'summary_large_image':'summary');
  head.querySelector('link[rel="canonical"]').href=meta.canonical;
  head.querySelectorAll('[data-product-alternate]').forEach(function(node){node.remove();});
  meta.alternates.concat(defaultHref?[{language:'x-default',href:defaultHref}]:[]).forEach(function(item){var link=document.createElement('link');link.rel='alternate';link.hreflang=item.language;link.href=item.href;link.setAttribute('data-product-alternate','');head.appendChild(link);});
  head.querySelectorAll('#product-seo,#industry-seo,#resource-seo,#insight-seo,#site-search-seo,#faq-seo,#company-seo,#selection-seo').forEach(function(node){node.remove();});
  if(meta.schema){var schema=document.createElement('script');schema.id=schemaId;schema.type='application/ld+json';schema.textContent=JSON.stringify(meta.schema);head.appendChild(schema);}
}
