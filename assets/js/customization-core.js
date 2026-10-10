(function (root) {
  'use strict';
  var defaults = { dimensionUnit:'mm', length:'', width:'', height:'', material:'', bagColor:'', printing:'not-specified', printColors:'', loadKg:'', contents:'', notes:'', technicalAdvice:false };
  var limits = { length:24, width:24, height:24, material:120, bagColor:80, printColors:2, loadKg:24, contents:120, notes:1000 };
  var printing = ['not-specified','none','single-color','multi-color','technical-advice'];
  function draft(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(function (key) { return !Object.hasOwn(defaults,key); })) throw new TypeError('invalid_customization');
    var result = Object.assign({},defaults,value);
    Object.keys(limits).forEach(function (key) { if (typeof result[key] !== 'string' || result[key].length > limits[key]) throw new TypeError('invalid_customization'); });
    if (!['mm','cm'].includes(result.dimensionUnit) || !printing.includes(result.printing) || typeof result.technicalAdvice !== 'boolean') throw new TypeError('invalid_customization');
    return result;
  }
  function hasValue(value) { return Boolean(value && (value.technicalAdvice || value.printing !== 'not-specified' || Object.keys(limits).some(function (key) { return typeof value[key] === 'string' && value[key].trim(); }))); }
  function errors(value) {
    var invalid=[]; try { value=draft(value); } catch (error) { return ['customization']; }
    ['length','width','height','loadKg'].forEach(function (key) { var text=value[key].trim(); if (text && (!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,3})?$/.test(text) || Number(text) <= 0)) invalid.push(key); });
    if (value.printColors && (!/^[1-9]\d?$/.test(value.printColors) || Number(value.printColors) > 16 || value.printing === 'none' || (value.printing === 'single-color' && value.printColors !== '1'))) invalid.push('printColors');
    return invalid;
  }
  function validate(value) {
    var result=draft(value); if (errors(result).length || !hasValue(result)) throw new TypeError('invalid_customization');
    Object.keys(limits).forEach(function (key) { result[key]=result[key].trim(); }); return result;
  }
  root.DongDaCustomization=Object.freeze({ defaults:Object.freeze(defaults), limits:Object.freeze(limits), printing:Object.freeze(printing), draft:draft, hasValue:hasValue, errors:errors, validate:validate });
})(globalThis);
