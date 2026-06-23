/**
 * American West mockup — shared interactive behaviors (tabs use CSS; this handles dropdowns, filters, wizards).
 */
(function () {
  'use strict';

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
    if (status === 'accepted') return 'Accepted Quotes';
    if (status === 'approved') return 'Approved Quotes';
    if (status === 'draft') return 'Draft Quotes';
    if (rep) return rep + "'s Quotes";
    if (stage) {
      var stageLabels = {
        draft: 'Draft stage',
        pending: 'Pending Approval stage',
        approved: 'Approved stage',
        sent: 'Sent stage',
        accepted: 'Accepted stage'
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

      var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
      var countEl = bar.parentElement.querySelector('[data-filter-count]');
      var emptyEl = bar.parentElement.querySelector('[data-filter-empty]');
      var urlParams = getUrlParams();

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

      function rowMatches(row, values) {
        if (values._view === 'open') {
          if (row.getAttribute('data-status') === 'lost') return false;
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

      function applyFilters() {
        var values = getValues();
        var visible = 0;
        rows.forEach(function (row) {
          var show = rowMatches(row, values);
          row.hidden = !show;
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
        rows.forEach(function (row) { row.hidden = false; });
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
    });
  }

  /* ── Clickable drill-down rows ── */
  function initDrilldownRows() {
    document.querySelectorAll('tr[data-drill-href]').forEach(function (row) {
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
      radio.addEventListener('change', sync);
    });
    sync();
  }

  /* ── Tariff Detail — Overview segmented controls (service type + UOM) ── */
  function initTariffOverview() {
    document.querySelectorAll('[data-tariff-overview]').forEach(function (root) {
      var serviceGroup = root.querySelector('[data-service-group]');
      var uomGroup = root.querySelector('[data-uom-group]');
      var densityField = root.querySelector('[data-density-field]');
      var baseRateField = root.querySelector('[data-base-rate-field]');
      var laneField = root.querySelector('[data-lane-field]');
      var marginField = root.querySelector('[data-margin-field]');
      if (!serviceGroup || !uomGroup) return;

      var servicePresets = {
        b2b: { amount: 52, lane: 'National B2B Matrix', margin: '15%', density: '8.5' },
        threshold: { amount: 44, lane: 'Home Delivery Threshold Matrix', margin: '12%', density: '7.0' },
        'wg-no-insp': { amount: 54, lane: 'White Glove — No Inspection', margin: '15%', density: '8.5' },
        'wg-insp': { amount: 58, lane: 'National B2B Matrix', margin: '15%', density: '8.5' }
      };

      function syncSegmentedVisual(group) {
        group.querySelectorAll('label').forEach(function (label) {
          var input = label.querySelector('input[type="radio"]');
          label.classList.toggle('is-selected', !!(input && input.checked));
        });
      }

      function selectedValue(group) {
        var checked = group.querySelector('input[type="radio"]:checked');
        return checked ? checked.value : '';
      }

      function formatBaseRate(amount, uom) {
        if (uom === 'invoice') return amount.toFixed(1) + '% of invoice';
        if (uom === 'flat') return '$' + amount.toFixed(2) + ' flat';
        if (uom === 'cube') return '$' + amount.toFixed(2) + ' / cu ft';
        if (uom === 'seat') return '$' + amount.toFixed(2) + ' / seat';
        return '$' + amount.toFixed(2) + ' / CWT';
      }

      function syncOverview() {
        var service = selectedValue(serviceGroup);
        var uom = selectedValue(uomGroup);
        var preset = servicePresets[service] || servicePresets['wg-insp'];
        var showDensity = uom === 'cwt' || uom === 'cube';

        syncSegmentedVisual(serviceGroup);
        syncSegmentedVisual(uomGroup);

        if (densityField) densityField.hidden = !showDensity;
        if (baseRateField) baseRateField.value = formatBaseRate(preset.amount, uom);
        if (laneField) laneField.value = preset.lane;
        if (marginField) marginField.value = preset.margin;

        var densityInput = root.querySelector('[data-density-input]');
        if (densityInput && showDensity) densityInput.value = preset.density;
      }

      serviceGroup.querySelectorAll('input[type="radio"]').forEach(function (radio) {
        radio.addEventListener('change', syncOverview);
      });
      uomGroup.querySelectorAll('input[type="radio"]').forEach(function (radio) {
        radio.addEventListener('change', syncOverview);
      });

      serviceGroup.querySelectorAll('label').forEach(function (label) {
        label.addEventListener('click', function () {
          window.requestAnimationFrame(syncOverview);
        });
      });
      uomGroup.querySelectorAll('label').forEach(function (label) {
        label.addEventListener('click', function () {
          window.requestAnimationFrame(syncOverview);
        });
      });

      syncOverview();
    });
  }

  /* ── UOM → density field visibility ── */
  function initUomDensity() {
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

  /* ── Stepped selector "Other" unlock ── */
  function initSteppedSelectors() {
    document.querySelectorAll('[data-stepped-select]').forEach(function (sel) {
      var custom = sel.parentElement.querySelector('[data-stepped-custom]');
      if (!custom) return;
      sel.addEventListener('change', function () {
        custom.hidden = sel.value !== 'other';
      });
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
      { code: 'sfo', label: 'SFO', factor: 1.02, enabled: true },
      { code: 'dfw', label: 'DFW', factor: 0.96, enabled: true },
      { code: 'ord', label: 'ORD', factor: 0.98, enabled: true },
      { code: 'atl', label: 'ATL', factor: 0.94, enabled: true },
      { code: 'ewr', label: 'EWR', factor: 1.05, enabled: false },
      { code: 'mia', label: 'MIA', factor: 0.97, enabled: true }
    ];
    var services = [
      { prefix: 'b2b', label: 'B2B', zoneDigits: 3, uom: 'CWT', rateBase: 52.0, rateStep: 1.15, suffix: '' },
      { prefix: 'thr', label: 'Threshold', zoneDigits: 5, uom: '$/cf', rateBase: 5.15, rateStep: 0.12, suffix: '/cf' },
      { prefix: 'wgni', label: 'WG No Insp.', zoneDigits: 3, uom: 'CWT', rateBase: 56.5, rateStep: 1.25, suffix: '' },
      { prefix: 'wgi', label: 'WG Inspection', zoneDigits: 3, uom: 'CWT', rateBase: 61.0, rateStep: 1.35, suffix: '' }
    ];
    var breaks = [
      { label: '0–250 cf', weight: 1.0 },
      { label: '251–500 cf', weight: 0.94 },
      { label: '501–750 cf', weight: 0.88 },
      { label: '751–1,000 cf', weight: 0.84 },
      { label: '1,001+ cf', weight: 0.79 }
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
      ord: [
        { zone: '606', desc: 'Chicago loop' },
        { zone: '607', desc: 'Chicago north side' },
        { zone: '604', desc: 'Western suburbs' },
        { zone: '531', desc: 'Milwaukee corridor' },
        { zone: '463', desc: 'NW Indiana' }
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
      ],
      mia: [
        { zone: '331', desc: 'Miami core' },
        { zone: '333', desc: 'Fort Lauderdale' },
        { zone: '334', desc: 'West Palm corridor' },
        { zone: '341', desc: 'Naples south' }
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

    function renderPicker() {
      picker.innerHTML = '';
      combinations.forEach(function (combo) {
        var btn = document.createElement('button');
        btn.type = 'button';
        var stateLabel = !combo.enabled ? ' · station off' : (combo.configured ? ' · configured' : ' · empty');
        btn.className = 'config-picker-btn' + (combo.id === activeId ? ' is-active' : '');
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', combo.id === activeId ? 'true' : 'false');
        btn.dataset.comboId = combo.id;
        btn.innerHTML = combo.service.label + ' · ' + combo.origin.label +
          '<span class="config-picker-meta">' + combo.id + stateLabel + '</span>';
        btn.addEventListener('click', function () {
          activeId = btn.dataset.comboId;
          renderPicker();
          renderMatrix();
        });
        picker.appendChild(btn);
      });
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
        labelEl.textContent = combo.id + ' · ' + combo.service.label + ' · ' + combo.origin.label;
      }
      if (zoneEl) {
        zoneEl.textContent = combo.service.zoneDigits + '-digit base ZIP (' + combo.service.label + ')';
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

  ready(function () {
    initTabs();
    initDropdowns();
    initFilterBars();
    initDrillBanner();
    initDrilldownRows();
    initWizards();
    initQuoteTypeToggle();
    initTariffOverview();
    initUomDensity();
    initShipmentConfigurator();
    initCallForQuoteMode();
    initCubeThresholdNotice();
    initHighValueNotice();
    initTariffTemplateToggle();
    initOriginStationToggles();
    initSteppedSelectors();
    initHelpSearch();
    initRateMatrix();
  });
})();
