(function(root){
  'use strict';
  var copy={
    en:{skip:'Skip to main content',home:'DongDa home',menu:'Navigation',openMenu:'Open navigation',language:'Choose language',close:'Close',previous:'Previous image',next:'Next image',media:'Image viewer',privacy:'Privacy Policy',legal:'Legal Notice',assistant:'Packaging assistant',openAssistant:'Open packaging assistant',backToTop:'Back to top'},
    zh:{skip:'跳到主要内容',home:'东大首页',menu:'网站导航',openMenu:'打开网站导航',language:'选择语言',close:'关闭',previous:'上一张图片',next:'下一张图片',media:'图片查看',privacy:'隐私政策',legal:'法律声明',assistant:'包装咨询助手',openAssistant:'打开包装咨询助手',backToTop:'返回顶部'},
    ru:{skip:'К основному содержимому',home:'Главная DongDa',menu:'Навигация',openMenu:'Открыть навигацию',language:'Выбрать язык',close:'Закрыть',previous:'Предыдущее изображение',next:'Следующее изображение',media:'Просмотр изображений',privacy:'Политика конфиденциальности',legal:'Правовая информация',assistant:'Помощник по упаковке',openAssistant:'Открыть помощника по упаковке',backToTop:'К началу страницы'}
  };
  Object.keys(copy).forEach(function(locale){Object.freeze(copy[locale]);});Object.freeze(copy);
  function language(value){return Object.hasOwn(copy,value)?value:'en';}
  function text(key,locale){if(!Object.hasOwn(copy.en,key))throw new TypeError('Unknown accessibility label');return copy[language(locale)][key];}
  var dialogs=Object.freeze({'nav-overlay':'open','product-sheet':'on',lbx:'on',privacyModal:'on',legalModal:'on','catalog-dialog':'on'});
  root.DongDaAccessibility=Object.freeze({version:'2026.10.08-accessibility-v1',navigationVersion:'2026.10.09-navigation-v1',languages:Object.freeze(['zh','en','ru']),dialogs:dialogs,language:language,text:text});
})(globalThis);
