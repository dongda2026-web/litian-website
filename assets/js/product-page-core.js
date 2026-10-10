(function (root) {
  'use strict';
  var languages = ['en', 'zh', 'ru'];
  function language(value) { return languages.includes(value) ? value : 'en'; }
  function escape(value) { return String(value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function path(product, locale) {
    if (!product || product.kind !== 'product' || !/^[a-z][a-z0-9-]{0,79}$/.test(product.id)) throw new TypeError('Invalid product route');
    return '/' + language(locale) + '/products/' + product.id + '/';
  }
  function parsePath(pathname, catalog) {
    var match = /^\/(en|zh|ru)\/products\/([a-z][a-z0-9-]{0,79})\/?$/.exec(pathname);
    if (!match) return null;
    var product = catalog.resolve(match[2]);
    return product && product.kind === 'product' ? { product: product, language: match[1], path: path(product, match[1]) } : null;
  }
  function origin(value) {
    var url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new TypeError('Invalid publication origin');
    return url.origin;
  }
  function metadata(product, locale, base) {
    locale = language(locale); base = origin(base);
    var canonical = base + path(product, locale), name = root.DongDaCatalog.localized(product.name, locale), description = root.DongDaCatalog.localized(product.summary, locale);
    var image = product.mediaRole === 'production-reference' ? null : base + '/' + product.image;
    var schema = { '@context': 'https://schema.org', '@type': 'Product', name: name, description: description, category: root.DongDaCatalogCopy.text('family_' + product.family, locale), brand: { '@type': 'Brand', name: 'DongDa' }, url: canonical };
    if (image) schema.image = image;
    return { title: name + ' | DongDa', description: description, canonical: canonical, locale: {en:'en_US',zh:'zh_CN',ru:'ru_RU'}[locale], language: locale, image: image, robots: product.mediaRole === 'production-reference' ? 'noindex,follow' : 'index,follow', alternates: languages.map(function (l) { return { language: l, href: base + path(product, l) }; }), schema: schema };
  }
  function sections(product, locale) {
    path(product, locale);
    if (!/^assets\/img\/[a-zA-Z0-9_\-/]+\.(jpg|jpeg|png|webp)$/.test(product.image) || product.image.includes('..')) throw new TypeError('Invalid product image');
    var text = function (key) { return escape(root.DongDaCatalogCopy.text(key, locale)); };
    var local = function (value) { return escape(root.DongDaCatalog.localized(value, locale)); };
    var id = escape(product.id), name = local(product.name);
    var launchIcon = root.DONGDA_CATALOG_ICONS && root.DONGDA_CATALOG_ICONS.ZoomIn;
    var launch = launchIcon ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' + launchIcon.map(function(node){return '<' + node[0] + ' ' + Object.keys(node[1]).map(function(key){return key+'="'+escape(node[1][key])+'"';}).join(' ')+'></'+node[0]+'>';}).join('') + '</svg>' : '';
    return {
      specs: '<p class="catalog-config-note">' + text('review') + '</p><table class="pd-table">' + product.specs.map(function (spec) { return '<tr><th scope="row">' + local(spec.label) + '</th><td>' + local(spec.value) + '</td></tr>'; }).join('') + '</table>',
      applications: '<div class="catalog-applications">' + product.industries.map(function (industry) { return '<a data-industry-link="' + industry + '" href="/' + language(locale) + '/industries/' + industry + '/" onclick="navIndustry(\'' + industry + '\');return false;">' + text('industry_' + industry) + '</a>'; }).join('') + '</div>',
      production: '<p class="pd-proc-text">' + text('production') + '</p>',
      aside: '<p class="catalog-config-note">' + text('terms') + '</p><a class="btn btn-primary" href="/#quote/' + id + '" onclick="startCatalogQuote(\'' + id + '\');return false;">' + text('configure') + '</a><a class="btn btn-outline" href="/#inquiry/' + id + '" onclick="prefillInquiryProduct(\'' + id + '\');return false;">' + text('request') + '</a><a class="rfq-add-link" href="/#rfq/' + id + '" onclick="addRfqProduct(\'' + id + '\');return false;">' + text('addList') + '</a>',
      media: (product.mediaRole === 'production-reference' ? '<p class="catalog-config-note">' + text('samplePending') + '</p>' : '<figure class="pd-sample"><a class="pd-image-link" data-product-inspection="' + id + '" href="/' + escape(product.image) + '" aria-label="' + escape(root.DongDaProductInspectionCore.text('view',locale)) + ': ' + name + '" title="' + escape(root.DongDaProductInspectionCore.text('view',locale)) + '"><img src="/' + escape(product.image) + '" alt="' + name + '" width="640" height="480"><span class="inspection-launch" aria-hidden="true">' + launch + '</span></a><figcaption>' + text(product.mediaRole === 'customer-example' ? 'customerExample' : 'sample') + '</figcaption></figure>') + '<a class="rfq-add-link" href="/#sample/' + id + '" onclick="startSampleRequest(\'' + id + '\');return false;">' + text('requestSample') + '</a>',
      support: '<section class="pd-support"><h2>' + text('faq') + '</h2>' + ['faqRequest','faqSpec'].map(function (key) { return '<details><summary>' + text(key) + '</summary><p>' + text(key + 'Answer') + '</p></details>'; }).join('') + '<h2>' + text('documents') + '</h2><p>' + text('documentsNote') + '</p><a class="rfq-add-link" href="/' + language(locale) + '/resources/?product=' + id + '" onclick="navResources(\'' + id + '\');return false;">' + text('buyerChecklist') + '</a></section>'
    };
  }
  function card(product, locale, arrow) {
    var href = path(product, locale), local = function (value) { return escape(root.DongDaCatalog.localized(value, locale)); }, text = function (key) { return escape(root.DongDaCatalogCopy.text(key, locale)); };
    var media = product.mediaRole === 'production-reference' ? '<div class="catalog-pending-media"><span>' + escape(product.code) + '</span><p>' + text('samplePending') + '</p></div>' : '<img loading="lazy" src="/' + escape(product.image) + '" alt="' + local(product.name) + '" width="640" height="480">';
    return '<a class="catalog-product-link" href="' + href + '" onclick="navProd(\'' + product.id + '\');return false;"><div class="pl2-img">' + media + '</div>' + (product.mediaRole === 'customer-example' ? '<p class="catalog-media-caption">' + text('customerExample') + '</p>' : '')
      + '<div class="pl2-body"><div class="pl2-code">' + escape(product.code) + '</div><h2 class="pl2-name">' + local(product.name) + '</h2><p class="pl2-desc">' + local(product.summary) + '</p><div class="catalog-applications">' + product.industries.slice(0,2).map(function (industry) { return '<span>' + text('industry_' + industry) + '</span>'; }).join('') + '</div><span class="pl2-arr">' + text('detail') + (arrow || '') + '</span></div></a>';
  }
  root.DongDaProductPage = Object.freeze({ languages: Object.freeze(languages), language: language, path: path, parsePath: parsePath, origin: origin, metadata: metadata, sections: sections, card: card, escape: escape });
})(globalThis);
