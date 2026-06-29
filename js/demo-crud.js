/**
 * Session-store CRUD — load forms from awest:store, persist saves, trigger recompute + re-hydrate
 */
(function (global) {
  'use strict';

  var S = function () { return global.AwestStore; };
  var H = function () { return global.AwestDemoHydrate; };

  function dummyTariff() {
    return global.AwestDummyTariff || {
      baseRateCwt: 77.77, priorBaseRateCwt: 75, minimumChargeTariff: 111
    };
  }

  function pageName() {
    return (location.pathname.split('/').pop() || '').replace('.html', '');
  }

  function getQuery(key) {
    return new URLSearchParams(location.search).get(key);
  }

  function NF() {
    return global.AwestNumericFields;
  }

  function parseNum(val, fallback) {
    if (NF()) return NF().parse(val, fallback != null ? fallback : 0);
    if (val == null) return fallback != null ? fallback : 0;
    var n = parseFloat(String(val).replace(/[,$+%\s]/g, ''));
    return isNaN(n) ? (fallback != null ? fallback : 0) : n;
  }

  function displayNum(n, decimals) {
    if (NF()) return NF().format(n, decimals);
    return n == null || isNaN(n) ? '' : String(n);
  }

  function parseDensityVal(val) {
    if (NF()) return NF().parseDensity(val, null);
    var n = parseNum(val, NaN);
    return isNaN(n) ? null : n;
  }

  function fieldLabel(field) {
    var label = field.querySelector('label');
    if (!label) return '';
    return label.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function fieldInput(field) {
    var cb = field.querySelector('label input[type="checkbox"]');
    if (cb) return cb;
    return field.querySelector('input, select, textarea');
  }

  function readFieldValue(input) {
    if (!input) return '';
    if (input.type === 'checkbox') return input.checked;
    return input.value;
  }

  function setFieldValue(input, val) {
    if (!input) return;
    if (input.type === 'checkbox') {
      input.checked = !!val;
      return;
    }
    input.value = val != null ? val : '';
  }

  function setFieldByLabel(labelKey, val) {
    document.querySelectorAll('.field').forEach(function (field) {
      if (fieldLabel(field).indexOf(labelKey) < 0) return;
      setFieldValue(fieldInput(field), val);
    });
  }

  function readLabeledFields(labelMap) {
    var fields = {};
    document.querySelectorAll('.field').forEach(function (field) {
      var lbl = fieldLabel(field);
      var key = labelMap[lbl];
      if (!key) {
        Object.keys(labelMap).forEach(function (k) {
          if (!key && lbl.indexOf(k) >= 0) key = labelMap[k];
        });
      }
      if (!key && lbl.indexOf('call-for-quote') >= 0) key = labelMap['call-for-quote'];
      if (!key) return;
      fields[key] = readFieldValue(fieldInput(field));
    });
    return fields;
  }

  function wireSave(selector, handler) {
    document.querySelectorAll(selector).forEach(function (el) {
      if (el._crudWired || el._storeWired) return;
      el._crudWired = true;
      el._storeWired = true;
      el.addEventListener('click', function (e) {
        e.preventDefault();
        handler(el);
      });
    });
  }

  function wireSaveOne(el, handler) {
    if (!el || el._crudWired || el._storeWired) return;
    el._crudWired = true;
    el._storeWired = true;
    el.addEventListener('click', function (e) {
      e.preventDefault();
      handler(el);
    });
  }

  function afterSave(redirect) {
    if (H() && H().rerun) H().rerun();
    if (redirect) location.href = redirect;
  }

  function hydrateReferenceEdits() {
    var name = pageName();
    var configs = {
      'reference-accessorial-edit': {
        collection: 'accessorials',
        back: 'reference-accessorials.html',
        labels: {
          'name': 'name',
          'trigger condition': 'trigger',
          'rate / fee': 'rate',
          status: 'status'
        },
        map: function (fields, item) {
          return {
            id: item.id,
            name: fields.name || item.name,
            trigger: fields.trigger || item.trigger,
            rate: parseNum(fields.rate),
            rateType: item.rateType || 'flat',
            status: String(fields.status || item.status || 'active').toLowerCase()
          };
        },
        populate: function (item) {
          setFieldByLabel('name', item.name);
          setFieldByLabel('trigger', item.trigger);
          setFieldByLabel('rate / fee', item.rate);
          setFieldByLabel('status', item.status);
        }
      },
      'reference-tier-hd-edit': {
        collection: 'hdTiers',
        back: 'reference-tiers-hd.html',
        labels: {
          'destination zip': 'zip',
          'poi / tier name': 'poi',
          bppc: 'basePricePerCube',
          'origin station': 'originStation',
          'service type': 'service',
          'call-for-quote': 'cfq'
        },
        map: function (fields, item) {
          var cfq = !!fields.cfq;
          return {
            id: item.id,
            zip: fields.zip || item.zip,
            poi: fields.poi || item.poi,
            tier: cfq ? null : (item.tier || '1'),
            basePricePerCube: cfq ? null : parseNum(fields.basePricePerCube),
            origin: fields.originStation || item.origin,
            service: fields.service || item.service
          };
        },
        populate: function (item) {
          setFieldByLabel('destination zip', item.zip);
          setFieldByLabel('poi / tier name', item.poi);
          setFieldByLabel('bppc', item.basePricePerCube);
          setFieldByLabel('origin station', item.origin);
          setFieldByLabel('service type', item.service);
          setFieldByLabel('call-for-quote', item.basePricePerCube == null);
        }
      },
      'reference-lane-b2b-edit': {
        collection: 'b2bLanes',
        back: 'reference-lanes-b2b.html',
        labels: {
          'base zip': 'baseZip',
          'lane description': 'description',
          'origin station': 'originStation',
          'call-for-quote': 'cfq'
        },
        map: function (fields, item) {
          return {
            id: item.id,
            baseZip: fields.baseZip || item.baseZip,
            description: fields.description || item.description,
            originStation: fields.originStation || item.originStation,
            cfq: !!fields.cfq,
            tariffGroup: item.tariffGroup != null ? item.tariffGroup : 0
          };
        },
        populate: function (item) {
          setFieldByLabel('base zip', item.baseZip);
          setFieldByLabel('lane description', item.description);
          setFieldByLabel('origin station', item.originStation);
          setFieldByLabel('call-for-quote', item.cfq);
        }
      },
      'reference-lane-edit': {
        collection: 'b2bLanes',
        back: 'reference-lanes-b2b.html',
        labels: {
          'base zip': 'baseZip',
          'lane description': 'description',
          'origin station': 'originStation',
          'call-for-quote': 'cfq',
          'tariff group': 'tariffGroup'
        },
        map: function (fields, item) {
          return {
            id: item.id,
            baseZip: fields.baseZip || item.baseZip,
            description: fields.description || item.description,
            originStation: fields.originStation || item.originStation,
            cfq: !!fields.cfq,
            tariffGroup: parseNum(fields.tariffGroup) || item.tariffGroup || 0
          };
        },
        populate: function (item) {
          setFieldByLabel('base zip', item.baseZip);
          setFieldByLabel('lane description', item.description);
          setFieldByLabel('origin station', item.originStation);
          setFieldByLabel('call-for-quote', item.cfq);
          setFieldByLabel('tariff group', item.tariffGroup);
        }
      }
    };

    var cfg = configs[name];
    if (!cfg) return;

    var itemId = getQuery('id');
    var items = S().getState().reference[cfg.collection] || [];
    var item = itemId ? items.find(function (x) { return x.id === itemId; }) : null;
    if (!item) item = { id: S().uid('ref') };

    cfg.populate(item);

    wireSave('.btn-primary, button.btn-primary, a.btn-primary', function () {
      var fields = readLabeledFields(cfg.labels);
      var data = cfg.map(fields, item);
      S().saveReferenceCollection(cfg.collection, data);
      afterSave(cfg.back);
    });
  }

  function readCustomerForm(existing) {
    var base = existing || {};
    var partial = {
      id: base.id,
      code: base.code || '',
      name: base.name || 'New Customer',
      repId: base.repId || S().getState().meta.currentUserId,
      status: base.status || 'active',
      overallDiscPct: base.overallDiscPct != null ? base.overallDiscPct : 0,
      serviceDiscounts: [],
      laneDiscounts: [],
      tariffIds: base.tariffIds || ['TAR-B2B-BASE'],
      tariffNotes: '',
      pickupLocation: '',
      fixedFuelPct: null,
      contact: ''
    };

    document.querySelectorAll('.field').forEach(function (field) {
      var lbl = fieldLabel(field);
      var input = fieldInput(field);
      if (!input) return;
      if (lbl.indexOf('billing code') >= 0) partial.code = String(readFieldValue(input)).trim();
      if (lbl.indexOf('assigned rep') >= 0) {
        var repName = String(readFieldValue(input)).trim();
        var rep = S().getState().users.find(function (u) { return u.name === repName; });
        if (rep) partial.repId = rep.id;
      }
      if (lbl.indexOf('contact') >= 0) partial.contact = String(readFieldValue(input)).trim();
    });

    var notesEl = document.querySelector('[data-tariff-notes-text]');
    if (notesEl) partial.tariffNotes = notesEl.value.trim();
    var pickupEl = document.querySelector('[data-pickup-location]');
    if (pickupEl) partial.pickupLocation = pickupEl.value.trim();
    var fuelEl = document.querySelector('[data-fixed-fuel]');
    if (fuelEl && fuelEl.value.trim()) partial.fixedFuelPct = parseNum(fuelEl.value);

    if (partial.contact && partial.name === 'New Customer') {
      partial.name = partial.contact.split(',')[0].trim() || partial.code || 'New Customer';
    }
    if (!partial.code && partial.id) partial.code = partial.id;

    document.querySelectorAll('[data-service-disc]').forEach(function (tr) {
      var svc = tr.getAttribute('data-service-disc');
      var cells = tr.querySelectorAll('td input');
      var densityRaw = cells[1] ? cells[1].value : '';
      partial.serviceDiscounts.push({
        service: svc,
        pct: parseNum(cells[0] ? cells[0].value : 0),
        density: parseDensityVal(densityRaw)
      });
    });

    document.querySelectorAll('[data-customer-lane-discounts] tbody tr').forEach(function (tr) {
      var cells = tr.querySelectorAll('td');
      if (cells.length < 3) return;
      partial.laneDiscounts.push({
        lane: cells[0].textContent.trim(),
        service: cells[1].textContent.trim(),
        pct: parseNum(cells[2].querySelector('input') ? cells[2].querySelector('input').value : 0)
      });
    });

    var b2b = partial.serviceDiscounts.find(function (x) { return x.service === 'B2B'; });
    if (b2b) partial.overallDiscPct = b2b.pct;

    return partial;
  }

  function refreshCustomerQuoteHistoryPreview(customerId, partial) {
    var qt = document.querySelector('[data-customer-quotes] tbody');
    if (!qt || !customerId) return;
    var store = S();
    var previewCustomer = Object.assign({}, store.getCustomer(customerId) || {}, partial);
    var quotes = store.getState().quotes.filter(function (q) { return q.customerId === customerId; });
    var P = global.AwestPricingMock;
    qt.innerHTML = quotes.map(function (q) {
      var previewQ = Object.assign({}, q);
      if (!previewQ.appliedTerms && P && P.ensureQuotePricingModel) {
        previewQ.customerDiscPct = previewCustomer.overallDiscPct;
        P.ensureQuotePricingModel(previewQ, {
          getState: function () { return store.getState(); },
          getCustomer: function (id) { return id === customerId ? previewCustomer : store.getCustomer(id); }
        });
      }
      var p = store.computeQuotePricing(previewQ);
      var href = 'quote-detail.html?id=' + encodeURIComponent(q.id);
      var badge = q.status === 'pending' ? 'pending' : q.status;
      return '<tr><td class="tabular"><a href="' + href + '">' + q.id + '</a></td><td class="tabular">' +
        (global.AwestPricingMock ? global.AwestPricingMock.formatMoney(p.total || 0) : p.total) +
        '</td><td><span class="badge badge-' + badge + '">' + q.status + '</span></td>' +
        '<td class="actions"><a href="' + href + '">Open</a></td></tr>';
    }).join('') || '<tr><td colspan="4">No quotes yet</td></tr>';
  }

  function wireCustomerDiscountLivePreview(c) {
    var root = document.querySelector('[data-customer-discounts]');
    if (!root || root._livePreviewWired) return;
    root._livePreviewWired = true;
    var timer;
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        refreshCustomerQuoteHistoryPreview(c.id, readCustomerForm(c));
      }, 200);
    }
    root.addEventListener('input', schedule);
    root.addEventListener('change', schedule);
    document.querySelectorAll('[data-customer-lane-discounts]').forEach(function (laneRoot) {
      laneRoot.addEventListener('input', schedule);
      laneRoot.addEventListener('change', schedule);
    });
    var fuelEl = document.querySelector('[data-fixed-fuel]');
    if (fuelEl) {
      fuelEl.addEventListener('input', schedule);
      fuelEl.addEventListener('change', schedule);
    }
  }

  function wireTariffDetailLiveFields(t) {
    var selectors = '[data-base-rate-field], [data-minimum-charge-field], [data-margin-field], [data-density-input], [data-service-select], [data-uom-select], [data-lane-field]';
    function commitLive() {
      var partial = readTariffDetailForm(t);
      S().saveTariff(partial);
      renderBaselineSummary(partial.config);
      if (H() && H().rerun) H().rerun();
    }
    document.querySelectorAll(selectors).forEach(function (el) {
      if (el._tariffLiveWired) return;
      el._tariffLiveWired = true;
      var timer;
      function commit() {
        clearTimeout(timer);
        timer = setTimeout(commitLive, 300);
      }
      el.addEventListener('input', commit);
      el.addEventListener('change', commit);
    });
    var originGrid = document.querySelector('[data-origin-grid]');
    if (originGrid && !originGrid._tariffLiveWired) {
      originGrid._tariffLiveWired = true;
      var ogTimer;
      function ogCommit() {
        clearTimeout(ogTimer);
        ogTimer = setTimeout(commitLive, 300);
      }
      originGrid.addEventListener('input', ogCommit);
      originGrid.addEventListener('change', ogCommit);
    }
    if (!document._tariffOverviewLiveWired) {
      document._tariffOverviewLiveWired = true;
      document.addEventListener('awest:tariff-overview-change', function () {
        commitLive();
      });
    }
  }

  function hydrateCustomerCrud() {
    if (pageName() !== 'customer-detail') return;
    var id = getQuery('id') || getQuery('customerId');
    var isNew = !id;
    var c = id ? S().getCustomer(id) : null;

    if (isNew) {
      var h1New = document.querySelector('h1');
      if (h1New) h1New.textContent = 'New Customer';
      var subNew = document.querySelector('.page-header p');
      if (subNew) subNew.innerHTML = '<span class="badge badge-draft">Draft</span>';
      wireSave('.sticky-footer .btn-primary, .sticky-footer button.btn-primary', function () {
        var partial = readCustomerForm(null);
        partial.id = partial.code || S().uid('CUST');
        partial.code = partial.code || partial.id;
        if (!partial.code) {
          alert('Enter a billing code for the new customer.');
          return;
        }
        if (S().getCustomer(partial.id)) {
          alert('Customer ID already exists — choose a unique billing code.');
          return;
        }
        S().saveCustomer(partial);
        afterSave('customers.html');
      });
      return;
    }

    if (!c) return;

    var h1 = document.querySelector('h1');
    if (h1) h1.textContent = c.name;
    var sub = document.querySelector('.page-header p');
    if (sub) {
      sub.innerHTML = c.code + ' · <span class="badge badge-' + (c.status === 'active' ? 'active' : 'draft') + '">' + c.status + '</span>';
    }

    setFieldByLabel('billing code', c.code);
    if (c.contact) setFieldByLabel('contact', c.contact);
    var rep = S().getUser(c.repId);
    setFieldByLabel('assigned rep', rep ? rep.name : c.repId);

    var tariffsTb = document.querySelector('[data-customer-tariffs] tbody');
    if (tariffsTb) {
      tariffsTb.innerHTML = (c.tariffIds || []).map(function (tid) {
        var t = S().getTariff(tid);
        return t ? '<tr><td><a href="tariff-detail.html?id=' + encodeURIComponent(t.id) + '">' + t.id + '</a></td><td>' + t.service + '</td><td><span class="badge badge-active">' + t.status + '</span></td></tr>' : '';
      }).join('') || '<tr><td colspan="3">No tariffs assigned</td></tr>';
    }

    var discountsTb = document.querySelector('[data-customer-discounts] tbody');
    if (discountsTb && c.serviceDiscounts && c.serviceDiscounts.length) {
      discountsTb.innerHTML = c.serviceDiscounts.map(function (sd) {
        var densityVal = sd.density != null && sd.density !== '' ? displayNum(parseNum(sd.density), 1) : '';
        return '<tr data-service-disc="' + sd.service + '"><td>' + sd.service + '</td>' +
          '<td class="tabular"><input type="number" data-cust-disc-pct min="0" max="100" step="0.1" value="' + displayNum(sd.pct) + '"></td>' +
          '<td class="tabular"><input type="number" data-cust-disc-density min="0" step="0.1" placeholder="—" value="' + densityVal + '"></td><td></td></tr>';
      }).join('');
    }

    var laneTb = document.querySelector('[data-customer-lane-discounts] tbody');
    if (laneTb && c.laneDiscounts && c.laneDiscounts.length) {
      laneTb.innerHTML = c.laneDiscounts.map(function (ld) {
        return '<tr><td>' + ld.lane + '</td><td>' + ld.service + '</td>' +
          '<td class="tabular"><input type="number" min="0" max="100" step="0.1" value="' + displayNum(ld.pct) + '"></td></tr>';
      }).join('');
    }

    wireCustomerDiscountLivePreview(c);

    wireSave('.sticky-footer .btn-primary, .sticky-footer button.btn-primary', function () {
      var partial = readCustomerForm(c);
      S().saveCustomer(partial);
      if (H() && H().rerun) H().rerun();
      afterSave('customers.html');
    });
  }

  function escapeAttr(val) {
    return String(val == null ? '' : val)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  var BASELINE_RULE_TYPES = ['Commodity', 'Minimum charge', 'Promotion'];

  function defaultBaselineRule(partial) {
    return Object.assign({
      type: 'Commodity',
      scope: '',
      value: '',
      effect: ''
    }, partial || {});
  }

  function baselineRuleRowHtml(rule) {
    var typeOpts = BASELINE_RULE_TYPES.map(function (t) {
      return '<option value="' + t + '"' + (rule.type === t ? ' selected' : '') + '>' + t + '</option>';
    }).join('');
    return '<tr data-baseline-rule-row>' +
      '<td><select data-baseline-type class="baseline-rule-select">' + typeOpts + '</select></td>' +
      '<td><input data-baseline-scope class="baseline-rule-input" value="' + escapeAttr(rule.scope) + '"></td>' +
      '<td><input data-baseline-value class="baseline-rule-input tabular" value="' + escapeAttr(rule.value) + '"></td>' +
      '<td><input data-baseline-effect class="baseline-rule-input" value="' + escapeAttr(rule.effect) + '"></td>' +
      '<td class="actions"><button type="button" class="btn btn-link btn-sm" data-baseline-delete>Remove</button></td>' +
      '</tr>';
  }

  function readBaselineRulesFromDom() {
    var rules = [];
    document.querySelectorAll('[data-baseline-rule-row]').forEach(function (tr) {
      var typeSel = tr.querySelector('[data-baseline-type]');
      if (!typeSel) return;
      rules.push({
        type: typeSel.value,
        scope: (tr.querySelector('[data-baseline-scope]') || {}).value || '—',
        value: (tr.querySelector('[data-baseline-value]') || {}).value || '—',
        effect: (tr.querySelector('[data-baseline-effect]') || {}).value || '—'
      });
    });
    return rules;
  }

  function renderBaselineRulesTable(rules) {
    var tbody = document.querySelector('[data-tariff-baseline-rules]');
    if (!tbody) return;
    var list = rules && rules.length ? rules : [];
    if (!list.length) {
      tbody.innerHTML = '<tr data-baseline-empty><td colspan="5" class="text-muted-sm" style="padding:var(--space-md)">No baseline rules yet — add one below or set minimum charge on the pricing model panel.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(function (rule) {
      return baselineRuleRowHtml(rule);
    }).join('');
  }

  function renderBaselineSummary(cfg) {
    var ul = document.querySelector('[data-baseline-summary]');
    if (!ul) return;
    var D = dummyTariff();
    var baseText = '$' + (Number(cfg.baseRateCwt) || D.baseRateCwt).toFixed(2) + ' / CWT — national default';
    document.querySelectorAll('[data-tariff-base-rate-display]').forEach(function (el) {
      el.textContent = baseText;
    });
    var items = [
      '<li><details open><summary>Base rate &amp; matrix</summary>' +
      '<p style="margin-top:8px;font-size:13px" data-tariff-base-rate-display>' + baseText + '</p></details></li>'
    ];
    (cfg.baselineRules || []).forEach(function (rule) {
      items.push(
        '<li><details><summary>' + escapeAttr(rule.type) + '</summary>' +
        '<p style="margin-top:8px;font-size:13px">' + escapeAttr(rule.scope) + ': ' +
        escapeAttr(rule.value) + ' — ' + escapeAttr(rule.effect) + '</p></details></li>'
      );
    });
    ul.innerHTML = items.join('');
  }

  function buildBaselineRulesFromWizard() {
    var rules = [];
    var commSel = document.getElementById('tw-comm-ov');
    if (commSel && commSel.value && commSel.value !== 'None') {
      var m = commSel.value.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
      if (m) {
        rules.push({
          type: 'Commodity',
          scope: m[1].trim(),
          value: m[2].trim(),
          effect: m[2].trim() + ' on base rate'
        });
      }
    }
    var minEl = document.getElementById('tw-min-charge');
    var minVal = minEl && minEl.value.trim() ? minEl.value.trim() : '';
    var td = S().getState().settings.tariffDisplay || {};
    var D = dummyTariff();
    var minCharge = minVal ? parseNum(minVal) : (td.minimumCharge || D.minimumChargeTariff);
    rules.push({
      type: 'Minimum charge',
      scope: 'All lanes',
      value: minVal.indexOf('$') === 0 ? minVal : '$' + minCharge,
      effect: 'Floor after rate × weight'
    });
    var promoSel = document.getElementById('tw-promo');
    if (promoSel && promoSel.value && promoSel.value !== 'None') {
      rules.push({
        type: 'Promotion',
        scope: 'All commodities',
        value: promoSel.value,
        effect: 'Linehaul discount'
      });
    } else {
      rules.push({ type: 'Promotion', scope: '—', value: 'None active', effect: '—' });
    }
    return rules;
  }

  function syncMinChargeBaselineRule(cfg) {
    cfg.baselineRules = (cfg.baselineRules || []).slice();
    var D = dummyTariff();
    var minVal = '$' + (cfg.minimumCharge != null ? cfg.minimumCharge : D.minimumChargeTariff);
    var minIdx = cfg.baselineRules.findIndex(function (r) {
      return String(r.type).toLowerCase().indexOf('minimum') >= 0;
    });
    if (minIdx >= 0) {
      cfg.baselineRules[minIdx].value = minVal;
    } else {
      cfg.baselineRules.push({
        type: 'Minimum charge',
        scope: 'All lanes',
        value: minVal,
        effect: 'Floor after rate × weight'
      });
    }
    return cfg;
  }

  function readWizardOriginGridFromDom() {
    var TE = window.AwestTariffEngine;
    var grid = TE ? TE.defaultOriginGrid() : {};
    var services = ['b2b', 'threshold', 'wgni', 'wgi'];
    document.querySelectorAll('.origin-station-row').forEach(function (row) {
      var codeEl = row.querySelector('.origin-station-code');
      var origin = codeEl ? codeEl.textContent.trim() : '';
      if (!origin) return;
      var enabled = row.querySelector('[data-station-include][value="yes"]:checked') !== null;
      grid[origin] = grid[origin] || { enabled: enabled };
      grid[origin].enabled = enabled;
      if (!enabled) return;
      var densityInp = row.querySelector('.origin-station-detail input.tabular');
      var adjInputs = row.querySelectorAll('[data-rate-adj-input]');
      var density = densityInp ? parseNum(densityInp.value) : 8.5;
      var minAdj = adjInputs[0] ? parseNum(adjInputs[0].value) : 0;
      var lhAdj = adjInputs[1] ? parseNum(adjInputs[1].value) : 0;
      services.forEach(function (svc) {
        grid[origin][svc] = { density: density, minAdjPct: minAdj, linehaulAdjPct: lhAdj };
      });
    });
    return grid;
  }

  function readOriginGridFromDom() {
    var TE = window.AwestTariffEngine;
    var grid = TE ? TE.defaultOriginGrid() : {};
    document.querySelectorAll('[data-origin-row]').forEach(function (tr) {
      var origin = tr.getAttribute('data-origin-row');
      if (!origin) return;
      var enabledEl = tr.querySelector('[data-origin-enabled]');
      grid[origin] = grid[origin] || { enabled: true };
      grid[origin].enabled = enabledEl ? enabledEl.checked : true;
      tr.querySelectorAll('[data-origin-cell]').forEach(function (cell) {
        var st = cell.getAttribute('data-origin-cell');
        if (!st) return;
        grid[origin][st] = {
          density: parseNum(cell.querySelector('[data-og-density]') && cell.querySelector('[data-og-density]').value),
          minAdjPct: parseNum(cell.querySelector('[data-og-min]') && cell.querySelector('[data-og-min]').value),
          linehaulAdjPct: parseNum(cell.querySelector('[data-og-lh]') && cell.querySelector('[data-og-lh]').value)
        };
      });
    });
    return grid;
  }

  function renderOriginGridTable(grid) {
    var tbody = document.querySelector('[data-origin-grid]');
    if (!tbody) return;
    var TE = window.AwestTariffEngine;
    var origins = TE ? TE.AW_ORIGINS : ['LAX', 'SFO', 'DFW', 'EWR', 'TMV', 'PHX', 'ATL'];
    var services = [
      { key: 'b2b', label: 'B2B' },
      { key: 'threshold', label: 'Threshold' },
      { key: 'wgni', label: 'WG No Insp.' },
      { key: 'wgi', label: 'WG Insp.' }
    ];
    grid = grid || (TE ? TE.defaultOriginGrid() : {});
    tbody.innerHTML = origins.map(function (origin) {
      var row = grid[origin] || { enabled: true };
      var enabled = row.enabled !== false;
      var cells = services.map(function (svc) {
        if (!enabled) return '<td class="text-muted-sm">—</td>';
        var c = row[svc.key] || { density: 8.5, minAdjPct: 0, linehaulAdjPct: 0 };
        return '<td data-origin-cell="' + svc.key + '">' +
          '<span class="origin-grid-cell">' +
          '<input class="tabular" data-og-density type="number" step="0.1" min="0" value="' + c.density + '" title="Density (lbs/cu ft)"> / ' +
          '<input class="tabular" data-og-min type="number" step="0.1" value="' + c.minAdjPct + '" title="Min charge adj (%)"> / ' +
          '<input class="tabular" data-og-lh type="number" step="0.1" value="' + c.linehaulAdjPct + '" title="Linehaul adj (%)">' +
          '</span></td>';
      }).join('');
      return '<tr data-origin-row="' + origin + '">' +
        '<td class="tabular"><label style="display:flex;align-items:center;gap:6px;font-weight:600">' +
        '<input type="checkbox" data-origin-enabled ' + (enabled ? 'checked' : '') + '> ' + origin + '</label></td>' +
        cells + '</tr>';
    }).join('');
  }

  var TARIFF_SERVICE_LABELS = {
    b2b: 'B2B',
    threshold: 'Threshold',
    'wg-no-insp': 'WG No Inspection',
    'wg-insp': 'White Glove Inspection'
  };

  function readTariffDetailForm(t) {
    var existing = (S().getTariff(t.id) || t).config || {};
    var cfg = Object.assign({}, existing);
    var nameInput = document.querySelector('[data-tariff-name]');
    var descInput = document.querySelector('[data-tariff-description]');
    var startInput = document.querySelector('[data-tariff-effective-start]');
    var endInput = document.querySelector('[data-tariff-effective-end]');
    var baseInput = document.querySelector('[data-base-rate-field]');
    var minInput = document.querySelector('[data-minimum-charge-field]');
    var marginInput = document.querySelector('[data-margin-field]');
    var densityInput = document.querySelector('[data-density-input]');
    var laneInput = document.querySelector('[data-lane-field]');
    var serviceSelect = document.querySelector('[data-service-select]');
    var uomSelect = document.querySelector('[data-uom-select]');

    if (baseInput) cfg.baseRateCwt = parseNum(baseInput.value);
    if (minInput) cfg.minimumCharge = parseNum(minInput.value);
    if (marginInput) cfg.marginFloorPct = parseNum(marginInput.value);
    if (densityInput) cfg.density = parseNum(densityInput.value);
    if (laneInput) cfg.rateTableLabel = laneInput.value.trim();
    if (descInput) cfg.description = descInput.value.trim();
    if (endInput) cfg.effectiveEnd = endInput.value;
    cfg.baselineRules = readBaselineRulesFromDom();
    cfg.originGrid = readOriginGridFromDom();
    syncMinChargeBaselineRule(cfg);

    return {
      id: t.id,
      name: nameInput ? nameInput.value.trim() : t.name,
      effectiveDate: startInput ? startInput.value : t.effectiveDate,
      service: serviceSelect ? (TARIFF_SERVICE_LABELS[serviceSelect.value] || t.service) : t.service,
      uom: uomSelect ? uomSelect.value.toUpperCase() : t.uom,
      config: cfg
    };
  }

  function hydrateTariffBaselineCrud() {
    if (pageName() !== 'tariff-detail') return;
    var id = getQuery('id') || 'TAR-B2B-BASE';
    var t = S().getTariff(id);
    if (!t) return;
    var cfg = t.config || {};

    renderBaselineRulesTable(cfg.baselineRules);
    renderBaselineSummary(cfg);
    renderOriginGridTable(cfg.originGrid);

    var tbody = document.querySelector('[data-tariff-baseline-rules]');
    if (tbody && !tbody._baselineWired) {
      tbody._baselineWired = true;
      tbody.addEventListener('click', function (e) {
        var del = e.target.closest('[data-baseline-delete]');
        if (!del) return;
        e.preventDefault();
        var row = del.closest('[data-baseline-rule-row]');
        if (row) row.remove();
        if (!tbody.querySelector('[data-baseline-rule-row]')) {
          tbody.innerHTML = '<tr data-baseline-empty><td colspan="5" class="text-muted-sm" style="padding:var(--space-md)">No baseline rules — add one below.</td></tr>';
        }
      });
    }

    var addBtn = document.querySelector('[data-baseline-add-row]');
    if (addBtn && !addBtn._crudWired) {
      addBtn._crudWired = true;
      addBtn.addEventListener('click', function () {
        if (!tbody) return;
        var empty = tbody.querySelector('[data-baseline-empty]');
        if (empty) empty.remove();
        tbody.insertAdjacentHTML('beforeend', baselineRuleRowHtml(defaultBaselineRule()));
      });
    }
  }

  function hydrateTariffDetailCrud() {
    if (pageName() !== 'tariff-detail') return;
    var id = getQuery('id') || 'TAR-B2B-BASE';
    var t = S().getTariff(id);
    if (!t) return;

    hydrateTariffBaselineCrud();

    wireTariffDetailLiveFields(t);

    wireSave('.sticky-footer .btn-primary, .sticky-footer button.btn-primary', function () {
      S().saveTariff(readTariffDetailForm(t));
      afterSave('tariff-detail.html?id=' + encodeURIComponent(id) + '#overrides');
    });
  }

  function hydrateRateMatrixCrud() {
    if (pageName() !== 'tariff-rate-matrix') return;
    var tariffId = getQuery('id') || getQuery('tariff') || 'TAR-B2B-BASE';
    var btn = document.getElementById('rate-matrix-save');
    if (!btn || btn._crudWired) return;
    btn._crudWired = true;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var tbody = document.getElementById('rate-matrix-body');
      var originSel = document.getElementById('rate-matrix-origin');
      var serviceSel = document.getElementById('rate-matrix-service');
      var comboId = (originSel && serviceSel)
        ? serviceSel.value + '_' + originSel.value
        : 'wgi_lax';
      var key = tariffId + '::' + comboId;
      var rows = [];
      if (tbody) {
        tbody.querySelectorAll('tr').forEach(function (tr) {
          var zone = tr.querySelector('th');
          var desc = tr.querySelector('td');
          if (!zone || !desc || !tr.querySelector('td input')) return;
          var rates = [];
          tr.querySelectorAll('td input').forEach(function (inp) {
            rates.push(parseNum(inp.value));
          });
          rows.push({ zone: zone.textContent.trim(), description: desc.textContent.trim(), rates: rates });
        });
      }
      S().saveRateMatrix(key, {
        tariffId: tariffId,
        comboId: comboId,
        rows: rows,
        savedAt: new Date().toISOString()
      });
      if (H() && H().rerun) H().rerun();
      alert('Rate matrix saved (' + rows.length + ' rows) to session store for ' + key + '.');
    });
  }

  function hydrateTariffWizardCrud() {
    if (pageName() !== 'tariff-wizard') return;
    var createBtn = document.querySelector('[data-create-tariff]');
    if (!createBtn || createBtn._crudWired) return;
    createBtn._crudWired = true;
    createBtn.addEventListener('click', function (e) {
      e.preventDefault();
      var cloneId = getQuery('clone');
      if (cloneId) {
        var cloned = S().cloneTariff(cloneId);
        if (cloned) {
          location.href = 'tariff-detail.html?id=' + encodeURIComponent(cloned.id);
          return;
        }
      }
      var td = S().getState().settings.tariffDisplay || {};
      var nameEl = document.getElementById('tw-name');
      var idEl = document.getElementById('tw-id');
      var startEl = document.getElementById('tw-start');
      var endEl = document.getElementById('tw-end');
      var name = nameEl ? nameEl.value.trim() : 'New Tariff';
      var id = idEl && idEl.value.trim() ? idEl.value.trim() : ('TAR-' + Date.now().toString(36).slice(-6).toUpperCase());
      var baseEl = document.getElementById('tw-base');
      var densityEl = document.getElementById('tw-density');
      var floorEl = document.getElementById('tw-floor');
      var serviceEl = document.getElementById('tw-service');
      var uomEl = document.getElementById('tw-uom');
      var baselineRules = buildBaselineRulesFromWizard();
      var minRule = baselineRules.find(function (r) { return String(r.type).toLowerCase().indexOf('minimum') >= 0; });
      var minDensityEl = document.getElementById('tw-min-density');
      var minCubeEl = document.getElementById('tw-min-cube');
      var commodityEl = document.getElementById('tw-commodity');
      var originGrid = readWizardOriginGridFromDom();
      var parentId = getQuery('parent') || 'TAR-B2B-BASE';
      var isBase = getQuery('base') === '1';
      S().saveTariff({
        id: id,
        name: name || 'New Tariff',
        type: isBase ? 'Base' : 'Derived',
        service: serviceEl ? serviceEl.options[serviceEl.selectedIndex].textContent.replace(/\s.*/, '') : 'B2B',
        uom: uomEl ? uomEl.value.toUpperCase() : 'CWT',
        customerId: null,
        status: 'draft',
        effectiveDate: startEl ? startEl.value : new Date().toISOString().slice(0, 10),
        version: 1,
        parentTariffId: isBase ? null : parentId,
        config: {
          baseRateCwt: parseNum(baseEl ? baseEl.value : td.baseRateCwt || dummyTariff().baseRateCwt),
          priorBaseRateCwt: td.priorBaseRateCwt || dummyTariff().priorBaseRateCwt,
          minimumCharge: minRule ? parseNum(minRule.value) : (td.minimumCharge || dummyTariff().minimumChargeTariff),
          marginFloorPct: parseNum(floorEl ? floorEl.value : 15),
          density: parseNum(densityEl ? densityEl.value : 8.5),
          minDensity: minDensityEl ? parseNum(minDensityEl.value) : null,
          minCube: minCubeEl && minCubeEl.value.trim() ? parseNum(minCubeEl.value) : null,
          commodity: commodityEl ? commodityEl.value : 'FAK',
          rateTableLabel: 'National B2B Matrix',
          description: name,
          effectiveEnd: endEl ? endEl.value : '2026-12-31',
          baselineRules: baselineRules,
          originGrid: originGrid
        }
      });
      location.href = 'tariff-detail.html?id=' + encodeURIComponent(id);
    });
  }

  function hydrateTariffAddRuleCrud() {
    if (pageName() !== 'tariff-add-override') return;
    var tariffId = getQuery('id') || 'TAR-B2B-BASE';
    var t = S().getTariff(tariffId);
    var sub = document.querySelector('.page-header p');
    if (sub && t) sub.textContent = t.id + ' · ' + t.name;

    wireSave('.btn-primary, a.btn-primary', function () {
      if (!t) return;
      var selects = document.querySelectorAll('select');
      var inputs = document.querySelectorAll('.card input');
      var ruleType = selects[0] && selects[0].selectedOptions[0]
        ? selects[0].selectedOptions[0].textContent
        : 'Commodity surcharge';
      var target = inputs[0] ? inputs[0].value.trim() : '';
      var adj = inputs[1] ? inputs[1].value.trim() : '';
      var fresh = S().getTariff(t.id) || t;
      var cfg = Object.assign({}, fresh.config || {});
      cfg.baselineRules = (cfg.baselineRules || []).slice();
      cfg.baselineRules.push({
        type: ruleType.replace(/ surcharge$/, ''),
        scope: target || '—',
        value: adj || '—',
        effect: 'Added on tariff — save detail to publish'
      });
      S().saveTariff({ id: t.id, config: cfg });
      afterSave('tariff-detail.html?id=' + encodeURIComponent(tariffId) + '#overrides');
    });
  }

  function hydrateTariffDeleteCrud() {
    if (pageName() !== 'tariff-delete-confirm') return;
    var id = getQuery('id') || 'TAR-SPOT-001';
    var t = S().getTariff(id);
    var banner = document.querySelector('[data-tariff-delete-banner]');
    if (banner && t) {
      banner.innerHTML = '<strong>Confirm deletion:</strong> ' + t.id + ' — ' + t.name + '. This action cannot be undone.';
    }
    document.querySelectorAll('[data-tariff-delete-cancel]').forEach(function (a) {
      a.href = 'tariff-detail.html?id=' + encodeURIComponent(id);
    });
    wireSave('[data-tariff-delete-confirm], .btn-destructive', function () {
      if (!t || t.id === 'TAR-B2B-BASE') {
        alert('Demo protects TAR-B2B-BASE from deletion. Choose a draft tariff such as TAR-SPOT-001.');
        return;
      }
      S().deleteTariff(id);
      afterSave('tariffs.html');
    });
  }

  function hydrateAdminListEditCrud() {
    if (pageName() !== 'admin-list-edit') return;
    var list = getQuery('list') || 'origins';
    var oldVal = getQuery('value') ? decodeURIComponent(getQuery('value')) : '';
    var input = document.querySelector('.field input');
    if (input && oldVal) input.value = oldVal;

    wireSave('.btn-primary, button.btn-primary', function () {
      var val = input ? input.value.trim() : '';
      if (!val) return;
      var lists = S().getState().validationLists;
      var arr = (lists[list] || []).slice();
      var idx = oldVal ? arr.indexOf(oldVal) : -1;
      if (idx >= 0) arr[idx] = val;
      else if (arr.indexOf(val) < 0) arr.push(val);
      lists[list] = arr;
      S().saveValidationLists(lists);
      afterSave('admin-list-management.html');
    });
  }

  function hydrateAdminSystemConfigCrud() {
    if (pageName() !== 'admin-system-config') return;
    wireSave('.btn-primary, button.btn-primary', function () {
      var partial = {};
      document.querySelectorAll('.card .field').forEach(function (field) {
        var label = fieldLabel(field);
        var input = fieldInput(field);
        if (!input) return;
        if (label.indexOf('rep max') >= 0) partial.repMaxDiscount = parseNum(input.value);
        if (label.indexOf('margin floor') >= 0) partial.marginFloor = parseNum(input.value);
        if (label.indexOf('cubic') >= 0) partial.cubicDivisor = parseNum(input.value);
      });
      S().saveSettings(partial);
      afterSave('admin-config.html');
    });
  }

  function hydrateReferenceFuelCrud() {
    var name = pageName();
    if (name === 'reference-fuel-edit') {
      var fuel = S().getState().reference.fuel.slice(-1)[0];
      if (!fuel) return;
      var inputs = document.querySelectorAll('.card input.tabular');
      if (inputs[0]) inputs[0].value = fuel.effectiveDate;
      if (inputs[1]) inputs[1].value = fuel.pct;
      wireSave('.btn-primary, a.btn-primary', function () {
        var pct = parseNum(inputs[1] ? inputs[1].value : fuel.pct);
        var sourceSel = document.querySelector('.card select');
        S().saveReferenceCollection('fuel', {
          id: fuel.id,
          effectiveDate: inputs[0] ? inputs[0].value : fuel.effectiveDate,
          pct: pct,
          source: sourceSel ? sourceSel.value : fuel.source,
          authorId: S().getState().meta.currentUserId
        });
        afterSave('reference-fuel.html');
      });
    }
    if (name === 'reference-fuel-override') {
      wireSave('.btn-primary, a.btn-primary', function () {
        var cardInputs = document.querySelectorAll('.card input.tabular');
        var reasonEl = document.querySelector('.card textarea');
        S().saveReferenceCollection('fuel', {
          id: S().uid('fuel'),
          effectiveDate: cardInputs[1] ? cardInputs[1].value : new Date().toISOString().slice(0, 10),
          pct: parseNum(cardInputs[0] ? cardInputs[0].value : 28.4),
          source: 'Manual override',
          reason: reasonEl ? reasonEl.value.trim() : '',
          authorId: S().getState().meta.currentUserId
        });
        afterSave('reference-fuel.html');
      });
    }
  }

  function hydrateReferenceTmsCrud() {
    if (pageName() !== 'reference-tms-mapping') return;
    wireSave('.btn-primary, button.btn-primary', function () {
      var mapping = S().getState().reference.tmsMapping;
      var tabs = ['b2b', 'threshold', 'mr2'];
      tabs.forEach(function (tab) {
        var tbody = document.querySelector('[data-tms-section="' + tab + '"] tbody');
        if (!tbody) return;
        var rows = [];
        tbody.querySelectorAll('tr').forEach(function (tr, ri) {
          var cells = tr.querySelectorAll('td input, td select');
          var orig = (mapping[tab] || [])[ri] || { id: S().uid('tms') };
          rows.push(Object.assign({}, orig, {
            tariffCode: cells[0] ? cells[0].value : orig.tariffCode,
            levelCode: cells[1] ? cells[1].value : orig.levelCode
          }));
        });
        if (rows.length) S().saveTmsMapping(tab, rows);
      });
      afterSave('reference.html');
    });
  }

  function hydrateAdminUserCrud() {
    if (pageName() === 'admin-invite') {
      wireSave('.btn-primary, a.btn-primary', function () {
        var inputs = document.querySelectorAll('.field input, .field select');
        S().inviteUser({
          email: inputs[0] ? inputs[0].value : 'new@americanwest.com',
          name: inputs[1] ? inputs[1].value : 'New User',
          role: inputs[2] ? inputs[2].value : 'Sales Rep'
        });
        afterSave('admin-users.html');
      });
      return;
    }
    if (pageName() === 'admin-user-edit') {
      var uid = getQuery('id');
      var u = uid ? S().getUser(uid) : S().getCurrentUser();
      if (!u) return;
      wireSave('.btn-primary, a.btn-primary', function () {
        var partial = { id: u.id, name: u.name, email: u.email, role: u.role, status: u.status };
        document.querySelectorAll('.field').forEach(function (field) {
          var label = (field.querySelector('label') || {}).textContent || '';
          var input = field.querySelector('input, select');
          if (!input) return;
          var low = label.toLowerCase();
          if (low.indexOf('name') >= 0) partial.name = input.value;
          if (low.indexOf('email') >= 0) partial.email = input.value;
          if (low.indexOf('role') >= 0) partial.role = input.value;
          if (low.indexOf('status') >= 0) partial.status = input.value;
        });
        S().saveUser(partial);
        afterSave('admin-users.html');
      });
      var disableBtn = document.querySelector('.btn-destructive');
      if (disableBtn && !disableBtn._crudWired) {
        disableBtn._crudWired = true;
        disableBtn.addEventListener('click', function (e) {
          e.preventDefault();
          if (window.confirm('Disable ' + u.name + '?')) {
            S().saveUser({ id: u.id, status: 'disabled' });
            afterSave('admin-users.html');
          }
        });
      }
    }
    if (pageName() === 'admin-agreement-template') {
      var ta = document.querySelector('textarea');
      if (ta) ta.value = S().getState().settings.agreementTemplate || ta.value;
      wireSave('.btn-primary, button.btn-primary', function () {
        S().saveSettings({ agreementTemplate: ta ? ta.value : '' });
        afterSave('admin-config.html');
      });
    }
  }

  function hydratePortalCrud() {
    if (pageName() === 'portal-add-address') {
      wireSave('.btn-primary, a.btn-primary', function () {
        var fields = document.querySelectorAll('.field input');
        S().savePortalAddress({
          customerId: S().getState().portal.activeCustomerId,
          label: fields[0] ? fields[0].value : 'Address',
          lines: (fields[1] ? fields[1].value : '') + ', ' + (fields[2] ? fields[2].value : ''),
          default: false
        });
        afterSave('portal-self-service.html');
      });
    }
    if (pageName() === 'portal-add-commodity') {
      wireSave('.btn-primary, a.btn-primary', function () {
        var fields = document.querySelectorAll('.field input');
        S().savePortalCommodity({
          customerId: S().getState().portal.activeCustomerId,
          name: fields[0] ? fields[0].value : 'Commodity',
          nmfc: fields[1] ? fields[1].value : '',
          dims: fields[2] ? fields[2].value : ''
        });
        afterSave('portal-self-service.html');
      });
    }
  }

  function hydrateTariffRollbackCrud() {
    if (pageName() !== 'tariff-rollback-confirm') return;
    wireSave('.btn-primary, a.btn-primary', function () {
      var id = getQuery('id') || 'TAR-B2B-BASE';
      S().rollbackTariff(id);
      afterSave('tariff-detail.html?id=' + encodeURIComponent(id));
    });
  }

  function hydrateQuoteArtifactCrud() {
    var name = pageName();
    if (name === 'quote-pdf') {
      var pdfId = getQuery('id') || 'Q-2026-0823';
      wireSave('.btn-primary, a.btn-primary', function () {
        S().generatePdf(pdfId);
        alert('PDF generated for ' + pdfId + ' (simulated).');
        afterSave('quote-detail.html?id=' + encodeURIComponent(pdfId));
      });
    }
    if (name === 'quote-esign') {
      var esignId = getQuery('id') || 'Q-2026-0823';
      var q = S().getQuote(esignId);
      wireSave('.btn-primary, a.btn-primary', function () {
        if (q && !q.artifacts.pdf.generatedAt) {
          alert('Generate PDF before sending for e-signature.');
          return;
        }
        S().sendEsign(esignId);
        alert('Sent for e-signature (simulated).');
        location.reload();
      });
      document.querySelectorAll('.btn-secondary').forEach(function (btn) {
        if (btn.textContent.indexOf('Sign') < 0 && btn.textContent.indexOf('Decline') < 0) return;
        wireSaveOne(btn, function () {
          if (btn.textContent.indexOf('Sign') >= 0) {
            S().signEsign(esignId);
            alert('Signed (simulated).');
          } else {
            S().declineEsign(esignId);
            alert('Declined (simulated).');
          }
          location.reload();
        });
      });
    }
    if (name === 'quote-tms-export') {
      var tmsId = getQuery('id') || 'Q-2026-0823';
      wireSaveOne(document.querySelector('[data-tms-run]'), function () {
        S().exportTms(tmsId);
        location.reload();
      });
    }
  }

  function runCrud() {
    if (!S()) return;
    hydrateReferenceEdits();
    hydrateReferenceFuelCrud();
    hydrateReferenceTmsCrud();
    hydrateCustomerCrud();
    hydrateTariffDetailCrud();
    hydrateRateMatrixCrud();
    hydrateTariffWizardCrud();
    hydrateTariffAddRuleCrud();
    hydrateTariffDeleteCrud();
    hydrateTariffRollbackCrud();
    hydrateAdminListEditCrud();
    hydrateAdminSystemConfigCrud();
    hydrateAdminUserCrud();
    hydratePortalCrud();
    hydrateQuoteArtifactCrud();
  }

  global.AwestDemoCrud = { run: runCrud };
})(typeof window !== 'undefined' ? window : this);
