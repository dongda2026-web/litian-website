(function (root) {
  'use strict';

  function localized(value, language) {
    if (typeof value === 'string') return value;
    return value && (value[language] || value.en || value.zh || value.ru) || '';
  }

  function minimumQuantity(product) {
    var field = (product.configuration || product.specs).find(function (item) { return item.id === 'qty'; });
    return Math.max(1, Number(product.moqK || 0) * 1000, Number(field && field.min || 0));
  }

  function validateConfiguration(product, values) {
    var errors = {};
    if (!product) return { product: 'required' };
    if (!values || typeof values !== 'object' || Array.isArray(values)) return { specifications: 'required' };
    if (Object.keys(values).some(function (id) { return !(product.configuration || product.specs).some(function (field) { return field.id === id; }); })) errors.specifications = 'required';
    (product.configuration || product.specs).forEach(function (field) {
      var value = values[field.id];
      if (field.type === 'select') {
        if (!field.opts.some(function (option) { return option.v === value; })) errors[field.id] = 'required';
      } else {
        var quantity = Number(value);
        if (!/^\d+$/.test(String(value || '')) || !Number.isSafeInteger(quantity) || quantity > 1000000000) {
          errors[field.id] = 'integer';
        } else if (quantity < minimumQuantity(product)) {
          errors[field.id] = 'minimum';
        }
      }
    });
    return errors;
  }

  function configurationRows(product, values, language) {
    return (product.configuration || product.specs).map(function (field) {
      var value = values[field.id];
      var option = field.type === 'select' && field.opts.find(function (item) { return item.v === value; });
      return {
        id: field.id,
        label: localized(field.label, language),
        value: option ? localized(option.l, language) : String(value || '') + (field.type === 'qty' ? ' ' + (field.unit || 'pcs') : '')
      };
    });
  }

  function retryConflict() {
    var error = new TypeError('retry_identity_conflict');
    error.code = 'retry_identity_conflict';
    return error;
  }

  function ordered(value, depth) {
    if (depth > 16) throw new TypeError('Invalid inquiry structure');
    if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (Array.isArray(value)) return value.map(function (item) { return ordered(item, depth + 1); });
    if (!value || typeof value !== 'object') throw new TypeError('Invalid inquiry value');
    var result = Object.create(null);
    Object.keys(value).sort().forEach(function (key) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new TypeError('Invalid inquiry key');
      result[key] = ordered(value[key], depth + 1);
    });
    return result;
  }

  async function saltedDigest(key, text) {
    return Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(key + text))))
      .map(function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
  }

  async function prepareRequest(payload, cached, context) {
    var routes = { inquiry: 'inquiry', 'quote-calculator': 'quote', 'multi-product-rfq': 'rfq', 'sample-request': 'sample' };
    if (!payload || !Object.hasOwn(routes, payload.type)) throw new TypeError('Invalid inquiry type');
    var original = JSON.stringify(payload);
    if (original.length > 262144) throw new TypeError('Inquiry too large');
    var data = ordered(JSON.parse(original), 0);
    var origin = new URL(context.page);
    if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password) throw new TypeError('Invalid public origin');
    var page = origin.origin + '/#' + routes[data.type];
    var locales = ['en', 'zh', 'ru', 'kk', 'ky', 'tg', 'tk', 'uz'];
    var language = locales.includes(context.language) ? context.language : 'en';
    if (cached) {
      var keys = Object.keys(cached).sort().join(',');
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(cached.key || '') || !/^[a-f0-9]{64}$/.test(cached.digest || '')) throw retryConflict();
      // Legacy records contain no recoverable context. Never guess a new identity on mismatch.
      if (keys === 'digest,key') {
        if (await saltedDigest(cached.key, original) !== cached.digest) throw retryConflict();
        return { key: cached.key, payload: JSON.parse(original), record: Object.freeze({ key: cached.key, digest: cached.digest }) };
      }
      if (keys !== 'digest,key,language,page,version' || cached.version !== 2 || !locales.includes(cached.language) || cached.page !== page) throw retryConflict();
    }
    delete data.language; delete data.page; delete data.timestamp; delete data.website; delete data.specificationLabels;
    if (data.type === 'multi-product-rfq') data.product = 'Multi-product inquiry (' + data.items.length + ')';
    var demand = JSON.stringify(ordered(data, 0));
    var key = cached ? cached.key : root.crypto.randomUUID();
    var digest = await saltedDigest(key, demand);
    if (cached && cached.digest === digest) {
      language = cached.language;
    } else if (cached) {
      key = root.crypto.randomUUID();
      digest = await saltedDigest(key, demand);
    }
    data.language = language; data.page = page;
    return {
      key: key, payload: ordered(data, 0),
      record: Object.freeze({ version: 2, key: key, digest: digest, language: language, page: page })
    };
  }

  async function submitInquiry(payload, options) {
    if (!options.endpoint) return { ok: false, reason: 'email-only' };
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, options.timeoutMs || 15000);
    try {
      var response = await (options.fetch || root.fetch)(options.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': options.idempotencyKey },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      var data = await response.json();
      if (response.ok && data.ok === true && data.persisted === true && typeof data.leadId === 'string' && /^DD-[A-Z0-9-]{8,80}$/.test(data.leadId)) {
        return { ok: true, leadId: data.leadId, duplicate: data.duplicate === true };
      }
      return { ok: false, reason: response.status === 409 ? 'conflict' : response.status === 422 ? 'validation' : response.status === 429 ? 'rate-limit' : 'unconfirmed' };
    } catch (error) {
      return { ok: false, reason: error.name === 'AbortError' ? 'timeout' : 'network' };
    } finally {
      clearTimeout(timer);
    }
  }

  root.DongDaProcurement = { retryVersion: '2026.10.09-retry-v2', prepareRequest: prepareRequest, localized: localized, minimumQuantity: minimumQuantity, validateConfiguration: validateConfiguration, configurationRows: configurationRows, submitInquiry: submitInquiry };
})(globalThis);
