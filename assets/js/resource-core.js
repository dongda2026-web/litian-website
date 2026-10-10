(function (root) {
  'use strict';
  var version = '2026.10.08-resources-v1', languages = ['en','zh','ru'];
  var copy = {
    en: {title:'Resource Centre',intro:'Prepare your packaging requirements before discussing a specification or quotation.',type:'Buyer requirement checklist',notice:'These checklists collect buyer requirements. They are not product specifications, test reports or certificates. Final construction, suitability and supply terms require separate confirmation.',search:'Search resources',placeholder:'Product, material or requirement',product:'Product series',all:'All series',sort:'Sort by',newest:'Latest update',name:'Title',clear:'Clear filters',count:'resources',empty:'No matching resources',emptyText:'Try another product series or search term.',read:'Read checklist',download:'Download TXT',back:'All resources',updated:'Updated',productLink:'View product',quote:'Discuss requirements',fields:'Requirements to prepare',version:'Version',language:'Language',blank:'Your requirement: ____________________',review:'Requirement guidance / pending technical review',sample:'Existing product sample',example:'Existing customer example',footer:'Keep confidential contacts and artwork out of this blank checklist.'},
    zh: {title:'资料中心',intro:'采购沟通前，整理包装需求，再确认技术规格与报价。',type:'采购需求清单',notice:'清单用于整理采购需求，不是产品规格书、测试报告或认证文件。最终结构、适用性与供货条件须另行确认。',search:'搜索资料',placeholder:'产品、材料或需求',product:'产品系列',all:'全部系列',sort:'排序',newest:'最近更新',name:'标题',clear:'清除筛选',count:'份资料',empty:'没有匹配的资料',emptyText:'请尝试其他产品系列或搜索词。',read:'查看清单',download:'下载 TXT',back:'全部资料',updated:'更新日期',productLink:'查看产品',quote:'沟通需求',fields:'需准备的需求',version:'版本',language:'语言',blank:'您的需求：____________________',review:'需求参考 / 待技术审核',sample:'现有产品样品',example:'现有客户实例',footer:'请勿在这份空白清单中填写保密联系方式或图稿内容。'},
    ru: {title:'Центр материалов',intro:'Подготовьте требования к упаковке до согласования характеристик и цены.',type:'Список требований покупателя',notice:'Списки предназначены для сбора требований, а не являются спецификациями, протоколами испытаний или сертификатами. Конструкция, пригодность и условия поставки согласуются отдельно.',search:'Поиск материалов',placeholder:'Продукция, материал или требование',product:'Серия продукции',all:'Все серии',sort:'Сортировка',newest:'Дата обновления',name:'Название',clear:'Сбросить фильтры',count:'материалов',empty:'Материалы не найдены',emptyText:'Выберите другую серию или измените запрос.',read:'Открыть список',download:'Скачать TXT',back:'Все материалы',updated:'Обновлено',productLink:'Открыть продукцию',quote:'Обсудить требования',fields:'Что подготовить',version:'Версия',language:'Язык',blank:'Ваше требование: ____________________',review:'Рекомендации / техническая проверка ожидается',sample:'Существующий образец',example:'Существующий пример заказчика',footer:'Не включайте конфиденциальные контакты или макеты в этот незаполненный список.'}
  };
  function language(locale) { return languages.includes(locale) ? locale : 'en'; }
  function text(key, locale) { return copy[language(locale)][key]; }
  function localized(value, locale) { return value[language(locale)]; }
  function escape(value) { return String(value).replace(/[&<>"']/g,function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function exact(value, keys) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(function (key) { return Object.hasOwn(value,key); }); }
  function trilingual(value) { return exact(value,languages) && languages.every(function (locale) { return typeof value[locale] === 'string' && value[locale].trim().length > 0 && value[locale].length <= 800 && !/[\x00-\x1f\x7f]/.test(value[locale]); }); }
  function id(value) { return typeof value === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(value); }
  function validate(data, catalog) {
    var errors = [];
    if (!exact(data,['schemaVersion','fields','entries']) || data.schemaVersion !== version || !Array.isArray(data.fields) || !Array.isArray(data.entries)) return ['Invalid resource envelope'];
    if (!data.fields.length || data.fields.length > 20 || !data.entries.length || data.entries.length > 50) errors.push('Resource bounds');
    var fieldIds = new Set(), entryIds = new Set();
    data.fields.forEach(function (field) {
      if (!exact(field,['id','label','hint']) || !id(field.id) || fieldIds.has(field.id) || !trilingual(field.label) || !trilingual(field.hint)) errors.push('Invalid resource field');
      fieldIds.add(field?.id);
    });
    data.entries.forEach(function (entry) {
      if (!exact(entry,['id','productId','kind','version','updatedAt','title','summary','fieldIds'])) { errors.push('Invalid resource entry'); return; }
      var product = catalog.resolve(entry.productId);
      if (!id(entry.id) || entryIds.has(entry.id) || !product || product.id !== entry.productId || product.kind !== 'product' || product.mediaRole === 'production-reference') errors.push('Invalid resource binding');
      entryIds.add(entry.id);
      if (entry.kind !== 'request-checklist' || entry.version !== '1.0' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.updatedAt) || !Number.isFinite(Date.parse(entry.updatedAt)) || new Date(entry.updatedAt).toISOString().slice(0,10) !== entry.updatedAt) errors.push('Invalid resource publication');
      if (!trilingual(entry.title) || !trilingual(entry.summary)) errors.push('Missing resource translations');
      if (!Array.isArray(entry.fieldIds) || entry.fieldIds.length < 1 || entry.fieldIds.length > 20 || new Set(entry.fieldIds).size !== entry.fieldIds.length || entry.fieldIds.some(function (key) { return !fieldIds.has(key); })) errors.push('Invalid resource fields');
    });
    return errors;
  }
  function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function normalize(value) { return String(value).normalize('NFKC').toLocaleLowerCase().trim(); }
  function path(entry, locale) {
    if (entry && !id(entry.id)) throw new TypeError('Invalid resource ID');
    return '/' + language(locale) + '/resources/' + (entry ? entry.id + '/' : '');
  }
  function filePath(entry, locale, delivery) { if (!id(entry?.id) || entry.version !== '1.0') throw new TypeError('Invalid resource file'); if(delivery){var file=delivery.resolve(entry.id,language(locale));if(!file)throw new TypeError('Missing resource file');return file.path;} return '/assets/documents/' + entry.id + '-' + language(locale) + '-v1.txt'; }
  function create(input, catalog) {
    var errors = validate(input,catalog); if (errors.length) throw new TypeError(errors.join('; '));
    var data = freeze(JSON.parse(JSON.stringify(input)));
    var resolve = function (key) { return data.entries.find(function (entry) { return entry.id === key; }) || null; };
    function selection(params) {
      var product = catalog.resolve(params?.product), query = typeof params?.q === 'string' ? params.q.slice(0,160) : '';
      return {q:query,product:product?.kind === 'product' ? product.id : 'all',sort:params?.sort === 'name' ? 'name' : 'newest'};
    }
    return Object.freeze({entries:data.entries,fields:data.fields,resolve:resolve,selection:selection,search:function (params,locale) {
      var state = selection(params), terms = normalize(state.q).split(/\s+/).filter(Boolean);
      return data.entries.filter(function (entry) {
        var product = catalog.resolve(entry.productId), values = [entry.id,entry.productId,...Object.values(entry.title),...Object.values(entry.summary),...Object.values(product.name)];
        entry.fieldIds.forEach(function (key) { var field = data.fields.find(function (item) { return item.id === key; }); values.push(...Object.values(field.label),...Object.values(field.hint)); });
        var haystack = normalize(values.join(' '));
        return (state.product === 'all' || entry.productId === state.product) && terms.every(function (term) { return haystack.includes(term); });
      }).sort(function (a,b) { return state.sort === 'name' ? localized(a.title,locale).localeCompare(localized(b.title,locale),language(locale)) : b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id); });
    },parsePath:function (pathname) {
      var match = /^\/(en|zh|ru)\/resources(?:\/([a-z][a-z0-9-]{0,79}))?\/?$/.exec(pathname);
      if (!match) return null; var entry = match[2] ? resolve(match[2]) : null;
      return match[2] && !entry ? null : {language:match[1],entry:entry,path:path(entry,match[1])};
    }});
  }
  function icon(name) {
    var nodes = root.DONGDA_CATALOG_ICONS?.[name] || [];
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + nodes.map(function (node) { return '<' + node[0] + ' ' + Object.keys(node[1]).map(function (key) { return key + '="' + escape(node[1][key]) + '"'; }).join(' ') + '></' + node[0] + '>'; }).join('') + '</svg>';
  }
  function download(entry, locale, delivery) { return '<div class="resource-download"><a class="resource-action" href="' + filePath(entry,locale,delivery) + '" download data-resource-download="'+escape(entry.id)+'" data-resource-language="'+language(locale)+'" title="' + escape(text('download',locale)) + '">' + icon('Download') + '<span>' + escape(text('download',locale)) + '</span></a><span class="resource-download-status" role="status" aria-live="polite"></span></div>'; }
  function rows(entries,locale,catalog,delivery) {
    return entries.map(function (entry) {
      var product = catalog.resolve(entry.productId);
      return '<article class="resource-row"><figure><img src="/' + escape(product.image) + '" alt="' + escape(localized(product.name,locale)) + '" width="144" height="120" loading="lazy"><figcaption>' + escape(text(product.mediaRole === 'sample' ? 'sample' : 'example',locale)) + '</figcaption></figure><div class="resource-row-copy"><div class="resource-meta">' + escape(localized(product.name,locale)) + '</div><h2><a href="' + path(entry,locale) + '" onclick="navResource(\'' + entry.id + '\');return false;">' + escape(localized(entry.title,locale)) + '</a></h2><p>' + escape(localized(entry.summary,locale)) + '</p><small>' + escape(text('type',locale)) + ' · v' + entry.version + ' · ' + entry.updatedAt + ' · EN / 中文 / RU</small></div><div class="resource-actions"><a class="resource-action" href="' + path(entry,locale) + '" onclick="navResource(\'' + entry.id + '\');return false;">' + icon('FileText') + '<span>' + escape(text('read',locale)) + '</span></a>' + download(entry,locale,delivery) + '</div></article>';
    }).join('');
  }
  function overview(locale,registry,catalog,delivery) {
    var products = catalog.search({}).map(function (product) { return product.id; });
    return '<section class="resource-heading W"><div class="ey">DONGDA / ' + escape(text('type',locale)) + '</div><h1>' + escape(text('title',locale)) + '</h1><p>' + escape(text('intro',locale)) + '</p></section><section class="resource-library W"><div class="resource-filters"><label for="resource-search">' + escape(text('search',locale)) + '<span class="resource-search-wrap">' + icon('Search') + '<input type="search" id="resource-search" maxlength="160" placeholder="' + escape(text('placeholder',locale)) + '" oninput="setResourceFilter(\'q\',this.value)"></span></label><label for="resource-product">' + escape(text('product',locale)) + '<select id="resource-product" onchange="setResourceFilter(\'product\',this.value)"><option value="all">' + escape(text('all',locale)) + '</option>' + products.map(function (key) { return '<option value="' + key + '">' + escape(localized(catalog.resolve(key).name,locale)) + '</option>'; }).join('') + '</select></label><label for="resource-sort">' + escape(text('sort',locale)) + '<select id="resource-sort" onchange="setResourceFilter(\'sort\',this.value)"><option value="newest">' + escape(text('newest',locale)) + '</option><option value="name">' + escape(text('name',locale)) + '</option></select></label><button type="button" class="resource-reset" onclick="resetResourceFilters()" title="' + escape(text('clear',locale)) + '" aria-label="' + escape(text('clear',locale)) + '">' + icon('X') + '</button></div><p id="resource-count" role="status" aria-live="polite"></p><div id="resource-rows">' + rows(registry.entries,locale,catalog,delivery) + '</div><div id="resource-empty" hidden><h2>' + escape(text('empty',locale)) + '</h2><p>' + escape(text('emptyText',locale)) + '</p></div><p class="resource-notice">' + escape(text('notice',locale)) + '</p></section>';
  }
  function detail(entry,locale,registry,catalog,delivery) {
    var product = catalog.resolve(entry.productId);
    return '<section class="resource-heading W"><a class="resource-back" href="' + path(null,locale) + '" onclick="navResources();return false;">' + icon('ArrowLeft') + escape(text('back',locale)) + '</a><div class="ey">' + escape(localized(product.name,locale)) + '</div><h1>' + escape(localized(entry.title,locale)) + '</h1><p>' + escape(localized(entry.summary,locale)) + '</p><div class="resource-meta">' + escape(text('version',locale)) + ' ' + entry.version + ' / ' + escape(text('updated',locale)) + ' ' + entry.updatedAt + '</div></section><section class="resource-detail W"><div class="resource-checklist"><h2>' + escape(text('fields',locale)) + '</h2><ol>' + entry.fieldIds.map(function (key) { var field = registry.fields.find(function (item) { return item.id === key; }); return '<li><h3>' + escape(localized(field.label,locale)) + '</h3><p>' + escape(localized(field.hint,locale)) + '</p></li>'; }).join('') + '</ol></div><aside><figure><img src="/' + escape(product.image) + '" width="320" height="240" alt="' + escape(localized(product.name,locale)) + '"><figcaption>' + escape(text(product.mediaRole === 'sample' ? 'sample' : 'example',locale)) + '</figcaption></figure><div class="resource-actions">' + download(entry,locale,delivery) + '<a class="resource-action" href="' + root.DongDaProductPage.path(product,locale) + '" onclick="navProd(\'' + product.id + '\');return false;">' + escape(text('productLink',locale)) + icon('ArrowRight') + '</a><a class="resource-action resource-primary" href="/#quote/' + product.id + '" onclick="startCatalogQuote(\'' + product.id + '\');return false;">' + escape(text('quote',locale)) + icon('ArrowRight') + '</a></div></aside><p class="resource-notice">' + escape(text('notice',locale)) + '</p></section>';
  }
  function downloadText(entry,locale,registry) {
    return ['DongDa / ' + text('type',locale),localized(entry.title,locale),text('version',locale) + ': ' + entry.version,text('updated',locale) + ': ' + entry.updatedAt,text('language',locale) + ': ' + language(locale),'',text('notice',locale),'',...entry.fieldIds.flatMap(function (key,index) { var field = registry.fields.find(function (item) { return item.id === key; }); return [(index+1)+'. '+localized(field.label,locale),localized(field.hint,locale),text('blank',locale),'']; }),text('footer',locale),''].join('\n');
  }
  function metadata(entry,locale,origin,catalog) {
    var base = root.DongDaProductPage.origin(origin), canonical = base + path(entry,locale);
    return {language:language(locale),title:(entry ? localized(entry.title,locale) : text('title',locale)) + ' | DongDa',description:entry ? localized(entry.summary,locale) : text('intro',locale),robots:'noindex,follow',canonical:canonical,image:entry ? base + '/' + catalog.resolve(entry.productId).image : null,locale:{en:'en_US',zh:'zh_CN',ru:'ru_RU'}[language(locale)],alternates:languages.map(function (key) { return {language:key,href:base+path(entry,key)}; }),schema:{'@context':'https://schema.org','@type':'WebPage',name:entry ? localized(entry.title,locale) : text('title',locale),description:entry ? localized(entry.summary,locale) : text('intro',locale),url:canonical,inLanguage:language(locale)}};
  }
  function siteCopy(locale) {
    var values = {
      en:{n_dl:'Resources',history_full:'Detailed milestones',tl_h:'Company milestones',sus_lnk:'Request sustainability documents',im_p1:'Identify your product series, filling process and handling needs. We review the bag construction with you before specifications are confirmed.',im_p2:'Share your requirements in English, Chinese or Russian, including the destination and desired delivery window.',im_c2p:'Begin with a product series and discuss the construction needed for your application.',im_c4p:'Prepare dimensions, quantity and printing requirements for the sales discussion.',rfq_lead:'Prepare the product, quantity and construction you need. Final specifications and commercial terms are confirmed after review.',rfq_sum_p:'Share your packaging requirements to start a sales discussion.'},
      zh:{n_dl:'资料中心',history_full:'查看完整历程',tl_h:'企业发展历程',sus_lnk:'索取可持续发展资料',im_p1:'先明确产品系列、灌装过程与搬运需求，再共同确认袋型结构和技术规格。',im_p2:'可用中文、英文或俄文说明需求，并提供目的地和期望交付时间。',im_c2p:'从产品系列出发，沟通适合具体用途的袋型结构。',im_c4p:'整理尺寸、数量与印刷要求，便于销售沟通。',rfq_lead:'整理所需产品、数量与结构。最终规格和商务条件经审核后确认。',rfq_sum_p:'提交包装需求，开始采购沟通。'},
      ru:{n_dl:'Материалы',history_full:'Подробная история',tl_h:'Этапы развития компании',sus_lnk:'Запросить материалы об устойчивом развитии',im_p1:'Определите серию продукции, способ наполнения и требования к перемещению. Конструкция мешка согласуется до подтверждения характеристик.',im_p2:'Опишите требования на русском, английском или китайском языке, указав место назначения и желаемые сроки.',im_c2p:'Начните с серии продукции и обсудите конструкцию для вашего применения.',im_c4p:'Подготовьте размеры, количество и требования к печати для обсуждения.',rfq_lead:'Укажите продукцию, количество и конструкцию. Характеристики и коммерческие условия подтверждаются после согласования.',rfq_sum_p:'Опишите требования к упаковке для начала обсуждения.'}
    };
    return values[language(locale)];
  }
  root.DongDaResources = Object.freeze({version:version,languages:Object.freeze(languages),language:language,text:text,escape:escape,validate:validate,create:create,path:path,filePath:filePath,rows:rows,overview:overview,detail:detail,downloadText:downloadText,metadata:metadata,siteCopy:siteCopy});
})(globalThis);
