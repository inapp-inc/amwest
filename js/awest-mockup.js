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

  /* ── UOM → density field visibility ── */
  function initUomDensity() {
    document.querySelectorAll('[data-uom-group]').forEach(function (group) {
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

  ready(function () {
    initDropdowns();
    initFilterBars();
    initDrillBanner();
    initDrilldownRows();
    initWizards();
    initQuoteTypeToggle();
    initUomDensity();
  });
})();
