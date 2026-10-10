(function(root){
  'use strict';
  var copy={
    en:{required:'Complete this field.',email:'Enter a valid email address.',invalid:'Check this value.',choose:'Choose an option.',quantity:'Enter a whole number from 1 to 1,000,000,000.',minimum:'Enter at least {minimum}.',decimal:'Enter a positive number: up to 6 integer digits and 3 decimal places.',colors:'Use 1–16 whole colours; leave blank for no print, or use 1 for single-colour print.',acknowledge:'Confirm the sample cost and freight acknowledgement.'},
    zh:{required:'请填写此项。',email:'请输入有效的邮箱地址。',invalid:'请检查此项内容。',choose:'请选择一项。',quantity:'请输入 1 至 1,000,000,000 的整数数量。',minimum:'请输入至少 {minimum}。',decimal:'请输入正数，整数最多 6 位，小数最多 3 位。',colors:'请填 1–16 的整数色数；不印刷时留空，单色印刷填 1。',acknowledge:'请确认样品费用与运费说明。'},
    ru:{required:'Заполните это поле.',email:'Укажите корректный адрес электронной почты.',invalid:'Проверьте это значение.',choose:'Выберите вариант.',quantity:'Введите целое число от 1 до 1 000 000 000.',minimum:'Введите не менее {minimum}.',decimal:'Введите положительное число: до 6 цифр до точки и до 3 после неё.',colors:'Укажите целое число 1–16; без печати оставьте поле пустым, для одноцветной печати укажите 1.',acknowledge:'Подтвердите ознакомление с условиями стоимости образцов и перевозки.'}
  };
  Object.keys(copy).forEach(function(locale){Object.freeze(copy[locale]);});Object.freeze(copy);
  function message(code,locale,minimum){
    if(!Object.hasOwn(copy.en,code))throw new TypeError('Unknown field feedback code');
    if(code==='minimum'&&(!Number.isSafeInteger(minimum)||minimum<1||minimum>1000000000))throw new TypeError('Invalid feedback minimum');
    return (Object.hasOwn(copy,locale)?copy[locale]:copy.en)[code].replace('{minimum}',String(minimum));
  }
  function contactError(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==3||!Object.hasOwn(value,'value')||!Object.hasOwn(value,'valid')||!Object.hasOwn(value,'typeMismatch')||typeof value.value!=='string'||typeof value.valid!=='boolean'||typeof value.typeMismatch!=='boolean')throw new TypeError('Invalid native field result');
    if(!value.value.trim())return 'required';
    return value.valid?null:value.typeMismatch?'email':'invalid';
  }
  function configurationCode(error){
    if(error==='minimum')return 'minimum';
    if(error==='quantity'||error==='integer')return 'quantity';
    if(error==='required'||error==='option')return 'choose';
    return 'invalid';
  }
  function customizationCode(key){return ['length','width','height','loadKg'].includes(key)?'decimal':key==='printColors'?'colors':'invalid';}
  root.DongDaFormFeedbackCore=Object.freeze({version:'2026.10.09-form-feedback-v1',maxFields:384,copy:copy,message:message,contactError:contactError,configurationCode:configurationCode,customizationCode:customizationCode});
})(globalThis);
