(function (root) {
  'use strict';
  var version = '2026.10.08-insights-v1', languages = ['en','zh','ru'], topics = ['procurement','samples','customization'];
  var copy = {
    en:{title:'Insights & News',intro:'Packaging procurement notes: requirements, samples and customization.',search:'Search guides',placeholder:'Product or requirement',topic:'Topic',all:'All topics',procurement:'Procurement',samples:'Samples',customization:'Customization',sort:'Sort by',newest:'Latest update',name:'Title',clear:'Clear filters',count:'guides',empty:'No matching guides',emptyText:'Try another topic or search term.',read:'Read guide',back:'All insights',updated:'Guide updated',toc:'On this page',faq:'Questions',related:'Related product series',resources:'Requirement checklists',rfq:'Prepare an RFQ',sample:'Existing product sample',example:'Existing customer example',notice:'Buyer guidance, pending editorial and technical review. It is not a product specification or certification. Final requirements and commercial terms need separate confirmation.'},
    zh:{title:'资讯与采购指南',intro:'围绕包装采购，整理需求、样品与定制事项。',search:'搜索指南',placeholder:'产品或需求',topic:'主题',all:'全部主题',procurement:'采购需求',samples:'样品申请',customization:'定制要求',sort:'排序',newest:'最近更新',name:'标题',clear:'清除筛选',count:'篇指南',empty:'没有匹配的指南',emptyText:'请尝试其他主题或搜索词。',read:'阅读指南',back:'全部资讯',updated:'指南更新',toc:'本文目录',faq:'常见问题',related:'相关产品系列',resources:'采购需求清单',rfq:'整理询价清单',sample:'现有产品样品',example:'现有客户实例',notice:'采购参考，待编辑与技术审核，不是产品规格或认证。最终需求与商务条件须另行确认。'},
    ru:{title:'Информация и руководства',intro:'Подготовка закупки упаковки: требования, образцы и индивидуальное исполнение.',search:'Поиск руководств',placeholder:'Продукция или требование',topic:'Тема',all:'Все темы',procurement:'Закупка',samples:'Образцы',customization:'Индивидуальные требования',sort:'Сортировка',newest:'Дата обновления',name:'Название',clear:'Сбросить фильтры',count:'руководств',empty:'Руководства не найдены',emptyText:'Выберите другую тему или измените запрос.',read:'Читать руководство',back:'Все материалы',updated:'Обновлено',toc:'Содержание',faq:'Вопросы',related:'Связанные серии продукции',resources:'Списки требований',rfq:'Подготовить запрос',sample:'Существующий образец',example:'Существующий пример заказчика',notice:'Рекомендации покупателю; редакционная и техническая проверка ожидается. Это не спецификация или сертификат. Требования и коммерческие условия согласуются отдельно.'}
  };
  function language(locale) { return languages.includes(locale) ? locale : 'en'; }
  function text(key,locale) { return copy[language(locale)][key]; }
  function local(value,locale) { return value[language(locale)]; }
  function escape(value) { return root.DongDaResources.escape(value); }
  function exact(value,keys) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(function (key) { return Object.hasOwn(value,key); }); }
  function id(value) { return typeof value === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(value); }
  function trilingual(value,limit) { return exact(value,languages) && languages.every(function (key) { return typeof value[key] === 'string' && value[key].trim().length > 0 && value[key].length <= limit && !/[\x00-\x1f\x7f]/.test(value[key]); }); }
  function validate(data,catalog) {
    var errors=[];
    if (!exact(data,['schemaVersion','entries']) || data.schemaVersion !== version || !Array.isArray(data.entries)) return ['Invalid insight envelope'];
    if (data.entries.length > 50) errors.push('Insight bounds');
    var ids=new Set();
    data.entries.forEach(function (entry) {
      if (!exact(entry,['id','kind','topic','updatedAt','reviewStatus','productIds','heroProductId','title','summary','sections','faq'])) { errors.push('Invalid insight entry'); return; }
      if (!id(entry.id) || ids.has(entry.id)) errors.push('Invalid insight ID'); ids.add(entry.id);
      if (entry.kind !== 'buyer-guide' || !topics.includes(entry.topic) || entry.reviewStatus !== 'editorial-review-pending' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.updatedAt) || !Number.isFinite(Date.parse(entry.updatedAt)) || new Date(entry.updatedAt).toISOString().slice(0,10) !== entry.updatedAt) errors.push('Invalid insight publication');
      if (!trilingual(entry.title,160) || !trilingual(entry.summary,500)) errors.push('Missing insight translations');
      var products = Array.isArray(entry.productIds) ? entry.productIds : [];
      if (!products.length || products.length > 6 || new Set(products).size !== products.length || products.some(function (key) { var p=catalog.resolve(key); return !p || p.kind !== 'product' || p.id !== key; })) errors.push('Invalid insight products');
      var hero=catalog.resolve(entry.heroProductId);
      if (!hero || !products.includes(hero.id) || hero.id !== entry.heroProductId || hero.mediaRole === 'production-reference') errors.push('Invalid insight image');
      var sectionIds=new Set();
      if (!Array.isArray(entry.sections) || entry.sections.length < 2 || entry.sections.length > 12) errors.push('Invalid insight sections');
      else entry.sections.forEach(function (section) {
        if (!exact(section,['id','title','body']) || !id(section.id) || section.id === 'questions' || sectionIds.has(section.id) || !trilingual(section.title,160) || !trilingual(section.body,2000)) errors.push('Invalid insight section');
        sectionIds.add(section?.id);
      });
      if (!Array.isArray(entry.faq) || entry.faq.length < 1 || entry.faq.length > 6) errors.push('Invalid insight FAQ');
      else entry.faq.forEach(function (item) { if (!exact(item,['question','answer']) || !trilingual(item.question,200) || !trilingual(item.answer,1000)) errors.push('Invalid insight FAQ'); });
    });
    return errors;
  }
  function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function normalize(value) { return String(value).normalize('NFKC').toLocaleLowerCase().trim(); }
  function path(entry,locale) { if (entry && !id(entry.id)) throw new TypeError('Invalid insight ID'); return '/'+language(locale)+'/insights/'+(entry ? entry.id+'/' : ''); }
  function create(input,catalog) {
    var errors=validate(input,catalog); if (errors.length) throw new TypeError(errors.join('; '));
    var data=freeze(JSON.parse(JSON.stringify(input)));
    function resolve(key) { return data.entries.find(function (entry) { return entry.id === key; }) || null; }
    function selection(params) { return {q:typeof params?.q === 'string' ? params.q.slice(0,160) : '',topic:topics.includes(params?.topic) ? params.topic : 'all',sort:params?.sort === 'name' ? 'name' : 'newest'}; }
    return Object.freeze({entries:data.entries,resolve:resolve,selection:selection,search:function (params,locale) {
      var state=selection(params),terms=normalize(state.q).split(/\s+/).filter(Boolean);
      return data.entries.filter(function (entry) {
        var values=[entry.id,...Object.values(entry.title),...Object.values(entry.summary)];
        entry.productIds.forEach(function (key) { values.push(...Object.values(catalog.resolve(key).name)); });
        entry.sections.forEach(function (section) { values.push(...Object.values(section.title),...Object.values(section.body)); });
        entry.faq.forEach(function (item) { values.push(...Object.values(item.question),...Object.values(item.answer)); });
        var haystack=normalize(values.join(' '));
        return (state.topic === 'all' || state.topic === entry.topic) && terms.every(function (term) { return haystack.includes(term); });
      }).sort(function (a,b) { return state.sort === 'name' ? local(a.title,locale).localeCompare(local(b.title,locale),language(locale)) : b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id); });
    },parsePath:function (pathname) {
      var match=/^\/(en|zh|ru)\/insights(?:\/([a-z][a-z0-9-]{0,79}))?\/?$/.exec(pathname);
      if (!match) return null; var entry=match[2] ? resolve(match[2]) : null;
      return match[2] && !entry ? null : {language:match[1],entry:entry,path:path(entry,match[1])};
    }});
  }
  function icon(name) {
    var nodes=root.DONGDA_CATALOG_ICONS?.[name] || [];
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+nodes.map(function (node) { return '<'+node[0]+' '+Object.keys(node[1]).map(function (key) { return key+'="'+escape(node[1][key])+'"'; }).join(' ')+'></'+node[0]+'>'; }).join('')+'</svg>';
  }
  function picture(entry,locale,catalog) {
    var product=catalog.resolve(entry.heroProductId);
    return '<figure><img src="/'+escape(product.image)+'" alt="'+escape(local(product.name,locale))+'" width="480" height="320" loading="lazy"><figcaption>'+escape(text(product.mediaRole === 'sample' ? 'sample' : 'example',locale))+'</figcaption></figure>';
  }
  function rows(entries,locale,catalog) {
    return entries.map(function (entry) { return '<article class="insight-card">'+picture(entry,locale,catalog)+'<div class="insight-card-copy"><div class="insight-meta">'+escape(text(entry.topic,locale))+' / '+entry.updatedAt+'</div><h2><a href="'+path(entry,locale)+'" onclick="navInsight(\''+entry.id+'\');return false;">'+escape(local(entry.title,locale))+'</a></h2><p>'+escape(local(entry.summary,locale))+'</p><a class="insight-link" href="'+path(entry,locale)+'" onclick="navInsight(\''+entry.id+'\');return false;">'+escape(text('read',locale))+icon('ArrowRight')+'</a></div></article>'; }).join('');
  }
  function overview(locale,registry,catalog) {
    return '<section class="insight-heading W"><div class="ey">DONGDA</div><h1>'+escape(text('title',locale))+'</h1><p>'+escape(text('intro',locale))+'</p></section><section class="insight-library W"><div class="insight-filters"><label for="insight-search">'+escape(text('search',locale))+'<span class="insight-search-wrap">'+icon('Search')+'<input type="search" id="insight-search" maxlength="160" placeholder="'+escape(text('placeholder',locale))+'" oninput="setInsightFilter(\'q\',this.value)"></span></label><label for="insight-topic">'+escape(text('topic',locale))+'<select id="insight-topic" onchange="setInsightFilter(\'topic\',this.value)"><option value="all">'+escape(text('all',locale))+'</option>'+topics.map(function (key) { return '<option value="'+key+'">'+escape(text(key,locale))+'</option>'; }).join('')+'</select></label><label for="insight-sort">'+escape(text('sort',locale))+'<select id="insight-sort" onchange="setInsightFilter(\'sort\',this.value)"><option value="newest">'+escape(text('newest',locale))+'</option><option value="name">'+escape(text('name',locale))+'</option></select></label><button class="insight-reset" type="button" onclick="resetInsightFilters()" title="'+escape(text('clear',locale))+'" aria-label="'+escape(text('clear',locale))+'">'+icon('X')+'</button></div><p id="insight-count" role="status" aria-live="polite"></p><div class="insight-grid" id="insight-rows">'+rows(registry.entries,locale,catalog)+'</div><div id="insight-empty" hidden><h2>'+escape(text('empty',locale))+'</h2><p>'+escape(text('emptyText',locale))+'</p></div><p class="insight-notice">'+escape(text('notice',locale))+'</p></section>';
  }
  function detail(entry,locale,catalog) {
    var toc=entry.sections.map(function (section) { return '<li><a href="'+path(entry,locale)+'#'+section.id+'">'+escape(local(section.title,locale))+'</a></li>'; }).join('');
    var body=entry.sections.map(function (section) { return '<section id="'+section.id+'"><h2>'+escape(local(section.title,locale))+'</h2><p>'+escape(local(section.body,locale))+'</p></section>'; }).join('');
    var faq=entry.faq.map(function (item) { return '<details><summary>'+escape(local(item.question,locale))+'</summary><p>'+escape(local(item.answer,locale))+'</p></details>'; }).join('');
    var products=entry.productIds.map(function (key) { var product=catalog.resolve(key); return '<a href="'+root.DongDaProductPage.path(product,locale)+'" onclick="navProd(\''+product.id+'\');return false;">'+escape(local(product.name,locale))+icon('ArrowRight')+'</a>'; }).join('');
    return '<header class="insight-heading insight-article-heading W"><a class="insight-link" href="'+path(null,locale)+'" onclick="navInsights();return false;">'+icon('ArrowLeft')+escape(text('back',locale))+'</a><div class="ey">'+escape(text(entry.topic,locale))+'</div><h1>'+escape(local(entry.title,locale))+'</h1><p>'+escape(local(entry.summary,locale))+'</p><div class="insight-meta">'+escape(text('updated',locale))+' / '+entry.updatedAt+'</div></header>'
      +'<div class="insight-article W"><aside class="insight-toc"><nav aria-label="'+escape(text('toc',locale))+'"><h2>'+escape(text('toc',locale))+'</h2><ol>'+toc+'<li><a href="'+path(entry,locale)+'#questions">'+escape(text('faq',locale))+'</a></li></ol></nav>'+picture(entry,locale,catalog)+'</aside><article class="insight-body">'+body+'<section id="questions"><h2>'+escape(text('faq',locale))+'</h2>'+faq+'</section><p class="insight-notice">'+escape(text('notice',locale))+'</p></article></div>'
      +'<section class="insight-related W"><h2>'+escape(text('related',locale))+'</h2><div class="insight-products">'+products+'</div><div class="insight-next"><a class="insight-link" href="'+root.DongDaResources.path(null,locale)+'" onclick="navResources();return false;">'+escape(text('resources',locale))+icon('ArrowRight')+'</a><a class="insight-link" href="/#rfq" onclick="nav(\'rfq\');return false;">'+escape(text('rfq',locale))+icon('ClipboardList')+'</a></div></section>';
  }
  function metadata(entry,locale,origin,catalog) {
    var base=root.DongDaProductPage.origin(origin),canonical=base+path(entry,locale),title=entry ? local(entry.title,locale) : text('title',locale),description=entry ? local(entry.summary,locale) : text('intro',locale);
    return {language:language(locale),title:title+' | DongDa',description:description,robots:'noindex,follow',canonical:canonical,image:entry ? base+'/'+catalog.resolve(entry.heroProductId).image : null,locale:{en:'en_US',zh:'zh_CN',ru:'ru_RU'}[language(locale)],alternates:languages.map(function (key) { return {language:key,href:base+path(entry,key)}; }),schema:Object.assign({'@context':'https://schema.org','@type':'WebPage',name:title,description:description,url:canonical,inLanguage:language(locale)},entry ? {dateModified:entry.updatedAt} : {})};
  }
  function siteCopy(locale) { return {news_h1:text('title',locale),news_sub:text('intro',locale)}; }
  root.DongDaInsights=Object.freeze({version:version,languages:Object.freeze(languages),topics:Object.freeze(topics),language:language,text:text,escape:escape,validate:validate,create:create,path:path,rows:rows,overview:overview,detail:detail,metadata:metadata,siteCopy:siteCopy});
})(globalThis);
