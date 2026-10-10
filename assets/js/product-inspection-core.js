(function(root){
  'use strict';
  var copy={
    en:{view:'View image',zoom:'Image zoom',zoomIn:'Zoom in',zoomOut:'Zoom out',fit:'Fit image',actual:'Actual size',loading:'Loading image',failed:'Image could not be loaded',retry:'Retry',close:'Close'},
    zh:{view:'查看图片',zoom:'图片缩放',zoomIn:'放大',zoomOut:'缩小',fit:'适合窗口',actual:'实际尺寸',loading:'图片加载中',failed:'图片加载失败',retry:'重试',close:'关闭'},
    ru:{view:'Просмотр фото',zoom:'Масштаб фото',zoomIn:'Увеличить',zoomOut:'Уменьшить',fit:'По размеру окна',actual:'Исходный размер',loading:'Загрузка фото',failed:'Не удалось загрузить фото',retry:'Повторить',close:'Закрыть'}
  };
  Object.values(copy).forEach(Object.freeze);Object.freeze(copy);
  function language(value){return Object.hasOwn(copy,value)?value:'en';}
  function text(key,locale){if(!Object.hasOwn(copy.en,key))throw new TypeError('Unknown inspection label');return copy[language(locale)][key];}
  function resolve(catalog,id){
    var product=catalog.resolve(id);
    if(!product||product.kind!=='product'||!['sample','customer-example'].includes(product.mediaRole))return null;
    if(!/^assets\/img\/[a-zA-Z0-9_\-/]+\.(jpg|jpeg|png|webp)$/.test(product.image)||product.image.includes('..'))throw new TypeError('Invalid public product image');
    return product;
  }
  function frame(width,height,availableWidth,availableHeight){
    if(![width,height,availableWidth,availableHeight].every(function(n){return Number.isFinite(n)&&n>0&&n<=32000;}))throw new TypeError('Invalid image geometry');
    var ratio=Math.min(1,availableWidth/width,availableHeight/height),actualScale=1/ratio;
    return Object.freeze({width:width*ratio,height:height*ratio,actualScale:actualScale,minScale:1,maxScale:Math.max(4,actualScale)});
  }
  function scale(value,geometry){
    if(!Number.isFinite(value)||!geometry||!Number.isFinite(geometry.maxScale)||geometry.maxScale<1)throw new TypeError('Invalid image scale');
    return Math.max(1,Math.min(geometry.maxScale,value));
  }
  root.DongDaProductInspectionCore=Object.freeze({version:'2026.10.09-product-inspection-v1',language:language,text:text,resolve:resolve,frame:frame,scale:scale});
})(globalThis);
