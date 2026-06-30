/**
 * American West mockup — shared interactive behaviors (tabs use CSS; this handles dropdowns, filters, wizards).
 */
(function () {
  'use strict';

  var global = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this);

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  /* ── Dropdowns ── */
  function initDropdowns() {
    document.querySelectorAll('[data-dropdown]').forEach(function (root) {
      var trigger = root.querySelector('.dropdown-trigger');
      var menu = root.querySelector('.dropdown-menu');
      if (!trigger || !menu) return;

      function open() {
        document.querySelectorAll('[data-dropdown].is-open').forEach(function (other) {
          if (other !== root) closeDropdown(other);
        });
        root.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
      }

      function close() {
        root.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
      }

      trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        root.classList.contains('is-open') ? close() : open();
      });

      menu.querySelectorAll('[data-dropdown-select]').forEach(function (item) {
        item.addEventListener('click', function () {
          var label = item.getAttribute('data-dropdown-select') || item.textContent.trim();
          trigger.textContent = label + ' ▾';
          menu.querySelectorAll('.dropdown-item').forEach(function (el) {
            el.classList.toggle('active', el === item);
          });
          close();
        });
      });

      root._closeDropdown = close;
    });

    document.addEventListener('click', function () {
      document.querySelectorAll('[data-dropdown].is-open').forEach(closeDropdown);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('[data-dropdown].is-open').forEach(closeDropdown);
      }
    });
  }

  function closeDropdown(root) {
    root.classList.remove('is-open');
    var trigger = root.querySelector('.dropdown-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  /* ── URL query helpers ── */
  function getUrlParams() {
    return new URLSearchParams(window.location.search);
  }

  function buildDrillLabel(params) {
    var drill = params.get('drill');
    if (drill) return drill;

    var status = params.get('status');
    var view = params.get('view');
    var rep = params.get('rep');
    var metric = params.get('metric');
    var stage = params.get('stage');

    if (metric === 'win-rate') return 'Win Rate';
    if (view === 'open') return 'Open Quotes';
    if (status === 'pending') return 'Pending Approval';
    if (status === 'sent') return 'Quotes Sent';
    if (status === 'converted') return 'Converted to Shipment';
    if (status === 'expired') return 'Expired Quotes';
    if (status === 'lost') return 'Lost Opportunity';
    if (status === 'accepted') return 'Converted to Shipment';
    if (status === 'approved') return 'Approved Quotes';
    if (status === 'draft') return 'Draft Quotes';
    if (rep) return rep + "'s Quotes";
    if (stage) {
      var stageLabels = {
        draft: 'Draft stage',
        pending: 'Pending Approval stage',
        approved: 'Approved stage',
        sent: 'Sent stage',
        converted: 'Converted to Shipment stage',
        expired: 'Expired stage',
        lost: 'Lost Opportunity stage'
      };
      return stageLabels[stage] || stage;
    }
    return 'Filtered view';
  }

  function getDrillBackHref(from) {
    if (from === 'dashboard') return 'dashboard.html';
    if (from === 'crm-dashboard') return '../crm/crm-dashboard.html';
    return null;
  }

  function initDrillBanner() {
    var params = getUrlParams();
    var from = params.get('from');
    if (!from && !params.get('drill') && !params.get('metric') && !params.get('view') && !params.get('status') && !params.get('rep') && !params.get('stage')) {
      return;
    }

    var banner = document.querySelector('[data-drill-banner]');
    if (!banner) return;

    var sourceName = from === 'crm-dashboard' ? 'Sales Dashboard' : from === 'dashboard' ? 'Dashboard' : 'Previous screen';
    var label = buildDrillLabel(params);
    var backHref = getDrillBackHref(from);

    banner.hidden = false;
    banner.innerHTML =
      '<span class="drill-banner-text">Drilled down from <strong>' + sourceName + '</strong> · ' + label + '</span>' +
      (backHref ? '<a href="' + backHref + '" class="btn btn-secondary btn-sm">← Back</a>' : '');

    document.querySelectorAll('.kanban-col[data-stage]').forEach(function (col) {
      col.classList.toggle('is-drill-target', params.get('stage') === col.getAttribute('data-stage'));
    });

    var targetCol = document.querySelector('.kanban-col.is-drill-target');
    if (targetCol) {
      setTimeout(function () {
        targetCol.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }, 100);
    }
  }

  /* ── Filter bars ── */
  function initFilterBars() {
    document.querySelectorAll('.filter-bar[data-filter-target]').forEach(function (bar) {
      var targetSel = bar.getAttribute('data-filter-target');
      var table = document.querySelector(targetSel);
      if (!table) return;

      var tbody = table.querySelector('tbody');
      if (!tbody) return;

      var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr[data-quote-id], tr[data-status], tr[data-customer], tr[data-rep]'));
      var isQuotesTable = table.classList.contains('quotes-table-enhanced');
      if (isQuotesTable) {
        rows = Array.prototype.slice.call(tbody.querySelectorAll('tr[data-quote-id]'));
      } else if (!rows.length) {
        rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
      }
      var countEl = bar.parentElement.querySelector('[data-filter-count]');
      var emptyEl = bar.parentElement.querySelector('[data-filter-empty]');
      var urlParams = getUrlParams();
      var OPEN_STATUSES = ['draft', 'pending', 'approved', 'sent', 'portal_request'];

      function detailRowFor(quoteId) {
        return tbody.querySelector('tr[data-quote-detail="' + quoteId + '"]');
      }

      function getValues() {
        var values = { search: '' };
        bar.querySelectorAll('select[name], input[name]').forEach(function (el) {
          values[el.name] = el.value;
        });
        if (bar.getAttribute('data-filter-view')) {
          values._view = bar.getAttribute('data-filter-view');
        }
        if (bar.getAttribute('data-filter-period')) {
          values._period = bar.getAttribute('data-filter-period');
        }
        return values;
      }

      function setRowVisible(row, show) {
        row.hidden = !show;
        if (isQuotesTable) {
          var quoteId = row.getAttribute('data-quote-id');
          if (quoteId) {
            var detailRow = detailRowFor(quoteId);
            if (detailRow) detailRow.hidden = !show;
          }
        }
      }

      function rowMatches(row, values) {
        if (isQuotesTable && !row.getAttribute('data-quote-id')) return false;
        if (values._view === 'open') {
          var openStatus = row.getAttribute('data-status');
          if (OPEN_STATUSES.indexOf(openStatus) < 0) return false;
        }
        if (values._period === 'week') {
          if (row.getAttribute('data-period') !== 'week') return false;
        }
        for (var key in values) {
          if (key === 'search' || key === '_view' || key === '_period') continue;
          var filterVal = values[key];
          if (!filterVal || filterVal === 'All') continue;
          var rowVal = row.getAttribute('data-' + key) || '';
          if (rowVal !== filterVal) return false;
        }
        if (values.search) {
          var hay = (row.getAttribute('data-search') || row.textContent).toLowerCase();
          if (hay.indexOf(values.search.toLowerCase()) === -1) return false;
        }
        return true;
      }

      function syncRows() {
        if (isQuotesTable) {
          rows = Array.prototype.slice.call(tbody.querySelectorAll('tr[data-quote-id]'));
        } else {
          rows = Array.prototype.slice.call(tbody.querySelectorAll('tr[data-quote-id], tr[data-status], tr[data-customer], tr[data-rep]'));
          if (!rows.length) rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
        }
      }

      function applyFilters() {
        syncRows();
        var values = getValues();
        var visible = 0;
        rows.forEach(function (row) {
          var show = rowMatches(row, values);
          setRowVisible(row, show);
          if (show) visible++;
        });
        if (countEl) {
          countEl.textContent = visible === rows.length
            ? 'Showing all ' + rows.length + ' records'
            : 'Showing ' + visible + ' of ' + rows.length + ' records';
        }
        if (emptyEl) emptyEl.hidden = visible > 0;
        bar.classList.toggle('is-filtered', visible < rows.length);
      }

      function resetFilters() {
        bar.removeAttribute('data-filter-view');
        bar.removeAttribute('data-filter-period');
        bar.querySelectorAll('select[name]').forEach(function (sel) {
          var first = sel.querySelector('option');
          if (first) sel.value = first.value;
        });
        bar.querySelectorAll('input[name="search"]').forEach(function (inp) {
          inp.value = '';
        });
        syncRows();
        rows.forEach(function (row) { setRowVisible(row, true); });
        if (countEl) countEl.textContent = 'Showing all ' + rows.length + ' records';
        if (emptyEl) emptyEl.hidden = true;
        bar.classList.remove('is-filtered');
      }

      function applyUrlParams() {
        var applied = false;
        bar.querySelectorAll('select[name], input[name]').forEach(function (el) {
          if (urlParams.has(el.name)) {
            el.value = urlParams.get(el.name);
            applied = true;
          }
        });
        if (urlParams.get('view') === 'open') {
          bar.setAttribute('data-filter-view', 'open');
          applied = true;
        }
        if (urlParams.get('period') === 'week') {
          bar.setAttribute('data-filter-period', 'week');
          applied = true;
        }
        if (urlParams.get('search')) {
          var searchInput = bar.querySelector('input[name="search"]');
          if (searchInput) {
            searchInput.value = urlParams.get('search');
            applied = true;
          }
        }
        if (applied) applyFilters();
      }

      var applyBtn = bar.querySelector('[data-filter-apply]');
      var resetBtn = bar.querySelector('[data-filter-reset]');
      if (applyBtn) applyBtn.addEventListener('click', applyFilters);
      if (resetBtn) resetBtn.addEventListener('click', resetFilters);

      bar.querySelectorAll('select[name], input[name="search"]').forEach(function (el) {
        el.addEventListener('change', applyFilters);
        if (el.name === 'search') {
          el.addEventListener('input', applyFilters);
        }
      });

      applyUrlParams();
      global.addEventListener('awest:filter-refresh', applyFilters);
    });
  }

  /* ── Clickable drill-down rows ── */
  function initDrilldownRows() {
    document.querySelectorAll('tr[data-drill-href]:not([data-drill-wired])').forEach(function (row) {
      row.setAttribute('data-drill-wired', '1');
      row.classList.add('drill-row');
      if (!row.hasAttribute('tabindex')) row.tabIndex = 0;

      function navigate() {
        window.location.href = row.getAttribute('data-drill-href');
      }

      row.addEventListener('click', function (e) {
        if (e.target.closest('a, button')) return;
        navigate();
      });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate();
        }
      });
    });
  }

  /* ── Wizards ── */
  function initWizards() {
    document.querySelectorAll('[data-wizard]').forEach(function (wizard) {
      var steps = wizard.querySelectorAll('[data-wizard-step]');
      var panels = wizard.querySelectorAll('[data-wizard-panel]');
      if (!steps.length || !panels.length) return;

      var current = 0;

      function goTo(index) {
        current = Math.max(0, Math.min(index, panels.length - 1));
        steps.forEach(function (step, i) {
          step.classList.remove('active', 'done');
          if (i < current) step.classList.add('done');
          if (i === current) step.classList.add('active');
        });
        panels.forEach(function (panel, i) {
          panel.hidden = i !== current;
        });
      }

      steps.forEach(function (step, i) {
        step.addEventListener('click', function () {
          if (step.classList.contains('done') || step.classList.contains('active')) goTo(i);
        });
      });

      wizard.querySelectorAll('[data-wizard-next]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          goTo(current + 1);
        });
      });

      wizard.querySelectorAll('[data-wizard-back]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          goTo(current - 1);
        });
      });

      wizard.querySelectorAll('[data-wizard-goto]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          goTo(parseInt(btn.getAttribute('data-wizard-goto'), 10));
        });
      });

      goTo(0);
    });
  }

  /* ── Quote type toggle (Standard vs Spot) ── */
  function initQuoteTypeToggle() {
    var toggle = document.querySelector('[data-quote-type-toggle]');
    if (!toggle) return;

    var spotPanel = document.querySelector('[data-spot-quote-panel]');
    var standardNotes = document.querySelectorAll('[data-standard-quote-note]');

    function sync() {
      var isSpot = toggle.querySelector('input[value="spot"]:checked');
      if (spotPanel) spotPanel.hidden = !isSpot;
      standardNotes.forEach(function (el) {
        el.hidden = !!isSpot;
      });
    }

    toggle.querySelectorAll('input[type="radio"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        sync();
        document.dispatchEvent(new CustomEvent('awest:quote-type-change'));
      });
    });
    sync();
  }

  /* ── Tariff Detail — pricing model dropdowns (service + UOM) ── */
  function initTariffOverview() {
    document.querySelectorAll('[data-tariff-overview]').forEach(function (root) {
      var serviceSelect = root.querySelector('[data-service-select]');
      var uomSelect = root.querySelector('[data-uom-select]');
      var densityField = root.querySelector('[data-density-field]');
      var baseRateField = root.querySelector('[data-base-rate-field]');
      var laneField = root.querySelector('[data-lane-field]');
      var marginField = root.querySelector('[data-margin-field]');
      if (!serviceSelect || !uomSelect) return;

      var servicePresets = (function () {
        var D = global.AwestDummyTariff;
        return D && D.overviewPresets ? D.overviewPresets : {
          b2b: { amount: 44, lane: 'National B2B Matrix', margin: 15, density: 8.5 },
          threshold: { amount: 40, lane: 'Home Delivery Threshold Matrix', margin: 12, density: 7.0 },
          'wg-no-insp': { amount: 48, lane: 'White Glove — No Inspection', margin: 15, density: 8.5 },
          'wg-insp': { amount: 52, lane: 'National B2B Matrix', margin: 15, density: 8.5 }
        };
      })();

      var baseRateLabel = root.querySelector('[data-base-rate-label]');

      function syncBaseRateLabel() {
        if (!baseRateLabel) return;
        var NF = global.AwestNumericFields;
        var uom = uomSelect.value;
        baseRateLabel.textContent = NF ? NF.baseRateLabelForUom(uom) : ('Base rate (' + uom + ')');
      }

      function syncDensityVisibility() {
        var uom = uomSelect.value;
        var showDensity = uom === 'cwt' || uom === 'cube';
        if (densityField) densityField.hidden = !showDensity;
        syncBaseRateLabel();
      }

      function applyServicePreset() {
        if (root.getAttribute('data-tariff-store-hydrated') === '1') return;
        var service = serviceSelect.value;
        var uom = uomSelect.value;
        var preset = servicePresets[service] || servicePresets['wg-insp'];
        syncDensityVisibility();
        if (baseRateField) baseRateField.value = String(preset.amount);
        if (laneField) laneField.value = preset.lane;
        if (marginField) marginField.value = String(preset.margin);
        var densityInput = root.querySelector('[data-density-input]');
        if (densityInput && (uom === 'cwt' || uom === 'cube')) {
          densityInput.value = String(preset.density);
        }
      }

      function commitTariffOverview() {
        document.dispatchEvent(new CustomEvent('awest:tariff-overview-change'));
      }

      serviceSelect.addEventListener('change', function () {
        root.removeAttribute('data-tariff-store-hydrated');
        applyServicePreset();
        commitTariffOverview();
      });
      uomSelect.addEventListener('change', function () {
        syncDensityVisibility();
        commitTariffOverview();
      });
      syncDensityVisibility();
    });
  }

  /* ── Tariff configurator — pricing model presets (align with Tariff Detail) ── */
  function initTariffWizardPricing() {
    var serviceSelect = document.getElementById('tw-service');
    if (!serviceSelect || serviceSelect._twPricingWired) return;
    serviceSelect._twPricingWired = true;

    var baseInput = document.getElementById('tw-base');
    var rateTableInput = document.getElementById('tw-rate-table');
    var marginInput = document.getElementById('tw-floor');
    var densityInput = document.getElementById('tw-density');

    var D = global.AwestDummyTariff;
    var servicePresets = D && D.overviewPresets ? D.overviewPresets : {
      b2b: { amount: 44, lane: 'National B2B Matrix', margin: 15, density: 8.5 },
      threshold: { amount: 40, lane: 'Home Delivery Threshold Matrix', margin: 12, density: 7.0 },
      'wg-no-insp': { amount: 48, lane: 'White Glove — No Inspection', margin: 15, density: 8.5 },
      'wg-insp': { amount: 52, lane: 'National B2B Matrix', margin: 15, density: 8.5 }
    };

    function applyServicePreset() {
      var preset = servicePresets[serviceSelect.value] || servicePresets.b2b;
      if (baseInput && baseInput.dataset.userEdited !== '1') baseInput.value = String(preset.amount);
      if (rateTableInput) rateTableInput.value = preset.lane;
      if (marginInput) marginInput.value = String(preset.margin);
      if (densityInput) densityInput.value = String(preset.density);
    }

    if (baseInput) {
      baseInput.addEventListener('input', function () {
        baseInput.dataset.userEdited = '1';
      });
    }
    serviceSelect.addEventListener('change', applyServicePreset);
    applyServicePreset();
  }

  /* ── UOM → density field visibility (wizard + other forms) ── */
  function initUomDensity() {
    var uomSelect = document.getElementById('tw-uom');
    if (uomSelect && !uomSelect._uomWired) {
      uomSelect._uomWired = true;
      var pricingSection = document.getElementById('tw-pricing-model');
      var densityField = pricingSection && pricingSection.querySelector('[data-density-field]');
      var baseLabel = document.querySelector('[data-tw-base-label]');
      function syncWizard() {
        var val = uomSelect.value;
        var showDensity = val === 'cwt' || val === 'cube';
        if (densityField) densityField.hidden = !showDensity;
        pricingSection.querySelectorAll('[data-uom-field]').forEach(function (wrap) {
          var show = wrap.getAttribute('data-uom-field') === val;
          wrap.hidden = !show;
          wrap.querySelectorAll('input, select, textarea').forEach(function (inp) {
            inp.disabled = !show;
          });
        });
        if (baseLabel && global.AwestNumericFields) {
          baseLabel.textContent = global.AwestNumericFields.baseRateLabelForUom(val);
        }
      }
      uomSelect.addEventListener('change', syncWizard);
      syncWizard();
    }

    document.querySelectorAll('[data-uom-group]').forEach(function (group) {
      if (group.closest('[data-tariff-overview]')) return;
      var densityField = group.parentElement.querySelector('[data-density-field]')
        || document.querySelector(group.getAttribute('data-density-target'));
      if (!densityField) return;

      function sync() {
        var checked = group.querySelector('input[type="radio"]:checked');
        var val = checked ? checked.value : '';
        var show = val === 'cwt' || val === 'cube';
        densityField.hidden = !show;
      }

      group.querySelectorAll('input[type="radio"]').forEach(function (radio) {
        radio.addEventListener('change', sync);
      });
      sync();
    });
  }

  /* ── Shipment Configurator (shared drawer / modal) ── */
  function initShipmentConfigurator() {
    var openBtns = document.querySelectorAll('[data-shipment-configurator-open]');
    if (!openBtns.length) return;

    var veil = document.createElement('div');
    veil.className = 'shipment-config-veil';
    veil.setAttribute('aria-hidden', 'true');

    var panel = document.createElement('div');
    panel.className = 'shipment-config-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'shipment-config-title');

    panel.innerHTML =
      '<div class="shipment-config-head">' +
        '<div><h2 id="shipment-config-title">Configure Your Shipment</h2>' +
        '<p class="shipment-config-totals" id="shipment-config-totals">0 items · <strong>0.0</strong> cu ft · <strong>—</strong> lbs</p></div>' +
        '<button type="button" class="btn btn-secondary btn-sm" id="shipment-config-close" aria-label="Close">✕</button>' +
      '</div>' +
      '<div class="shipment-config-body">' +
        '<p class="shipment-config-constant">Cubic feet = Length × Width × Height ÷ 1,728 (fixed conversion)</p>' +
        '<div style="overflow-x:auto"><table class="shipment-item-table"><thead><tr>' +
          '<th class="col-num">#</th><th class="col-dim">L (in)</th><th class="col-dim">W (in)</th><th class="col-dim">H (in)</th>' +
          '<th class="col-cuft">Cu ft</th><th class="col-qty">Qty</th><th class="col-wt">Wt</th><th class="col-desc">Description</th><th class="col-remove"></th>' +
        '</tr></thead><tbody id="shipment-config-rows"></tbody></table></div>' +
        '<button type="button" class="btn btn-secondary btn-sm" id="shipment-config-add" style="margin-top:var(--space-sm)">+ Add Item</button>' +
      '</div>' +
      '<div class="shipment-config-foot">' +
        '<div class="shipment-config-summary" id="shipment-config-summary">Total: <strong>0</strong> items · <strong>0.0</strong> cu ft · <strong>—</strong> lbs</div>' +
        '<div class="shipment-config-actions">' +
          '<button type="button" class="btn btn-secondary" id="shipment-config-cancel">Cancel</button>' +
          '<button type="button" class="btn btn-primary" id="shipment-config-apply">Apply to Quote</button>' +
        '</div>' +
      '</div>';

    veil.appendChild(panel);
    document.body.appendChild(veil);

    var rowsEl = panel.querySelector('#shipment-config-rows');
    var totalsEl = panel.querySelector('#shipment-config-totals');
    var summaryEl = panel.querySelector('#shipment-config-summary');
    var cubeTarget = null;
    var weightTarget = null;
    var rowId = 0;

    function defaultShell() {
      return document.querySelector('.customer-portal') ? 'modal' : 'drawer';
    }

    function calcCuFt(l, w, h) {
      var li = parseFloat(l) || 0;
      var wi = parseFloat(w) || 0;
      var hi = parseFloat(h) || 0;
      return (li * wi * hi) / 1728;
    }

    function updateTotals() {
      var totalItems = 0;
      var totalCuFt = 0;
      var totalWeight = 0;
      var hasLineWeight = false;

      rowsEl.querySelectorAll('tr').forEach(function (row) {
        var qty = parseInt(row.querySelector('[data-field="qty"]').value, 10) || 1;
        var cuFt = parseFloat(row.querySelector('[data-field="cuft"]').textContent) || 0;
        var wt = parseFloat(row.querySelector('[data-field="weight"]').value);
        totalItems += qty;
        totalCuFt += cuFt * qty;
        if (!isNaN(wt) && row.querySelector('[data-field="weight"]').value !== '') {
          hasLineWeight = true;
          totalWeight += wt * qty;
        }
      });

      var cuFtStr = totalCuFt.toFixed(1);
      var wtStr = hasLineWeight ? Math.round(totalWeight).toLocaleString() : '—';
      totalsEl.innerHTML = totalItems + ' items · <strong>' + cuFtStr + '</strong> cu ft · <strong>' + wtStr + '</strong> lbs';
      summaryEl.innerHTML = 'Total: <strong>' + totalItems + '</strong> items · <strong>' + cuFtStr + '</strong> cu ft · <strong>' + wtStr + '</strong> lbs';
    }

    function bindRow(row) {
      ['length', 'width', 'height', 'qty', 'weight'].forEach(function (field) {
        var input = row.querySelector('[data-field="' + field + '"]');
        if (!input) return;
        input.addEventListener('input', function () {
          if (field === 'length' || field === 'width' || field === 'height') {
            var l = row.querySelector('[data-field="length"]').value;
            var w = row.querySelector('[data-field="width"]').value;
            var h = row.querySelector('[data-field="height"]').value;
            row.querySelector('[data-field="cuft"]').textContent = calcCuFt(l, w, h).toFixed(2);
          }
          updateTotals();
        });
      });

      row.querySelector('[data-remove-row]').addEventListener('click', function () {
        if (rowsEl.querySelectorAll('tr').length > 1) {
          row.remove();
          renumberRows();
          updateTotals();
        }
      });
    }

    function renumberRows() {
      rowsEl.querySelectorAll('tr').forEach(function (row, i) {
        row.querySelector('.col-num').textContent = String(i + 1);
      });
    }

    function addRow(data) {
      data = data || {};
      rowId++;
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="col-num"></td>' +
        '<td><input type="number" data-field="length" min="0" step="0.1" value="' + (data.length || '') + '"></td>' +
        '<td><input type="number" data-field="width" min="0" step="0.1" value="' + (data.width || '') + '"></td>' +
        '<td><input type="number" data-field="height" min="0" step="0.1" value="' + (data.height || '') + '"></td>' +
        '<td><span class="cuft-readonly" data-field="cuft">' + (data.cuft || '0.00') + '</span></td>' +
        '<td><input type="number" data-field="qty" min="1" step="1" value="' + (data.qty || '1') + '"></td>' +
        '<td><input type="number" data-field="weight" min="0" step="1" value="' + (data.weight || '') + '" placeholder="—"></td>' +
        '<td><input type="text" data-field="desc" value="' + (data.desc || '') + '" placeholder="e.g. Sofa"></td>' +
        '<td class="col-remove"><button type="button" class="btn-icon-remove" data-remove-row aria-label="Remove row">🗑</button></td>';
      rowsEl.appendChild(tr);
      bindRow(tr);
      renumberRows();
      updateTotals();
    }

    function openConfigurator(btn) {
      var shell = btn.getAttribute('data-shipment-shell') || defaultShell();
      panel.setAttribute('data-shell', shell);
      cubeTarget = document.querySelector(btn.getAttribute('data-shipment-cube') || '[data-shipment-cube]');
      weightTarget = document.querySelector(btn.getAttribute('data-shipment-weight') || '[data-shipment-weight]');

      rowsEl.innerHTML = '';
      if (cubeTarget && cubeTarget.value) {
        addRow({ desc: 'Existing shipment estimate' });
      } else {
        addRow({ length: '84', width: '36', height: '38', desc: 'Sofa' });
        addRow({ length: '60', width: '42', height: '30', desc: 'Dining Table' });
      }

      veil.classList.add('is-open');
      veil.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      panel.querySelector('#shipment-config-apply').focus();
    }

    function closeConfigurator() {
      veil.classList.remove('is-open');
      veil.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    function applyConfigurator() {
      var totalCuFt = 0;
      var totalWeight = 0;
      var hasLineWeight = false;
      rowsEl.querySelectorAll('tr').forEach(function (row) {
        var qty = parseInt(row.querySelector('[data-field="qty"]').value, 10) || 1;
        var cuFt = parseFloat(row.querySelector('[data-field="cuft"]').textContent) || 0;
        var wt = parseFloat(row.querySelector('[data-field="weight"]').value);
        totalCuFt += cuFt * qty;
        if (!isNaN(wt) && row.querySelector('[data-field="weight"]').value !== '') {
          hasLineWeight = true;
          totalWeight += wt * qty;
        }
      });

      if (cubeTarget) {
        cubeTarget.value = Math.round(totalCuFt).toLocaleString();
        cubeTarget.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (weightTarget && hasLineWeight) {
        weightTarget.value = Math.round(totalWeight).toLocaleString();
        weightTarget.dispatchEvent(new Event('input', { bubbles: true }));
      }
      closeConfigurator();
    }

    openBtns.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        openConfigurator(btn);
      });
    });

    panel.querySelector('#shipment-config-close').addEventListener('click', closeConfigurator);
    panel.querySelector('#shipment-config-cancel').addEventListener('click', closeConfigurator);
    panel.querySelector('#shipment-config-apply').addEventListener('click', applyConfigurator);
    panel.querySelector('#shipment-config-add').addEventListener('click', function () { addRow(); });
    veil.addEventListener('click', function (e) { if (e.target === veil) closeConfigurator(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && veil.classList.contains('is-open')) closeConfigurator();
    });
  }

  /* ── Pricing breakdown drawer (quote detail) ── */
  function initPricingBreakdownDrawer() {
    var openBtn = document.querySelector('[data-pricing-breakdown-open]');
    var veil = document.getElementById('pricing-breakdown-veil');
    if (!openBtn || !veil) return;

    var closeBtn = veil.querySelector('[data-pricing-breakdown-close]');

    function openDrawer() {
      veil.classList.add('is-open');
      veil.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      if (closeBtn) closeBtn.focus();
    }

    function closeDrawer() {
      veil.classList.remove('is-open');
      veil.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      openBtn.focus();
    }

    openBtn.addEventListener('click', openDrawer);
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
    veil.addEventListener('click', function (e) {
      if (e.target === veil) closeDrawer();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && veil.classList.contains('is-open')) closeDrawer();
    });
  }

  /* ── Call-for-Quote lane demo (?cfq=1) ── */
  function initCallForQuoteMode() {
    var panel = document.querySelector('[data-cfq-panel]');
    if (!panel) return;

    var params = getUrlParams();
    var isCfq = params.get('cfq') === '1';
    var laneNote = document.querySelector('[data-standard-lane-note]');
    var autoPricing = document.querySelectorAll('[data-auto-pricing]');
    var cfqManual = document.querySelectorAll('[data-cfq-manual]');

    function sync() {
      panel.hidden = !isCfq;
      if (laneNote) laneNote.hidden = isCfq;
      autoPricing.forEach(function (el) { el.hidden = isCfq; });
      cfqManual.forEach(function (el) { el.hidden = !isCfq; });
    }

    sync();
  }

  /* ── Cube threshold inline notice ── */
  function initCubeThresholdNotice() {
    var cubeInput = document.querySelector('[data-shipment-cube]');
    var notice = document.querySelector('[data-cube-threshold-notice]');
    if (!cubeInput || !notice) return;

    function sync() {
      var val = parseInt(String(cubeInput.value).replace(/,/g, ''), 10) || 0;
      notice.hidden = val < 1400;
    }

    cubeInput.addEventListener('input', sync);
    sync();
  }

  /* ── High-value declared value notice ── */
  function initHighValueNotice() {
    var valueInput = document.querySelector('[data-declared-value]');
    var notice = document.querySelector('[data-high-value-notice]');
    if (!valueInput || !notice) return;

    function sync() {
      var val = parseInt(String(valueInput.value).replace(/[$,]/g, ''), 10) || 0;
      notice.hidden = val < 25000;
    }

    valueInput.addEventListener('input', sync);
    sync();
  }

  /* ── Tariff template toggle ── */
  function initTariffTemplateToggle() {
    var toggle = document.querySelector('[data-template-toggle]');
    var picker = document.querySelector('[data-template-picker]');
    if (!toggle || !picker) return;

    toggle.addEventListener('change', function () {
      picker.hidden = !toggle.checked;
    });

    picker.querySelectorAll('.template-option').forEach(function (opt) {
      opt.addEventListener('click', function () {
        picker.querySelectorAll('.template-option').forEach(function (o) { o.classList.remove('selected'); });
        opt.classList.add('selected');
      });
    });
  }

  /* ── Tariff configurator — dynamic origin stations ── */
  function initTariffConfigurator() {
    var root = document.querySelector('[data-tariff-configurator]');
    if (!root) return;
    var list = root.querySelector('[data-wizard-origin-list]');
    var pick = root.querySelector('[data-wizard-origin-pick]');
    var addBtn = root.querySelector('[data-wizard-add-origin]');
    var emptyEl = root.querySelector('[data-wizard-origin-empty]');
    if (!list || !pick || !addBtn) return;

    function availableOrigins() {
      var store = global.AwestStore;
      var lists = store && store.getState().validationLists;
      var TE = global.AwestTariffEngine;
      if (lists && lists.origins && lists.origins.length) return lists.origins.slice();
      return TE ? TE.AW_ORIGINS.slice() : ['LAX', 'SFO', 'DFW', 'EWR', 'TMV', 'PHX', 'ATL'];
    }

    function addedCodes() {
      return Array.prototype.map.call(
        list.querySelectorAll('.origin-station-row[data-origin-code]'),
        function (row) { return row.getAttribute('data-origin-code'); }
      );
    }

    function syncEmpty() {
      var has = list.querySelector('.origin-station-row[data-origin-code]');
      if (emptyEl) emptyEl.hidden = !!has;
    }

    function refreshPick() {
      var added = addedCodes();
      var origins = availableOrigins().filter(function (o) { return added.indexOf(o) === -1; });
      pick.innerHTML = origins.length
        ? origins.map(function (o) { return '<option value="' + o + '">' + o + '</option>'; }).join('')
        : '<option value="">No stations available</option>';
      addBtn.disabled = !origins.length;
    }

    function refreshTariffConfiguratorPick() {
      refreshPick();
      syncEmpty();
    }

    function createOriginRow(code, opts) {
      opts = opts || {};
      var cell = opts.b2b || opts.wgi || {};
      var densityInput = document.getElementById('tw-density');
      var defaultDensity = densityInput ? parseFloat(densityInput.value) : 8.5;
      var density = cell.density != null ? cell.density : (isNaN(defaultDensity) ? 8.5 : defaultDensity);
      var minAdj = cell.minAdjPct != null ? cell.minAdjPct : 0;
      var lhAdj = cell.linehaulAdjPct != null ? cell.linehaulAdjPct : 0;
      var row = document.createElement('div');
      row.className = 'origin-station-row';
      row.setAttribute('data-origin-code', code);
      row.innerHTML =
        '<div class="origin-station-head">' +
          '<span class="origin-station-code">' + code + '</span>' +
          '<button type="button" class="btn btn-secondary btn-sm" data-wizard-remove-origin aria-label="Remove ' + code + '">Remove</button>' +
        '</div>' +
        '<div class="origin-station-detail">' +
          '<div class="field"><label>Density factor</label>' +
            '<input type="number" class="tabular" step="0.1" min="0" value="' + density + '"></div>' +
          '<div class="field"><label>Min charge adj. %</label>' +
            '<input type="number" class="tabular" data-rate-adj-input step="0.1" value="' + minAdj + '" list="aw-rate-adj-presets"></div>' +
          '<div class="field"><label>Linehaul adj. %</label>' +
            '<input type="number" class="tabular" data-rate-adj-input step="0.1" value="' + lhAdj + '" list="aw-rate-adj-presets"></div>' +
        '</div>';
      row.querySelector('[data-wizard-remove-origin]').addEventListener('click', function () {
        row.remove();
        refreshPick();
        syncEmpty();
      });
      list.appendChild(row);
      syncEmpty();
      refreshPick();
    }

    function seedOrigins(originGrid) {
      list.querySelectorAll('.origin-station-row[data-origin-code]').forEach(function (r) { r.remove(); });
      if (originGrid) {
        Object.keys(originGrid).forEach(function (code) {
          if (originGrid[code].enabled === false) return;
          createOriginRow(code, originGrid[code]);
        });
      }
      refreshPick();
      syncEmpty();
    }

    if (!addBtn._wizardOriginWired) {
      addBtn._wizardOriginWired = true;
      addBtn.addEventListener('click', function () {
        var code = pick.value;
        if (!code || addedCodes().indexOf(code) >= 0) return;
        createOriginRow(code, {});
      });
    }

    refreshPick();
    syncEmpty();

    global.AwestMockup = global.AwestMockup || {};
    global.AwestMockup.seedTariffConfiguratorOrigins = seedOrigins;
    global.AwestMockup.refreshTariffConfiguratorPick = refreshTariffConfiguratorPick;
    global.AwestMockup.initDrilldownRows = initDrilldownRows;

    global.addEventListener('awest:change', refreshTariffConfiguratorPick);

    try {
      var cloneId = new URLSearchParams(location.search).get('clone');
      if (cloneId && global.AwestStore) {
        var src = global.AwestStore.getTariff(cloneId);
        if (src && src.config && src.config.originGrid) seedOrigins(src.config.originGrid);
      }
    } catch (e) { /* ignore */ }
  }

  /* ── Origin station include toggles ── */
  function initOriginStationToggles() {
    document.querySelectorAll('[data-station-include]').forEach(function (toggle) {
      var row = toggle.closest('.origin-station-row');
      var detail = row ? row.querySelector('.origin-station-detail') : null;
      if (!detail) return;

      function sync() {
        var on = toggle.value === 'yes' && toggle.checked;
        if (toggle.type === 'radio') {
          on = row.querySelector('[data-station-include][value="yes"]:checked') !== null;
        }
        detail.hidden = !on;
      }

      if (toggle.type === 'radio') {
        row.querySelectorAll('[data-station-include]').forEach(function (r) {
          r.addEventListener('change', sync);
        });
      } else {
        toggle.addEventListener('change', sync);
      }
      sync();
    });
  }

  /* ── Stepped selector → freeform numeric (rates / adjustments) ── */
  function initSteppedSelectors() {
    var RATE_ADJ_PRESETS = [-15, -10, -5, 0, 5, 10, 15];
    if (!document.getElementById('aw-rate-adj-presets')) {
      var dl = document.createElement('datalist');
      dl.id = 'aw-rate-adj-presets';
      RATE_ADJ_PRESETS.forEach(function (v) {
        var opt = document.createElement('option');
        opt.value = String(v);
        dl.appendChild(opt);
      });
      document.body.appendChild(dl);
    }

    document.querySelectorAll('[data-stepped-select]').forEach(function (sel) {
      var field = sel.closest('.field') || sel.parentElement;
      if (!field) return;
      var custom = field.querySelector('[data-stepped-custom]');
      var raw = sel.value === 'other' && custom && custom.value ? custom.value : sel.value;
      raw = String(raw || '0').replace(/^\+/, '');
      var input = document.createElement('input');
      input.type = 'number';
      input.step = '0.1';
      input.className = sel.className.replace(/\bbtn-sm\b/g, '').trim() || 'tabular';
      if (!input.className) input.className = 'tabular';
      input.setAttribute('list', 'aw-rate-adj-presets');
      input.setAttribute('data-rate-adj-input', '');
      input.title = 'Suggested steps — type any adjustment %';
      input.value = raw;
      sel.replaceWith(input);
      if (custom) custom.remove();
      field.classList.remove('stepped-select');
    });
  }

  /* ── Tariff detail — version history accordion hash deep-links ── */
  function initTariffHistoryAccordion() {
    var accordion = document.querySelector('[data-tariff-history-accordion]');
    if (!accordion) return;

    function openForHash(rawHash) {
      var hash = (rawHash || '').replace(/^#/, '').toLowerCase();
      if (!hash) return;
      if (hash === 'panel-history' || hash === 'versions' || hash === 'audit' ||
          hash === 'panel-versions' || hash === 'panel-audit') {
        accordion.open = true;
        var target = hash === 'versions' || hash === 'panel-versions'
          ? document.getElementById('panel-versions')
          : (hash === 'audit' || hash === 'panel-audit'
            ? document.getElementById('panel-audit')
            : accordion);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    openForHash(window.location.hash);
    window.addEventListener('hashchange', function () {
      openForHash(window.location.hash);
    });
  }

  /* ── CSS tabs: hash deep-linking (e.g. tariff-detail.html#versions) ── */
  function initTabs() {
    document.querySelectorAll('.tabs-wrap').forEach(function (wrap) {
      var radios = Array.prototype.slice.call(wrap.querySelectorAll('input.tab-radio'));
      if (!radios.length) return;

      function hashFor(radio) {
        return radio.getAttribute('data-tab-hash') || radio.id;
      }

      function radioForHash(rawHash) {
        var hash = (rawHash || '').replace(/^#/, '').toLowerCase();
        if (!hash) return null;
        for (var i = 0; i < radios.length; i++) {
          var radio = radios[i];
          if (hashFor(radio).toLowerCase() === hash || radio.id.toLowerCase() === hash) {
            return radio;
          }
        }
        return null;
      }

      function activate(radio, updateHash) {
        if (!radio) return;
        radio.checked = true;
        if (updateHash === false) return;
        var nextHash = hashFor(radio);
        if (nextHash && window.location.hash.replace(/^#/, '') !== nextHash) {
          history.replaceState(null, '', '#' + nextHash);
        }
      }

      var fromHash = radioForHash(window.location.hash);
      if (fromHash) activate(fromHash, false);

      radios.forEach(function (radio) {
        radio.addEventListener('change', function () {
          if (radio.checked) activate(radio, true);
        });
      });
    });

    window.addEventListener('hashchange', function () {
      document.querySelectorAll('.tabs-wrap').forEach(function (wrap) {
        var radios = Array.prototype.slice.call(wrap.querySelectorAll('input.tab-radio'));
        if (!radios.length) return;
        var hash = window.location.hash.replace(/^#/, '').toLowerCase();
        if (!hash) return;
        for (var i = 0; i < radios.length; i++) {
          var radio = radios[i];
          var tabHash = (radio.getAttribute('data-tab-hash') || radio.id).toLowerCase();
          if (tabHash === hash || radio.id.toLowerCase() === hash) {
            radio.checked = true;
            break;
          }
        }
      });
    });
  }

  /* ── Help center search filter ── */
  function initHelpSearch() {
    var input = document.getElementById('help-search');
    var section = document.getElementById('common-terms');
    if (!input || !section) return;

    input.addEventListener('input', function () {
      var q = input.value.toLowerCase().trim();
      section.querySelectorAll('dt').forEach(function (dt) {
        var dd = dt.nextElementSibling;
        var text = (dt.textContent + ' ' + (dd ? dd.textContent : '')).toLowerCase();
        var show = !q || text.indexOf(q) !== -1;
        dt.hidden = !show;
        if (dd) dd.hidden = !show;
      });
    });
  }

  /* ── Tariff rate table matrix (28 origin × service-type tabs) ── */
  function initRateMatrix() {
    var picker = document.getElementById('rate-matrix-picker');
    var tbody = document.getElementById('rate-matrix-body');
    var thead = document.getElementById('rate-matrix-thead');
    if (!picker || !tbody) return;

    var origins = [
      { code: 'lax', label: 'LAX', factor: 1.0, enabled: true },
      { code: 'dfw', label: 'DFW', factor: 0.96, enabled: true },
      { code: 'tmv', label: 'TMV', factor: 0.95, enabled: true },
      { code: 'phx', label: 'PHX', factor: 0.97, enabled: true },
      { code: 'sfo', label: 'SFO', factor: 1.02, enabled: true },
      { code: 'atl', label: 'ATL', factor: 0.94, enabled: true },
      { code: 'ewr', label: 'EWR', factor: 1.05, enabled: true }
    ];
    var rmUi = (global.AwestDummyTariff && global.AwestDummyTariff.rateMatrixUi) || {};
    var services = [
      { prefix: 'b2b', label: 'B2B', zoneDigits: 3, uom: 'CWT', rateBase: (rmUi.b2b && rmUi.b2b.rateBase) || 44, rateStep: (rmUi.b2b && rmUi.b2b.rateStep) || 1.1, suffix: '' },
      { prefix: 'thr', label: 'Threshold', zoneDigits: 5, uom: '$/cf', rateBase: (rmUi.threshold && rmUi.threshold.rateBase) || 7.7, rateStep: (rmUi.threshold && rmUi.threshold.rateStep) || 0.11, suffix: '/cf' },
      { prefix: 'wgni', label: 'WG No Insp.', zoneDigits: 3, uom: 'CWT', rateBase: (rmUi.wgni && rmUi.wgni.rateBase) || 48, rateStep: (rmUi.wgni && rmUi.wgni.rateStep) || 1.1, suffix: '' },
      { prefix: 'wgi', label: 'WG Inspection', zoneDigits: 3, uom: 'CWT', rateBase: (rmUi.wgi && rmUi.wgi.rateBase) || 52, rateStep: (rmUi.wgi && rmUi.wgi.rateStep) || 1.1, suffix: '' }
    ];
    var breaks = [
      { label: '1–125 lbs', weight: 1.0 },
      { label: '126–250 lbs', weight: 0.97 },
      { label: '251–500 lbs', weight: 0.94 },
      { label: '501–1,000 lbs', weight: 0.91 },
      { label: '1,001–2,000 lbs', weight: 0.88 },
      { label: '2,001–5,000 lbs', weight: 0.85 },
      { label: '5,000+ CFQ', weight: 0.0 }
    ];

    var originZones = {
      lax: [
        { zone: '900', desc: 'Los Angeles metro' },
        { zone: '902', desc: 'Inglewood / South Bay' },
        { zone: '905', desc: 'Torrance corridor' },
        { zone: '910', desc: 'Pasadena / San Gabriel' },
        { zone: '913', desc: 'San Fernando Valley' },
        { zone: '920', desc: 'San Diego north' },
        { zone: '921', desc: 'San Diego central' },
        { zone: '925', desc: 'Inland Empire west' }
      ],
      sfo: [
        { zone: '940', desc: 'San Francisco peninsula' },
        { zone: '941', desc: 'San Francisco city' },
        { zone: '943', desc: 'Palo Alto / Stanford' },
        { zone: '945', desc: 'East Bay — Oakland' },
        { zone: '951', desc: 'San Jose metro' },
        { zone: '954', desc: 'Santa Rosa north bay' }
      ],
      dfw: [
        { zone: '750', desc: 'Dallas metro core' },
        { zone: '752', desc: 'Dallas east' },
        { zone: '761', desc: 'Fort Worth' },
        { zone: '770', desc: 'Houston overlap lane' },
        { zone: '787', desc: 'Austin feeder' }
      ],
      tmv: [
        { zone: '272', desc: 'High Point / Thomasville NC' },
        { zone: '293', desc: 'SC upstate (293/296/297)' },
        { zone: '296', desc: 'Greenville metro' },
        { zone: '297', desc: 'Rock Hill corridor' },
        { zone: '282', desc: 'Charlotte feeder' }
      ],
      phx: [
        { zone: '850', desc: 'Phoenix metro' },
        { zone: '852', desc: 'East Valley' },
        { zone: '853', desc: 'West Valley' },
        { zone: '857', desc: 'Tucson corridor' }
      ],
      atl: [
        { zone: '303', desc: 'Atlanta metro' },
        { zone: '300', desc: 'Alpharetta / north' },
        { zone: '301', desc: 'Marietta / west' },
        { zone: '306', desc: 'Athens feeder' },
        { zone: '314', desc: 'Savannah coastal' }
      ],
      ewr: [
        { zone: '070', desc: 'Newark metro' },
        { zone: '071', desc: 'Jersey City' },
        { zone: '100', desc: 'Manhattan cross-dock' }
      ]
    };

    var combinations = [];
    origins.forEach(function (origin) {
      services.forEach(function (service) {
        var id = service.prefix + '_' + origin.code;
        var zones = originZones[origin.code] || [];
        var enabled = origin.enabled && !(origin.code === 'ewr' && service.prefix === 'thr');
        combinations.push({
          id: id,
          origin: origin,
          service: service,
          enabled: enabled,
          configured: enabled && hashCode(id) % 5 !== 0
        });
      });
    });

    var activeId = 'wgi_lax';
    var tariffId = (function () {
      try {
        var q = new URLSearchParams(location.search);
        return q.get('id') || q.get('tariff') || 'TAR-B2B-BASE';
      } catch (e) {
        return 'TAR-B2B-BASE';
      }
    })();

    combinations.forEach(function (combo) {
      var store = global.AwestStore;
      if (!store) return;
      var saved = store.getRateMatrix(tariffId, combo.id);
      if (saved && saved.rows && saved.rows.length) combo.configured = true;
    });

    function hashCode(str) {
      var h = 0;
      for (var i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
      }
      return Math.abs(h);
    }

    function formatRate(value, service) {
      if (service.uom === '$/cf') return '$' + value.toFixed(2) + service.suffix;
      return '$' + value.toFixed(2);
    }

    function computeRate(combo, rowIndex, breakIndex) {
      var s = combo.service;
      var o = combo.origin;
      var seed = hashCode(combo.id + '-' + rowIndex + '-' + breakIndex);
      var jitter = (seed % 17) / 100;
      var rowAdj = rowIndex * s.rateStep * 0.35;
      var breakMult = breaks[breakIndex].weight;
      var val = (s.rateBase + rowAdj + jitter) * o.factor * breakMult;
      if (s.prefix === 'wgi') val *= 1.04;
      if (s.prefix === 'wgni') val *= 0.97;
      return val;
    }

    function getMatrixRows(combo) {
      if (!combo.enabled) return [];
      var store = global.AwestStore;
      if (store) {
        var saved = store.getRateMatrix(tariffId, combo.id);
        if (saved && saved.rows && saved.rows.length) {
          combo.configured = true;
          return saved.rows.map(function (row) {
            return {
              zone: row.zone,
              desc: row.description,
              rates: row.rates.slice()
            };
          });
        }
      }
      var zones = originZones[combo.origin.code] || [];
      if (!combo.configured) return [];
      return zones.map(function (z, ri) {
        var zoneDisplay = combo.service.zoneDigits === 5
          ? z.zone + String((ri % 9) + 1).padStart(2, '0')
          : z.zone;
        return {
          zone: zoneDisplay,
          desc: z.desc,
          rates: breaks.map(function (_, bi) {
            return computeRate(combo, ri, bi);
          })
        };
      });
    }

    function comboIdFromParts(servicePrefix, originCode) {
      return servicePrefix + '_' + originCode;
    }

    function setActiveFromDropdowns() {
      var originSel = document.getElementById('rate-matrix-origin');
      var serviceSel = document.getElementById('rate-matrix-service');
      if (!originSel || !serviceSel) return;
      activeId = comboIdFromParts(serviceSel.value, originSel.value);
    }

    function renderPicker() {
      var originSel = document.getElementById('rate-matrix-origin');
      var serviceSel = document.getElementById('rate-matrix-service');
      if (!originSel || !serviceSel) return;

      if (!originSel.options.length) {
        combinations.forEach(function (combo) {
          if (originSel.querySelector('option[value="' + combo.origin.code + '"]')) return;
          var opt = document.createElement('option');
          opt.value = combo.origin.code;
          opt.textContent = combo.origin.label;
          originSel.appendChild(opt);
        });
        combinations.forEach(function (combo) {
          if (serviceSel.querySelector('option[value="' + combo.service.prefix + '"]')) return;
          var opt = document.createElement('option');
          opt.value = combo.service.prefix;
          opt.textContent = combo.service.label;
          serviceSel.appendChild(opt);
        });
        originSel.addEventListener('change', function () {
          setActiveFromDropdowns();
          renderMatrix();
        });
        serviceSel.addEventListener('change', function () {
          setActiveFromDropdowns();
          renderMatrix();
        });
      }

      var parts = activeId.split('_');
      var originCode = parts[parts.length - 1];
      var servicePrefix = parts.slice(0, -1).join('_');
      originSel.value = originCode;
      serviceSel.value = servicePrefix;
    }

    function renderMatrix() {
      var combo = combinations.filter(function (c) { return c.id === activeId; })[0];
      if (!combo) return;

      var labelEl = document.getElementById('rate-matrix-label');
      var zoneEl = document.getElementById('rate-matrix-zone-type');
      var tabEl = document.getElementById('rate-matrix-tab-id');
      var breakEl = document.getElementById('rate-matrix-break-axis');
      var rowCountEl = document.getElementById('rate-matrix-row-count');
      var statusEl = document.getElementById('rate-matrix-status');

      if (labelEl) {
        labelEl.textContent = combo.service.label + ' · ' + combo.origin.label;
      }
      if (zoneEl) {
        zoneEl.textContent = combo.service.zoneDigits + '-digit ZIP (' + combo.service.label + ')';
      }
      if (tabEl) tabEl.textContent = combo.id;
      if (breakEl) {
        breakEl.textContent = combo.service.prefix === 'thr'
          ? 'Cube breaks (cf) · BPPC $/cf'
          : 'Cube breaks (cf) · ' + combo.service.uom + ' per unit';
      }

      if (thead) {
        var headerCells = ['Base zone', 'Lane / description'];
        breaks.forEach(function (b) { headerCells.push(b.label); });
        thead.innerHTML = '<tr>' + headerCells.map(function (h) {
          return '<th scope="col">' + h + '</th>';
        }).join('') + '</tr>';
      }

      tbody.innerHTML = '';
      var rows = getMatrixRows(combo);

      if (!combo.enabled) {
        tbody.innerHTML = '<tr><td colspan="' + (breaks.length + 2) + '" style="padding:24px;text-align:center;color:var(--neutral-600)">' +
          '<strong>' + combo.origin.label + '</strong> is not an active origin station for this tariff — enable it in the origin-station grid before configuring <code>' + combo.id + '</code>.</td></tr>';
        if (rowCountEl) rowCountEl.textContent = '0 zones (station disabled)';
        if (statusEl) {
          var configuredCount = combinations.filter(function (c) { return c.configured; }).length;
          statusEl.textContent = configuredCount + ' of 28 matrices configured';
        }
        return;
      }

      if (!combo.configured || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="' + (breaks.length + 2) + '" style="padding:24px;text-align:center;color:var(--neutral-600)">' +
          'No rates entered for <code>' + combo.id + '</code> yet — import from CSV or copy from another origin/service combination.</td></tr>';
        if (rowCountEl) rowCountEl.textContent = '0 zones (empty matrix)';
        if (statusEl) {
          var cfg = combinations.filter(function (c) { return c.configured; }).length;
          statusEl.textContent = cfg + ' of 28 matrices configured';
        }
        return;
      }

      rows.forEach(function (row) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<th scope="row" class="tabular">' + row.zone + '</th><td>' + row.desc + '</td>';
        row.rates.forEach(function (rate, bi) {
          var td = document.createElement('td');
          var input = document.createElement('input');
          input.type = 'text';
          input.className = 'tabular';
          input.value = formatRate(rate, combo.service);
          input.setAttribute('aria-label', row.zone + ' at break ' + breaks[bi].label);
          td.appendChild(input);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });

      if (rowCountEl) rowCountEl.textContent = rows.length + ' zone' + (rows.length === 1 ? '' : 's');
      if (statusEl) {
        var configuredCount = combinations.filter(function (c) { return c.configured; }).length;
        statusEl.textContent = configuredCount + ' of 28 matrices configured';
        statusEl.className = 'badge ' + (combo.configured ? 'badge-active' : 'badge-draft');
      }

      var wrap = document.querySelector('.rate-matrix-wrap');
      if (wrap) {
        wrap.scrollTop = 0;
        wrap.scrollLeft = 0;
      }
    }

    renderPicker();
    renderMatrix();
  }

  /* ── Row action pills on data tables ── */
  function initActionPills() {
    var actionLabel = /^(Open|Edit|Compare|Clone|Disable|History|Review|Edit matrix)$/;
    document.querySelectorAll('.data-table tbody td:last-child').forEach(function (td) {
      var links = Array.prototype.slice.call(td.querySelectorAll('a[href]'));
      if (!links.length) return;
      var actionLinks = links.filter(function (a) {
        if (a.classList.contains('btn') && !a.classList.contains('action-pill')) return false;
        var text = (a.textContent || '').trim();
        return actionLabel.test(text) || /^View /.test(text);
      });
      if (!actionLinks.length) return;
      td.classList.add('actions');
      actionLinks.forEach(function (a, i) {
        if (!a.classList.contains('action-pill')) a.classList.add('action-pill');
        if (i > 0) a.classList.add('action-pill--muted');
      });
    });
  }

  ready(function () {
    initTabs();
    initTariffHistoryAccordion();
    initDropdowns();
    initFilterBars();
    initDrillBanner();
    initDrilldownRows();
    initWizards();
    initQuoteTypeToggle();
    initTariffOverview();
    initTariffWizardPricing();
    initUomDensity();
    initShipmentConfigurator();
    initPricingBreakdownDrawer();
    initCallForQuoteMode();
    initCubeThresholdNotice();
    initHighValueNotice();
    initTariffTemplateToggle();
    initTariffConfigurator();
    initOriginStationToggles();
    initSteppedSelectors();
    initActionPills();
    initHelpSearch();
    initRateMatrix();
    if (window.AwestPricingMock) {
      window.AwestPricingMock.initQuotesListEnhanced();
      window.AwestPricingMock.initQuoteBuilderPricing();
      window.AwestPricingMock.initDashboardQuickApprove();
      window.AwestPricingMock.initQuoteDetailApproval();
      window.AwestPricingMock.initQuoteDetailBreakdown();
      window.AwestPricingMock.initQuoteAssistant();
    }
  });
})();
