/**
 * Session-store CRUD — load forms from awest:store, persist saves, trigger recompute + re-hydrate
 */
(function (global) {
  'use strict';

  var S = function () { return global.AwestStore; };
  var H = function () { return global.AwestDemoHydrate; };

  function pageName() {
    return (location.pathname.split('/').pop() || '').replace('.html', '');
  }

  function getQuery(key) {
    return new URLSearchParams(location.search).get(key);
  }

  function parseNum(val) {
    if (val == null) return 0;
    var n = parseFloat(String(val).replace(/[,$+%\s]/g, ''));
    return isNaN(n) ? 0 : n;
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
      if (el._crudWired) return;
      el._crudWired = true;
      el.addEventListener('click', function (e) {
        e.preventDefault();
        handler(el);
      });
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
    var item = itemId ? items.find(function (x) { return x.id === itemId; }) : items[0];
    if (!item) item = { id: S().uid('ref') };

    cfg.populate(item);

    wireSave('.btn-primary, button.btn-primary, a.btn-primary', function () {
      var fields = readLabeledFields(cfg.labels);
      var data = cfg.map(fields, item);
      S().saveReferenceCollection(cfg.collection, data);
      afterSave(cfg.back);
    });
  }

  function hydrateCustomerCrud() {
    if (pageName() !== 'customer-detail') return;
    var id = getQuery('id') || getQuery('customerId') || 'PACI-1200';
    var c = S().getCustomer(id);
    if (!c) return;

    var h1 = document.querySelector('h1');
    if (h1) h1.textContent = c.name;
    var sub = document.querySelector('.page-header p');
    if (sub) {
      sub.innerHTML = c.code + ' · <span class="badge badge-' + (c.status === 'active' ? 'active' : 'draft') + '">' + c.status + '</span>';
    }

    setFieldByLabel('billing code', c.code);
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
        return '<tr data-service-disc="' + sd.service + '"><td>' + sd.service + '</td>' +
          '<td class="tabular"><input value="' + sd.pct + '%"></td>' +
          '<td class="tabular"><input value="' + (sd.density || '—') + '"></td><td></td></tr>';
      }).join('');
    }

    wireSave('.sticky-footer .btn-primary, .sticky-footer button.btn-primary', function () {
      var partial = {
        id: c.id,
        code: c.code,
        name: c.name,
        repId: c.repId,
        status: c.status,
        overallDiscPct: c.overallDiscPct,
        serviceDiscounts: [],
        laneDiscounts: c.laneDiscounts || [],
        tariffIds: c.tariffIds || []
      };

      document.querySelectorAll('[data-service-disc]').forEach(function (tr) {
        var svc = tr.getAttribute('data-service-disc');
        var pctInput = tr.querySelector('td input');
        var orig = (c.serviceDiscounts || []).find(function (x) { return x.service === svc; });
        partial.serviceDiscounts.push({
          service: svc,
          pct: parseNum(pctInput ? pctInput.value : 0),
          density: orig ? orig.density : ''
        });
      });

      var b2b = partial.serviceDiscounts.find(function (x) { return x.service === 'B2B'; });
      if (b2b) partial.overallDiscPct = b2b.pct;

      S().saveCustomer(partial);
      afterSave('customers.html');
    });
  }

  function hydrateTariffDetailCrud() {
    if (pageName() !== 'tariff-detail') return;
    var id = getQuery('id') || 'TAR-B2B-BASE';
    var t = S().getTariff(id);
    if (!t) return;

    wireSave('.sticky-footer .btn-primary, .sticky-footer button.btn-primary', function () {
      var td = Object.assign({}, S().getState().settings.tariffDisplay || {});
      var baseInput = document.querySelector('[data-base-rate-field]');
      if (baseInput) td.baseRateCwt = parseNum(baseInput.value);

      S().saveSettings({ tariffDisplay: td });
      S().saveTariff(Object.assign({}, t));
      afterSave('tariffs.html');
    });
  }

  function hydrateRateMatrixCrud() {
    if (pageName() !== 'tariff-rate-matrix') return;
    var tariffId = getQuery('id') || 'TAR-B2B-BASE';
    var btn = document.getElementById('rate-matrix-save');
    if (!btn || btn._crudWired) return;
    btn._crudWired = true;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var tbody = document.getElementById('rate-matrix-body');
      var activeBtn = document.querySelector('#rate-matrix-picker .config-picker-btn.is-active');
      var comboId = activeBtn ? activeBtn.dataset.comboId : 'wgi_lax';
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
          rows.push({ zone: zone.textContent, description: desc.textContent, rates: rates });
        });
      }
      S().saveRateMatrix(key, { tariffId: tariffId, comboId: comboId, rows: rows, savedAt: new Date().toISOString() });
      alert('Rate matrix saved (' + rows.length + ' rows). Quotes will use updated reference data on next recompute.');
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

  function runCrud() {
    if (!S()) return;
    hydrateReferenceEdits();
    hydrateCustomerCrud();
    hydrateTariffDetailCrud();
    hydrateRateMatrixCrud();
    hydrateAdminListEditCrud();
    hydrateAdminSystemConfigCrud();
  }

  global.AwestDemoCrud = { run: runCrud };
})(typeof window !== 'undefined' ? window : this);
