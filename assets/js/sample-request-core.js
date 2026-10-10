(function (root) {
  'use strict';
  var limits = { purpose:800, expectedPurchaseQuantity:80, quantity:80, requirements:1200, recipientName:120, recipientPhone:80, country:80, city:120, address:500, postalCode:40 };
  var required = ['purpose','quantity','recipientName','recipientPhone','country','city','address'];
  function errors(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return ['sampleRequest'];
    var invalid = Object.keys(value).filter(function (key) { return !Object.hasOwn(limits,key) && key !== 'costTermsAcknowledged'; });
    Object.keys(limits).forEach(function (key) {
      if (typeof value[key] !== 'string' || value[key].length > limits[key] || (required.includes(key) && !value[key].trim())) invalid.push(key);
    });
    ['quantity','expectedPurchaseQuantity'].forEach(function (key) {
      if ((key === 'quantity' || value[key]) && (typeof value[key] !== 'string' || !/^[1-9]\d{0,9}$/.test(value[key]) || Number(value[key]) > 1000000000)) invalid.push(key);
    });
    if (value.costTermsAcknowledged !== true) invalid.push('costTermsAcknowledged');
    return Array.from(new Set(invalid));
  }
  function validate(value) {
    if (errors(value).length) throw new TypeError('Invalid sample request');
    var result = {}; Object.keys(limits).forEach(function (key) { result[key] = value[key].trim(); });
    result.costTermsAcknowledged = true; return result;
  }
  root.DongDaSampleRequest = Object.freeze({ limits:Object.freeze(limits), errors:errors, validate:validate });
})(globalThis);
