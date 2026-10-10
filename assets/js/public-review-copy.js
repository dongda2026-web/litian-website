(function(root){
  'use strict';
  var copy=Object.freeze({zh:'东大 / 包装采购咨询',en:'DongDa / Packaging Enquiries',ru:'DongDa / Запросы по упаковке'});
  root.DongDaPublicReviewCopy=Object.freeze({service:function(locale){return Object.hasOwn(copy,locale)?copy[locale]:copy.en;}});
})(globalThis);
