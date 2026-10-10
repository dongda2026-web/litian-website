(function (root) {
  'use strict';
  var version = '2026.10.08-catalog-v1';
  var families = ['bulk', 'valve', 'woven', 'specialty', 'custom', 'technical'];
  var industries = ['cement', 'chemicals', 'agriculture', 'industrial'];
  var industryTerms = {
    cement: ['水泥', '建材', 'cement', 'construction', 'цемент', 'стройматериалы'],
    chemicals: ['化工', 'chemical', 'химические'],
    agriculture: ['农业', '粮食', '饲料', 'agriculture', 'grain', 'feed', 'зерно', 'корма', 'сельское хозяйство'],
    industrial: ['工业', '物流', 'industry', 'logistics', 'промышленность', 'логистика']
  };
  var keyPattern = /^[a-z][a-z0-9-]{0,79}$/;

  function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function text(value, limit) { return typeof value === 'string' && value.trim().length > 0 && value.length <= limit; }
  function keys(value, allowed) { return object(value) && Object.keys(value).every(function (key) { return allowed.includes(key); }); }
  function localized(value, language) { return value && (value[language] || value.en) || ''; }
  function translations(value, limit) {
    return keys(value, ['zh', 'en', 'ru']) && ['zh', 'en', 'ru'].every(function (language) { return text(value[language], limit); });
  }
  function unique(values) { return new Set(values).size === values.length; }
  function validate(products) {
    var errors = [], identifiers = new Set();
    if (!Array.isArray(products) || products.length < 1 || products.length > 100) return ['catalog: expected 1-100 entries'];
    products.forEach(function (product, index) {
      var label = 'catalog[' + index + ']';
      if (!keys(product, ['id','aliases','code','kind','family','homepage','reviewStatus','name','summary','image','industries','specs','configuration','mediaRole'])) {
        errors.push(label + ': unexpected fields'); return;
      }
      if (!keyPattern.test(product.id || '') || !text(product.code, 12)) errors.push(label + ': invalid identifier/code');
      if (!Array.isArray(product.aliases) || product.aliases.some(function (alias) { return !keyPattern.test(alias); })) errors.push(label + ': invalid aliases');
      [product.id].concat(Array.isArray(product.aliases) ? product.aliases : []).forEach(function (id) {
        if (identifiers.has(id)) errors.push(label + ': duplicate identifier ' + id);
        identifiers.add(id);
      });
      if (!['product','technical'].includes(product.kind) || !families.includes(product.family) || (product.kind === 'technical') !== (product.family === 'technical')) errors.push(label + ': invalid kind/family');
      if (typeof product.homepage !== 'boolean' || product.reviewStatus !== 'technical-approval-pending') errors.push(label + ': invalid publication review status');
      if (!translations(product.name, 120) || !translations(product.summary, 600)) errors.push(label + ': missing or excessive translation');
      if (!/^assets\/img\/[a-zA-Z0-9_/-]+\.(?:jpg|jpeg|png|webp)$/.test(product.image || '') || product.image.includes('..')) errors.push(label + ': unsafe image');
      if (!['sample','customer-example','production-reference'].includes(product.mediaRole)) errors.push(label + ': invalid media role');
      if (!Array.isArray(product.industries) || !product.industries.length || !unique(product.industries) || product.industries.some(function (id) { return !industries.includes(id); })) errors.push(label + ': invalid applications');
      if (!Array.isArray(product.specs) || product.specs.length !== 3 || !['structure','filling','confirm'].every(function (id, i) {
        var spec = product.specs[i];
        return keys(spec, ['id','label','value']) && spec.id === id && translations(spec.label, 120) && translations(spec.value, 400);
      })) errors.push(label + ': invalid technical dimensions');
      if (!Array.isArray(product.configuration) || product.configuration.length > 12) { errors.push(label + ': invalid configuration'); return; }
      var ids = product.configuration.map(function (field) { return field && field.id; });
      if (!unique(ids)) errors.push(label + ': duplicate configuration field');
      if (product.kind === 'technical' ? ids.length !== 0 : ids.filter(function (id) { return id === 'qty'; }).length !== 1) errors.push(label + ': quantity/technical mismatch');
      product.configuration.forEach(function (field) {
        if (!keys(field, ['id','type','label','opts','unit','min']) || !keyPattern.test(field.id || '') || !translations(field.label, 120)) { errors.push(label + ': invalid configuration field'); return; }
        if (field.type === 'qty') {
          if (field.id !== 'qty' || field.unit !== 'pcs' || field.min !== 1 || field.opts !== undefined) errors.push(label + ': invalid request quantity');
        } else if (field.type === 'select') {
          if (field.id === 'qty' || field.unit !== undefined || field.min !== undefined || !Array.isArray(field.opts) || field.opts.length < 2 || field.opts.length > 20 || !unique(field.opts.map(function (opt) { return opt && opt.v; })) || field.opts.some(function (opt) {
            return !keys(opt, ['v','l']) || !/^[a-z0-9-]{1,40}$/.test(opt.v || '') || !translations(opt.l, 160);
          }) || !field.opts.some(function (opt) { return opt && opt.v === 'review'; })) errors.push(label + ': invalid request options');
        } else errors.push(label + ': unknown configuration type');
      });
    });
    return errors;
  }
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.keys(value).forEach(function (key) { freeze(value[key]); }); Object.freeze(value);
    }
    return value;
  }
  function normalize(value) { return String(value || '').normalize('NFKC').toLocaleLowerCase().trim(); }
  function create(products) {
    var errors = validate(products);
    if (errors.length) throw new TypeError(errors.join('; '));
    products = freeze(JSON.parse(JSON.stringify(products)));
    function resolve(id) { return products.find(function (product) { return product.id === id || product.aliases.includes(id); }); }
    function search(state) {
      state = state || {};
      var tokens = normalize(state.query).slice(0,160).split(/\s+/).filter(Boolean);
      return products.filter(function (product) {
        if (product.kind !== 'product') return false;
        if (state.family && state.family !== 'all' && state.family !== product.family) return false;
        if (state.industry && state.industry !== 'all' && !product.industries.includes(state.industry)) return false;
        var haystack = normalize([product.id, product.code].concat(product.aliases, product.industries,
          product.industries.flatMap(function (id) { return industryTerms[id]; }), Object.values(product.name), Object.values(product.summary), product.specs.flatMap(function (spec) { return Object.values(spec.value); })).join(' '));
        return tokens.every(function (token) { return haystack.includes(token); });
      });
    }
    function selection(ids) {
      var result = [];
      (Array.isArray(ids) ? ids : []).forEach(function (id) {
        var product = resolve(id);
        if (product && product.kind === 'product' && !result.includes(product.id) && result.length < 3) result.push(product.id);
      });
      return result;
    }
    function toggle(ids, id) {
      ids = selection(ids); var product = resolve(id);
      if (!product || product.kind !== 'product') return { ids: ids, reason: 'invalid' };
      if (ids.includes(product.id)) return { ids: ids.filter(function (item) { return item !== product.id; }) };
      if (ids.length === 3) return { ids: ids, reason: 'limit' };
      return { ids: ids.concat(product.id) };
    }
    return Object.freeze({ all: products, resolve: resolve, search: search, selection: selection, toggle: toggle });
  }
  root.DongDaCatalog = { version: version, families: families, industries: industries, localized: localized, validate: validate, create: create };
})(globalThis);
