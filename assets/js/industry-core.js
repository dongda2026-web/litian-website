(function (root) {
  'use strict';
  var languages = ['en', 'zh', 'ru'];
  var labels = {
    en: {title:'Industry Packaging',intro:'Packaging requirements follow the material, filling method, handling conditions and destination.',requirements:'Define your requirements',products:'Product starting points',sample:'Bag sample; application suitability requires confirmation.',guide:'Application guide',view:'View application',back:'All applications',detail:'Explore product',configure:'Configure requirements',rfq:'Inquiry list',questions:'Procurement questions',q1:'Does an application page confirm product suitability?',a1:'No. Material, site, transport and destination requirements must be reviewed for your project. Certification, food-contact, dangerous-goods and electrostatic-safety claims need separate applicable evidence.',q2:'Which information supports a technical assessment?',a2:'Bag structure, fill weight, quantity, material properties, handling conditions and destination form the basis for technical and commercial review. An inquiry is not a quotation or an order.',next:'Project scope',step1:'Material information',step1p:'Material identity, physical form and storage conditions.',step2:'Packaging requirements',step2p:'Bag structure, fill weight, closure and printing requirements.',step3:'Delivery scope',step3p:'Quantity, destination, requested timing and applicable documentation.'},
    zh: {title:'行业包装方案',intro:'包装需求由物料、灌装、搬运条件与目的地决定。',requirements:'明确采购条件',products:'选型参考产品',sample:'袋型样品；行业适配性需单独确认。',guide:'应用选型',view:'查看应用方案',back:'全部行业方案',detail:'查看产品',configure:'配置采购要求',rfq:'询价清单',questions:'采购常见问题',q1:'行业页面是否代表产品适用性已确认？',a1:'不代表。物料、作业、运输和目的地要求需针对项目审核。认证、食品接触、危险品及静电安全要求需要独立且适用的证据。',q2:'哪些资料有助于技术评估？',a2:'袋型结构、单袋重量、需求数量、物料特性、搬运条件及目的地是技术与商务评估的基础。询价不代表已形成报价或订单。',next:'项目需求范围',step1:'物料资料',step1p:'物料名称、形态与储存环境。',step2:'包装要求',step2p:'袋型、单袋重量、封口与印刷要求。',step3:'交付范围',step3p:'数量、目的地、期望时间与适用资料。'},
    ru: {title:'Упаковка по отраслям',intro:'Требования к упаковке зависят от материала, фасовки, условий перемещения и места доставки.',requirements:'Определите требования',products:'Отправные точки выбора',sample:'Образец мешка; пригодность для применения согласуется отдельно.',guide:'Выбор по применению',view:'Смотреть применение',back:'Все применения',detail:'Посмотреть продукт',configure:'Указать требования',rfq:'Список запроса',questions:'Вопросы по закупке',q1:'Подтверждает ли страница пригодность продукта?',a1:'Нет. Требования к материалу, площадке, перевозке и месту назначения оцениваются для проекта. Сертификация, контакт с пищей, опасные грузы и электростатическая безопасность требуют отдельного применимого подтверждения.',q2:'Какие сведения нужны для технической оценки?',a2:'Конструкция, масса наполнения, количество, свойства материала, условия перемещения и место доставки служат основой технической и коммерческой оценки. Запрос не является ценовым предложением или заказом.',next:'Требования проекта',step1:'Сведения о материале',step1p:'Наименование, физическая форма и условия хранения.',step2:'Требования к упаковке',step2p:'Конструкция, масса наполнения, закрытие и печать.',step3:'Условия доставки',step3p:'Количество, место доставки, желаемый срок и необходимые документы.'}
  };
  function language(value) { return languages.includes(value) ? value : 'en'; }
  function text(key, locale) { return labels[language(locale)][key] || ''; }
  function local(value, locale) { return root.DongDaCatalog.localized(value, language(locale)); }
  function plainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function keys(value, allowed) { return plainObject(value) && Object.keys(value).every(function (key) { return allowed.includes(key); }); }
  function translated(value, limit) { return keys(value, languages) && languages.every(function (l) { return typeof value[l] === 'string' && value[l].trim() && value[l].length <= limit; }); }
  function validate(entries, catalog) {
    var errors = [], identifiers = new Set();
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 30) return ['industries: expected 1-30 entries'];
    entries.forEach(function (entry, index) {
      var label = 'industries[' + index + ']';
      if (!keys(entry, ['id','publication','name','summary','heroProductId','productIds','requirements'])) { errors.push(label + ': unexpected fields'); return; }
      if (!root.DongDaCatalog.industries.includes(entry.id) || identifiers.has(entry.id)) errors.push(label + ': invalid/duplicate application ID');
      identifiers.add(entry.id);
      if (entry.publication !== 'review-pending') errors.push(label + ': editorial approval is not configured');
      if (!translated(entry.name, 120) || !translated(entry.summary, 600)) errors.push(label + ': missing or excessive translation');
      var ids = entry.productIds;
      if (!Array.isArray(ids) || !ids.length || ids.length > 6 || new Set(ids).size !== ids.length || ids.some(function (id) {
        var product = catalog.resolve(id);
        return !product || product.id !== id || product.kind !== 'product' || !product.industries.includes(entry.id);
      })) errors.push(label + ': invalid product mapping');
      var hero = catalog.resolve(entry.heroProductId);
      if (!hero || hero.id !== entry.heroProductId || hero.mediaRole !== 'sample' || !Array.isArray(ids) || !ids.includes(hero.id)) errors.push(label + ': hero requires an associated bag sample');
      if (!Array.isArray(entry.requirements) || entry.requirements.length < 2 || entry.requirements.length > 6 || entry.requirements.some(function (item) { return !keys(item, ['title','body']) || !translated(item.title, 120) || !translated(item.body, 600); })) errors.push(label + ': invalid requirements');
    });
    if (root.DongDaCatalog.industries.some(function (id) { return !identifiers.has(id); })) errors.push('industries: every catalog application requires an entity page');
    return errors;
  }
  function path(entry, locale) {
    if (entry && !root.DongDaCatalog.industries.includes(entry.id)) throw new TypeError('Invalid industry route');
    return '/' + language(locale) + '/industries/' + (entry ? entry.id + '/' : '');
  }
  function create(entries, catalog) {
    var errors = validate(entries, catalog);
    if (errors.length) throw new TypeError(errors.join('; '));
    function freeze(value) { if (value && typeof value === 'object') { Object.keys(value).forEach(function (key) { freeze(value[key]); }); Object.freeze(value); } return value; }
    entries = freeze(JSON.parse(JSON.stringify(entries)));
    function resolve(id) { return entries.find(function (entry) { return entry.id === id; }); }
    function parsePath(pathname) {
      var match = /^\/(en|zh|ru)\/industries(?:\/([a-z]+))?\/?$/.exec(pathname);
      if (!match) return null;
      var entry = match[2] ? resolve(match[2]) : null;
      return match[2] && !entry ? null : {entry:entry,language:match[1],path:path(entry,match[1])};
    }
    return Object.freeze({entries:entries,resolve:resolve,parsePath:parsePath});
  }
  function metadata(entry, locale, base, catalog) {
    locale = language(locale); base = root.DongDaProductPage.origin(base);
    var canonical = base + path(entry, locale), title = entry ? local(entry.name, locale) : text('title', locale), description = entry ? local(entry.summary, locale) : text('intro', locale);
    var image = entry ? base + '/' + catalog.resolve(entry.heroProductId).image : null;
    var schema = {'@context':'https://schema.org','@type':entry?'WebPage':'CollectionPage',name:title,description:description,url:canonical,inLanguage:locale};
    if (image) schema.primaryImageOfPage = {'@type':'ImageObject',url:image};
    return {title:title + ' | DongDa',description:description,canonical:canonical,language:locale,locale:{en:'en_US',zh:'zh_CN',ru:'ru_RU'}[locale],image:image,robots:'noindex,follow',alternates:languages.map(function (l) { return {language:l,href:base+path(entry,l)}; }),schema:schema};
  }
  var escape = function (value) { return root.DongDaProductPage.escape(value); };
  function icon(name) {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ((root.DONGDA_CATALOG_ICONS || {})[name] || []).map(function (node) {
      return '<' + node[0] + ' ' + Object.keys(node[1]).map(function (key) { return key + '="' + escape(node[1][key]) + '"'; }).join(' ') + '></' + node[0] + '>';
    }).join('') + '</svg>';
  }
  function cards(entries, locale, catalog) {
    return entries.map(function (entry) {
      var hero = catalog.resolve(entry.heroProductId);
      return '<a class="industry-entry" data-industry-link="' + entry.id + '" href="' + path(entry, locale) + '" onclick="navIndustry(\'' + entry.id + '\');return false;"><img src="/' + escape(hero.image) + '" alt="' + escape(local(hero.name, locale)) + '" width="320" height="240" loading="lazy"><div><h3>' + escape(local(entry.name, locale)) + '</h3><span>' + escape(text('view', locale)) + ' <span aria-hidden="true">&rarr;</span></span></div></a>';
    }).join('');
  }
  function body(entry, locale, catalog, entries) {
    var e = escape, t = function (key) { return e(text(key, locale)); }, l = function (value) { return e(local(value, locale)); };
    if (!entry) return '<header class="industry-list-heading W"><h1>' + t('title') + '</h1><p>' + t('intro') + '</p></header><section class="W industry-list-grid">' + cards(entries, locale, catalog) + '</section>';
    var hero = catalog.resolve(entry.heroProductId);
    return '<header class="industry-hero"><img src="/' + e(hero.image) + '" alt="' + l(hero.name) + '" width="1200" height="900"><div class="W"><a class="industry-back" href="' + path(null,locale) + '" onclick="navIndustries();return false;">&larr; ' + t('back') + '</a><h1>' + l(entry.name) + '</h1><p>' + l(entry.summary) + '</p><a class="catalog-command" href="' + root.DongDaProductPage.path(hero,locale) + '" onclick="startCatalogQuote(\'' + hero.id + '\');return false;">' + t('configure') + '</a><span class="industry-media-note">' + t('sample') + '</span></div></header>'
      + '<section class="W industry-requirements"><h2>' + t('requirements') + '</h2><dl>' + entry.requirements.map(function (item,index) { return '<div><dt><span aria-hidden="true">0' + (index+1) + '</span>' + l(item.title) + '</dt><dd>' + l(item.body) + '</dd></div>'; }).join('') + '</dl></section>'
      + '<section class="industry-products-band"><div class="W"><h2>' + t('products') + '</h2><div class="industry-product-grid">' + entry.productIds.map(function (id) { return '<article class="pl2 catalog-product">' + root.DongDaProductPage.card(catalog.resolve(id),locale,icon('ArrowRight')) + '<button type="button" class="catalog-command catalog-list-add" onclick="addRfqProduct(\'' + id + '\')">' + icon('ListPlus') + e(root.DongDaCatalogCopy.text('addList',locale)) + '</button></article>'; }).join('') + '</div></div></section>'
      + '<section class="W industry-next"><h2>' + t('next') + '</h2><ol>' + [1,2,3].map(function (step) { return '<li><h3>' + t('step'+step) + '</h3><p>' + t('step'+step+'p') + '</p></li>'; }).join('') + '</ol><a class="catalog-command" href="/#rfq" onclick="nav(\'rfq\');return false;">' + t('rfq') + '</a></section>'
      + '<section class="W industry-faq"><h2>' + t('questions') + '</h2>' + [1,2].map(function (q) { return '<details><summary>' + t('q'+q) + '</summary><p>' + t('a'+q) + '</p></details>'; }).join('') + '</section>';
  }
  root.DongDaIndustry = Object.freeze({version:'2026.10.08-industry-v1',languages:Object.freeze(languages),language:language,text:text,local:local,validate:validate,create:create,path:path,metadata:metadata,cards:cards,body:body});
})(globalThis);
