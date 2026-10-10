(function(root){
  'use strict';
  var MAX_ITEMS=20;
  function object(value){return value&&typeof value==='object'&&!Array.isArray(value);}
  function keys(value,allowed){if(!object(value)||Object.keys(value).some(function(key){return !allowed.includes(key);}))throw new TypeError('invalid_rfq_item');}
  function draft(items,catalog){
    if(!Array.isArray(items)||items.length>MAX_ITEMS)throw new TypeError('invalid_rfq_items');
    var seen=new Set();
    return items.map(function(item){
      keys(item,['lineId','productId','specifications','customization']);
      if(typeof item.lineId!=='string'||!/^line-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(item.lineId)||seen.has(item.lineId))throw new TypeError('invalid_rfq_identity');
      seen.add(item.lineId);
      var product=catalog.resolve(item.productId);
      if(!product||product.kind!=='product'||product.id!==item.productId)throw new TypeError('invalid_rfq_product');
      var fields=product.configuration;
      keys(item.specifications,fields.map(function(field){return field.id;}));
      var specifications={};
      fields.forEach(function(field){
        var value=item.specifications[field.id]??'';
        if(typeof value!=='string'||value.length>120)throw new TypeError('invalid_rfq_specifications');
        if(field.type==='select'&&value&&!field.opts.some(function(option){return option.v===value;}))throw new TypeError('invalid_rfq_specifications');
        specifications[field.id]=value;
      });
      return Object.assign({lineId:item.lineId,productId:product.id,specifications:specifications},item.customization ? {customization:root.DongDaCustomization.draft(item.customization)} : {});
    });
  }
  function items(values,catalog,language){
    if(!values.length)throw new TypeError('rfq_empty');
    return draft(values,catalog).map(function(item){
      var product=catalog.resolve(item.productId);
      if(Object.keys(root.DongDaProcurement.validateConfiguration(product,item.specifications)).length)throw new TypeError('invalid_rfq_configuration');
      return Object.assign({lineId:item.lineId,productId:product.id,product:root.DongDaProcurement.localized(product.name,language),quantity:item.specifications.qty,quantityUnit:'pcs',specifications:item.specifications},root.DongDaCustomization && root.DongDaCustomization.hasValue(item.customization) ? {customization:root.DongDaCustomization.validate(item.customization)} : {});
    });
  }
  function validateItems(values,catalog){
    if(!Array.isArray(values)||!values.length||values.length>MAX_ITEMS)throw new TypeError('invalid_rfq_items');
    values.forEach(function(item){
      keys(item,['lineId','productId','product','quantity','quantityUnit','specifications','customization']);
      if(item.customization !== undefined)root.DongDaCustomization.validate(item.customization);
      if(typeof item.product!=='string'||!item.product.trim()||item.product.length>160||item.quantityUnit!=='pcs'||typeof item.quantity!=='string'||item.quantity!==item.specifications?.qty)throw new TypeError('invalid_rfq_quantity');
    });
    items(values.map(function(item){return Object.assign({lineId:item.lineId,productId:item.productId,specifications:item.specifications},item.customization ? {customization:item.customization} : {});}),catalog,'en');
    return values.map(function(item){return Object.assign({lineId:item.lineId,productId:item.productId,product:item.product,quantity:item.quantity,quantityUnit:'pcs',specifications:Object.assign({},item.specifications)},item.customization ? {customization:root.DongDaCustomization.validate(item.customization)} : {});});
  }
  function restore(serialized,catalog){
    if(typeof serialized!=='string'||serialized.length>64000)throw new TypeError('invalid_rfq_draft');
    var value=JSON.parse(serialized);keys(value,['version','items']);
    if(value.version!==1||!Array.isArray(value.items)||value.items.some(function(item){return item&&Object.hasOwn(item,'customization');}))throw new TypeError('invalid_rfq_version');
    return draft(value.items,catalog);
  }
  function serialize(values,catalog){return JSON.stringify({version:1,items:draft(values,catalog).map(function(item){return {lineId:item.lineId,productId:item.productId,specifications:item.specifications};})});}
  root.DongDaRfqList={maxItems:MAX_ITEMS,draft:draft,items:items,validateItems:validateItems,restore:restore,serialize:serialize};
})(globalThis);
