/**
 * Extended page hydrators — all remaining mockup surfaces (phases 1–8)
 */
(function (global) {
  'use strict';

  var H = global.AwestDemoHydrate;
  if (!H) return;

  var P = function () { return global.AwestPricingMock; };
  var S = function () { return global.AwestStore; };
  var G = function () { return global.AwestGovernance; };

  function dummyTariff() {
    return global.AwestDummyTariff || {
      baseRateCwt: 77.77, priorBaseRateCwt: 75, minimumChargeTariff: 111
    };
  }

  function pageName() {
    return (location.pathname.split('/').pop() || '').replace('.html', '');
  }

  function fmtMoney(n) {
    return P() ? P().formatMoney(n) : '$' + (Number(n) || 0).toFixed(2);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function custName(id) {
    var c = S().getCustomer(id);
    return c ? c.name : id;
  }

  function repName(id) {
    var u = S().getUser(id);
    return u ? u.name : 'Unknown';
  }

  function quoteDetailHref(id, internal) {
    var base = internal ? '../internal/' : '';
    var q = S().getQuote(id);
    var page = (q && q.status === 'pending') ? 'quote-detail-pending.html' : 'quote-detail.html';
    return base + page + '?id=' + encodeURIComponent(id);
  }

  function getQuery(key) {
    return new URLSearchParams(location.search).get(key);
  }

  function setBuilderField(selector, val) {
    if (val == null || val === '') return;
    document.querySelectorAll(selector).forEach(function (el) {
      el.value = String(val);
    });
  }

  function parsePortalLocation(text) {
    var raw = String(text || '').trim();
    var zipMatch = raw.match(/\b(\d{5})\b/);
    var zip = zipMatch ? zipMatch[1] : '';
    var cityState = raw.replace(/\b\d{5}\b/, '').replace(/,\s*$/, '').trim();
    return { label: raw, zip: zip, cityState: cityState || raw };
  }

  function wireSaveLink(selector, handler) {
    var el = document.querySelector(selector);
    if (!el || el._storeWired) return;
    el._storeWired = true;
    el.addEventListener('click', function (e) {
      e.preventDefault();
      handler();
    });
  }

  /* ── Phase 1: Quote comparison, builder edit, detail actions ── */
  function hydrateQuoteComparison() {
    if (pageName() !== 'quote-comparison') return;
    var quotes = S().getState().quotes;
    var leftSel = document.getElementById('qc-left');
    var rightSel = document.getElementById('qc-right');
    if (!leftSel || !rightSel) return;

    function fillSelect(sel, selected) {
      sel.innerHTML = quotes.map(function (q) {
        return '<option value="' + q.id + '"' + (q.id === selected ? ' selected' : '') + '>' + q.id + '</option>';
      }).join('');
    }

    var leftId = getQuery('id') || getQuery('left') || (quotes[0] && quotes[0].id);
    var rightId = getQuery('right') || 'Q-2026-0823';
    fillSelect(leftSel, leftId);
    fillSelect(rightSel, rightId);

    function renderSide(id, cardIdx) {
      var q = S().getQuote(id);
      if (!q) return;
      var p = S().computeQuotePricing(q);
      var cards = document.querySelectorAll('.compare-grid .card');
      var card = cards[cardIdx];
      if (!card) return;
      card.innerHTML = '<p' + (cardIdx === 0 ? ' class="diff-changed"' : '') + '>Total: <span class="tabular">' + fmtMoney(p.total) + '</span></p>' +
        '<p>Margin: <span class="tabular">' + (p.margin || 0) + '%</span></p>' +
        '<p>Weight: <span class="tabular">' + (q.weight || 0).toLocaleString() + ' lbs</span></p>';
    }

    function refreshDiff() {
      var l = S().getQuote(leftSel.value);
      var r = S().getQuote(rightSel.value);
      renderSide(leftSel.value, 0);
      renderSide(rightSel.value, 1);
      var diffEl = document.querySelector('.card ul');
      if (diffEl && l && r) {
        var lp = S().computeQuotePricing(l);
        var rp = S().computeQuotePricing(r);
        var delta = rp.total - lp.total;
        var pct = lp.total ? Math.round((delta / lp.total) * 1000) / 10 : 0;
        diffEl.innerHTML = '<li>Total ' + (delta >= 0 ? 'increased' : 'decreased') + ' by ' + fmtMoney(Math.abs(delta)) + ' (' + (delta >= 0 ? '+' : '−') + Math.abs(pct) + '%)</li>' +
          '<li>Margin: ' + lp.margin + '% → ' + rp.margin + '%</li>' +
          '<li>Left: ' + custName(l.customerId) + ' · Right: ' + custName(r.customerId) + '</li>';
      }
    }

    leftSel.addEventListener('change', refreshDiff);
    rightSel.addEventListener('change', refreshDiff);
    refreshDiff();
  }

  function hydrateQuoteBuilder() {
    if (pageName() !== 'quote-builder') return;
    var editId = getQuery('id');
    var prefill = S().getAssistantPrefill();
    var q = editId ? S().getQuote(editId) : prefill;
    var queryCid = getQuery('customer') || getQuery('customerId');
    var customerId = (q && q.customerId)
      || (queryCid && S().getCustomer(queryCid) ? queryCid : null)
      || 'PACI-1200';
    var customer = S().getCustomer(customerId);
    var customerInput = document.querySelector('[data-builder-customer]');
    if (customerInput && customer) {
      customerInput.value = customer.name + ' (' + customer.code + ')';
      customerInput.setAttribute('data-customer-id', customerId);
    }
    var appliedLink = document.querySelector('[data-applied-terms-customer-link]');
    if (appliedLink) appliedLink.href = 'customer-detail.html?id=' + encodeURIComponent(customerId);
    if (editId) {
      var q = S().getQuote(editId);
      if (q) {
        var disc = document.querySelector('[data-builder-quote-disc]');
        var lane = document.querySelector('[data-builder-lane-override]');
        if (disc) disc.value = q.quoteDiscPct || 0;
        if (lane) lane.value = q.laneOverride != null ? q.laneOverride : 45;
        setBuilderField('[data-pickup-zip]', q.pickupZip);
        setBuilderField('[data-delivery-zip]', q.deliveryZip);
        setBuilderField('[data-shipment-weight]', q.weight);
        setBuilderField('[data-shipment-cube]', q.cube);
        setBuilderField('[data-declared-value]', q.declaredValue);
        setBuilderField('[data-competitor-name]', q.competitorName);
        setBuilderField('[data-competitor-rate]', q.competitorRate);
        setBuilderField('[data-spot-base]', q.spotBaseCwt);
        setBuilderField('[data-spot-fuel]', q.spotFuelPct);
        if (q.pricingMode === 'spot') {
          var spotRadio = document.querySelector('[data-quote-type-toggle] input[value="spot"]');
          if (spotRadio) spotRadio.checked = true;
        }
      }
    } else if (prefill) {
      setBuilderField('[data-pickup-zip]', prefill.pickupZip);
      setBuilderField('[data-delivery-zip]', prefill.deliveryZip);
      setBuilderField('[data-shipment-weight]', prefill.weight);
      setBuilderField('[data-shipment-cube]', prefill.cube);
      setBuilderField('[data-declared-value]', prefill.declaredValue);
    }
    if (prefill) {
      var note = document.querySelector('[data-assistant-prefill]');
      if (!note) {
        note = document.createElement('p');
        note.className = 'inline-notice info';
        note.setAttribute('data-assistant-prefill', '');
        note.style.marginBottom = 'var(--space-md)';
        var hdr = document.querySelector('.page-header');
        if (hdr) hdr.insertAdjacentElement('afterend', note);
      }
      note.innerHTML = '<strong>Opened from Quote Assistant</strong> — ' + (prefill.customerName || 'Customer') + ', ' + (prefill.origin || '') + ' → ' + (prefill.destination || '') + '.';
    }
  }

  function hydrateQuoteDetailActions() {
    if (pageName() !== 'quote-detail' && pageName() !== 'quote-detail-pending') return;
    var id = getQuery('id');
    if (!id) return;
    var q = S().getQuote(id);
    if (!q) return;
    var p = S().computeQuotePricing(q);
    var state = S().getState();

    var G = window.AwestGovernance;

    var stepper = document.querySelector('[data-quote-lifecycle]') || document.querySelector('.stepper');
    if (stepper && G) {
      stepper.innerHTML = G.renderQuoteStepperHtml(q.status);
    }

    var nextEl = document.querySelector('[data-quote-next-step]');
    if (nextEl && G) nextEl.textContent = G.quoteNextStep(q.status) || '';

    var gov = G().needsApproval(state, q);
    var existingGov = document.querySelector('.governance-banner');
    if (q.status === 'pending' && gov) {
      var bannerHtml = '<strong>Approval required:</strong> ' + gov.msg + ' Margin ' + (p.margin || 0) + '%.';
      if (existingGov) existingGov.innerHTML = bannerHtml;
      else {
        var banner = document.createElement('div');
        banner.className = 'governance-banner amber';
        banner.innerHTML = bannerHtml;
        var after = document.querySelector('.stepper') || document.querySelector('.page-header');
        if (after) after.insertAdjacentElement('afterend', banner);
      }
    } else if (existingGov && q.status !== 'pending') {
      existingGov.remove();
    }

    var approvalPanel = document.querySelector('[data-quote-detail-approval]');

    if (q.status === 'portal_request' && q.channel === 'portal') {
      if (stepper) {
        stepper.innerHTML = '<span class="step active">Portal request</span><span class="arrow">→</span>' +
          '<span class="step">Draft</span><span class="arrow">→</span>' +
          '<span class="step">Pending Approval</span><span class="arrow">→</span>' +
          '<span class="step">Approved</span><span class="arrow">→</span>' +
          '<span class="step">Sent</span>';
      }
      var portalBanner = document.querySelector('[data-portal-request-banner]');
      if (!portalBanner) {
        portalBanner = document.createElement('div');
        portalBanner.className = 'inline-notice info';
        portalBanner.setAttribute('data-portal-request-banner', '');
        portalBanner.style.marginBottom = 'var(--space-lg)';
        var insertAfter = document.querySelector('.stepper') || document.querySelector('.page-header');
        if (insertAfter) insertAfter.insertAdjacentElement('afterend', portalBanner);
      }
      var tierLabels = { threshold: 'Threshold', wgni: 'White Glove No Inspection', wgi: 'White Glove Inspection' };
      var tier = tierLabels[q.preferredService] || tierLabels[q.primaryService] || q.preferredService || 'Home delivery';
      portalBanner.innerHTML = '<strong>Customer portal request</strong> — submitted ' + fmtDate(q.portalSubmittedAt || q.createdAt) +
        '. ' + (q.weight || 0).toLocaleString() + ' lbs · ' + (q.cube || 0) + ' cu ft · ' +
        fmtMoney(q.declaredValue || 0) + ' declared value · ' + tier + ' · ' + laneLabel(q) + '.';
      var actionRow = document.querySelector('.main-content > div[style*="flex-wrap"]');
      if (actionRow && !document.querySelector('[data-portal-prepare-quote]')) {
        var prep = document.createElement('a');
        prep.href = 'quote-builder.html?id=' + encodeURIComponent(id);
        prep.className = 'btn btn-primary';
        prep.setAttribute('data-portal-prepare-quote', '');
        prep.textContent = 'Prepare pricing';
        actionRow.insertBefore(prep, actionRow.firstChild);
      }
    } else {
      var oldPortalBanner = document.querySelector('[data-portal-request-banner]');
      if (oldPortalBanner) oldPortalBanner.remove();
    }

    if (q.status === 'pending') {
      if (!approvalPanel) {
        approvalPanel = document.createElement('div');
        approvalPanel.className = 'card panel';
        approvalPanel.setAttribute('data-quote-detail-approval', '');
        approvalPanel.style.marginBottom = 'var(--space-lg)';
        approvalPanel.innerHTML = '<h3 class="panel-title">Manager decision</h3><p style="font-size:13px;margin-bottom:var(--space-md)">Review the pricing breakdown, then approve to release the quote or reject with a reason.</p><div class="detail-approval-actions" style="display:flex;gap:var(--space-sm);flex-wrap:wrap"></div>';
        var grid = document.querySelector('.main-content > div[style*="grid"]');
        if (grid) grid.parentNode.insertBefore(approvalPanel, grid);
      } else {
        approvalPanel.style.display = '';
      }
      var actWrap = approvalPanel.querySelector('.detail-approval-actions')
        || approvalPanel.querySelector('div[style*="flex-wrap"]');
      if (actWrap && G().canApprove(state)) {
        actWrap.innerHTML = '<button type="button" class="btn btn-primary" data-detail-approve>Approve &amp; release</button>' +
          '<button type="button" class="btn btn-secondary" data-detail-reject>Reject with reason</button>' +
          '<a href="quote-builder.html?id=' + encodeURIComponent(id) + '" class="btn btn-link">Edit quote</a>';
      } else if (actWrap) {
        actWrap.innerHTML = '<p class="text-muted-sm">Manager approval required. Switch to a Sales Manager account using the <strong>Session</strong> menu in the demo banner to approve.</p>' +
          '<a href="quote-builder.html?id=' + encodeURIComponent(id) + '" class="btn btn-link">Edit quote</a>';
      }
    } else if (approvalPanel) {
      approvalPanel.remove();
    }

    if (P()) P().hydrateMarginFloorUI(state.settings.marginFloor);

    var pdfLink = document.querySelector('a[href*="quote-pdf"]');
    var esignLink = document.querySelector('a[href*="quote-esign"]');
    var tmsLink = document.querySelector('a[href*="quote-tms-export"]');
    if (pdfLink) pdfLink.href = 'quote-pdf.html?id=' + encodeURIComponent(id);
    if (esignLink) {
      esignLink.href = 'quote-esign.html?id=' + encodeURIComponent(id);
      if (!q.artifacts.pdf.generatedAt) esignLink.title = 'Generate PDF first';
    }
    if (tmsLink) tmsLink.href = 'quote-tms-export.html?id=' + encodeURIComponent(id);

    document.querySelectorAll('a[href="quote-builder.html"]').forEach(function (a) {
      a.href = 'quote-builder.html?id=' + encodeURIComponent(id);
    });
    document.querySelectorAll('a[href="quote-comparison.html"]').forEach(function (a) {
      a.href = 'quote-comparison.html?id=' + encodeURIComponent(id) + '&right=Q-2026-0823';
    });

    if (q.status === 'approved' && !document.querySelector('[data-quote-action="send"]')) {
      var actions = document.querySelector('.main-content > div[style*="flex-wrap"]');
      if (actions) {
        var sendBtn = document.createElement('button');
        sendBtn.type = 'button';
        sendBtn.className = 'btn btn-primary';
        sendBtn.setAttribute('data-quote-action', 'send');
        sendBtn.textContent = q.channel === 'portal' ? 'Send to customer' : 'Mark as Sent';
        sendBtn.addEventListener('click', function () { S().sendQuote(id); location.reload(); });
        actions.insertBefore(sendBtn, actions.firstChild);
      }
    }

    if (q.status === 'sent') {
      var actionRow = document.querySelector('.main-content > div[style*="flex-wrap"]')
        || document.querySelector('[data-quote-detail-actions]');
      if (actionRow && !document.querySelector('[data-quote-action="convert"]')) {
        [
          { action: 'convert', label: 'Convert to Shipment', cls: 'btn-primary', fn: function () { S().convertQuoteToShipment(id); location.reload(); } },
          { action: 'expire', label: 'Mark Expired', cls: 'btn-secondary', fn: function () { S().expireQuote(id); location.reload(); } },
          { action: 'lost', label: 'Mark Lost', cls: 'btn-secondary', fn: function () {
            if (window.confirm('Mark ' + id + ' as lost opportunity?')) { S().markQuoteLost(id); location.reload(); }
          } }
        ].forEach(function (def) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn ' + def.cls;
          btn.setAttribute('data-quote-action', def.action);
          btn.textContent = def.label;
          btn.addEventListener('click', def.fn);
          actionRow.appendChild(btn);
        });
      }
    }

    var art = document.querySelector('[data-artifacts-status]');
    if (!art) {
      art = document.createElement('p');
      art.className = 'text-muted-sm';
      art.setAttribute('data-artifacts-status', '');
      art.style.marginBottom = 'var(--space-md)';
      var hdr = document.querySelector('.page-header');
      if (hdr) hdr.insertAdjacentElement('afterend', art);
    }
    art.textContent = 'Artifacts — PDF: ' + (q.artifacts.pdf.generatedAt ? 'generated' : 'none') +
      ' · E-sign: ' + q.artifacts.esign.status + ' · TMS: ' + q.artifacts.tmsExport.status;
  }

  function hydrateQuoteEsignFull() {
    if (pageName() !== 'quote-esign') return;
    var id = getQuery('id') || 'Q-2026-0823';
    var q = S().getQuote(id);
    if (!q) return;
    var statusEl = document.querySelector('.card p, [data-esign-status]');
    if (statusEl) statusEl.textContent = 'Status: ' + q.artifacts.esign.status;
    /* save: demo-crud.js */
  }

  function hydrateQuotePdfFull() {
    if (pageName() !== 'quote-pdf') return;
    var id = getQuery('id') || 'Q-2026-0823';
    var q = S().getQuote(id);
    if (!q) return;
    var p = S().computeQuotePricing(q);
    var cust = custName(q.customerId);
    document.querySelectorAll('.page-header p').forEach(function (el) {
      el.textContent = q.id + ' · ' + cust;
    });
    var card = document.querySelector('.card');
    if (card) {
      card.querySelectorAll('p').forEach(function (pEl) {
        if (pEl.textContent.indexOf('Quote #') >= 0) {
          pEl.innerHTML = '<strong>Quote #:</strong> ' + q.id + ' · <strong>Date:</strong> ' + fmtDate(q.updatedAt);
        }
        if (pEl.textContent.indexOf('Customer') >= 0 || pEl.hasAttribute('data-pdf-summary')) {
          pEl.setAttribute('data-pdf-summary', '');
          pEl.innerHTML = '<strong>Customer:</strong> ' + cust + '<br><strong>Lane:</strong> ' + q.origin + ' → ' + q.destination +
            '<br><strong>Weight:</strong> ' + (q.weight || 0).toLocaleString() + ' lbs · <strong>Total:</strong> <span class="tabular">' + fmtMoney(p.total) + '</span>';
        }
      });
    }
    var close = document.querySelector('.page-header a.btn-secondary');
    if (close) close.href = 'quote-detail.html?id=' + encodeURIComponent(id);
    /* PDF generate: demo-crud.js */
  }

  function hydrateQuoteTmsPage() {
    if (pageName() !== 'quote-tms-export') return;
    var id = getQuery('id') || 'Q-2026-0823';
    var q = S().getQuote(id);
    if (!q) return;
    var p = S().computeQuotePricing(q);
    var card = document.querySelector('.card');
    if (q.artifacts.tmsExport.status === 'success') {
      if (card) {
        card.querySelector('p').innerHTML = q.id + ' exported as <strong>' + q.id.replace(/-/g, '_') + '_TMS.xlsx</strong> — normalized via <a href="reference-tms-mapping.html">TMS rate-key mapping</a>.';
      }
    } else {
      if (card) {
        card.innerHTML = '<h2 class="panel-heading">Export to TMS</h2><p style="margin:var(--space-md) 0">Quote ' + q.id + ' · Total ' + fmtMoney(p.total || 0) + '</p>' +
          '<button type="button" class="btn btn-primary" data-tms-run>Run export</button>';
      }
    }
    document.querySelectorAll('a[href="quote-detail.html"]').forEach(function (a) {
      a.href = 'quote-detail.html?id=' + encodeURIComponent(id);
    });
  }

  /* ── Phase 2: Tariffs + customers ── */
  function hydrateTariffWizard() {
    if (pageName() !== 'tariff-wizard') return;
    var td = S().getState().settings.tariffDisplay || {};
    var cloneId = getQuery('clone');
    var src = cloneId ? S().getTariff(cloneId) : null;
    var baseInput = document.getElementById('tw-base');
    if (baseInput) {
      var baseRate = (src && src.config && src.config.baseRateCwt) || td.baseRateCwt || 58;
      baseInput.value = String(baseRate);
    }
    if (src) {
      var nameEl = document.getElementById('tw-name');
      var idEl = document.getElementById('tw-id');
      var cfg = src.config || {};
      if (nameEl) nameEl.value = src.name + ' (copy)';
      if (idEl) idEl.value = '';
      var serviceEl = document.getElementById('tw-service');
      var uomEl = document.getElementById('tw-uom');
      var densityEl = document.getElementById('tw-density');
      var rateTableEl = document.getElementById('tw-rate-table');
      var minChargeEl = document.getElementById('tw-min-charge');
      var floorEl = document.getElementById('tw-floor');
      var commodityEl = document.getElementById('tw-commodity');
      if (serviceEl && src.service) {
        var svcMap = { B2B: 'b2b', Threshold: 'threshold', 'White Glove No Inspection': 'wg-no-insp', 'White Glove Inspection': 'wg-insp' };
        var svcKey = svcMap[src.service] || 'b2b';
        serviceEl.value = svcKey;
      }
      if (uomEl && src.uom) uomEl.value = src.uom.toLowerCase();
      if (densityEl && cfg.density != null) densityEl.value = String(cfg.density);
      if (rateTableEl && cfg.rateTableLabel) rateTableEl.value = cfg.rateTableLabel;
      if (minChargeEl && cfg.minimumCharge != null) minChargeEl.value = String(cfg.minimumCharge);
      if (floorEl && cfg.marginFloorPct != null) floorEl.value = String(cfg.marginFloorPct);
      if (commodityEl && cfg.commodity) commodityEl.value = cfg.commodity;
      if (baseInput) baseInput.dataset.userEdited = '1';
      if (uomEl) uomEl.dispatchEvent(new Event('change', { bubbles: true }));
      var notice = document.querySelector('[data-tariff-template-notice]');
      if (!notice) {
        notice = document.createElement('p');
        notice.className = 'inline-notice info';
        notice.setAttribute('data-tariff-template-notice', '');
        notice.style.marginBottom = 'var(--space-md)';
        var header = document.querySelector('.page-header');
        if (header) header.insertAdjacentElement('afterend', notice);
      }
      notice.innerHTML = '<strong>Using ' + src.id + ' as template</strong> — pricing model and baseline settings copied. Origin stations start empty; add the locations you need below.';
    }
    if (window.AwestMockup && window.AwestMockup.seedTariffConfiguratorOrigins) {
      var originGrid = cloneId ? null : (src && src.config && src.config.originGrid ? src.config.originGrid : null);
      window.AwestMockup.seedTariffConfiguratorOrigins(originGrid);
    } else if (window.AwestMockup && window.AwestMockup.refreshTariffConfiguratorPick) {
      window.AwestMockup.refreshTariffConfiguratorPick();
    }
  }

  function hydrateTariffConfirm() {
    /* rollback save: demo-crud.js */
  }

  function hydrateTariffComparison() {
    if (pageName() !== 'tariff-comparison' && pageName() !== 'tariff-competitor-comparison') return;
    var tariffs = S().getState().tariffs;
    var leftSel = document.getElementById('tc-left');
    var rightSel = document.getElementById('tc-right');
    if (!leftSel || !rightSel) return;

    leftSel.innerHTML = tariffs.map(function (t, i) {
      return '<option value="' + t.id + '"' + (i === 0 ? ' selected' : '') + '>' + t.id + ' · ' + t.name + '</option>';
    }).join('');
    rightSel.innerHTML = tariffs.map(function (t, i) {
      return '<option value="' + t.id + '"' + (i === 1 ? ' selected' : '') + '>' + t.id + ' · ' + t.name + '</option>';
    }).join('');

    function renderTariffCard(id, cardIdx) {
      var t = S().getTariff(id);
      if (!t) return;
      var cfg = t.config || {};
      var cards = document.querySelectorAll('.compare-grid > div');
      var card = cards[cardIdx];
      if (!card) return;
      var rateEl = card.querySelector('[data-tariff-rate-new], [data-tariff-rate-old]');
      if (rateEl) rateEl.textContent = fmtMoney(cfg.baseRateCwt || 58) + '/CWT';
      var statusEl = card.querySelector('.badge');
      if (statusEl) {
        statusEl.textContent = t.status.charAt(0).toUpperCase() + t.status.slice(1);
        statusEl.className = 'badge badge-' + (t.status === 'active' ? 'active' : 'draft');
      }
    }

    function refreshTariffDiff() {
      var leftId = leftSel.value;
      var rightId = rightSel.value;
      renderTariffCard(leftId, 0);
      renderTariffCard(rightId, 1);
      var lt = S().getTariff(leftId);
      var rt = S().getTariff(rightId);
      var diffEl = document.querySelector('[data-tariff-rate-change]');
      if (diffEl && lt && rt) {
        var lb = (lt.config || {}).baseRateCwt || 0;
        var rb = (rt.config || {}).baseRateCwt || 0;
        var delta = rb - lb;
        var pct = lb ? Math.round((delta / lb) * 1000) / 10 : 0;
        diffEl.textContent = 'Base rate ' + (delta >= 0 ? 'increased' : 'decreased') + ' from ' +
          fmtMoney(lb) + ' to ' + fmtMoney(rb) + ' (' + (delta >= 0 ? '+' : '−') + Math.abs(pct) + '%)';
      }
    }

    if (!leftSel._tariffCmpWired) {
      leftSel._tariffCmpWired = true;
      leftSel.addEventListener('change', refreshTariffDiff);
      rightSel.addEventListener('change', refreshTariffDiff);
    }
    refreshTariffDiff();
  }

  function hydrateCustomerDetailFull() {
    /* CRUD: demo-crud.js */
  }

  /* ── Phase 3: Reference + analytics ── */
  function hydrateReferenceHub() {
    if (pageName() !== 'reference') return;
    var ref = S().getState().reference;
    document.querySelectorAll('.card .tabular, .stat-value').forEach(function (el, i) {
      var counts = [ref.fuel.length, ref.accessorials.length, ref.b2bLanes.length, ref.hdTiers.length];
      if (i < counts.length) el.textContent = counts[i];
    });
  }

  function hydrateReferenceFuelHistory() {
    if (pageName() !== 'reference-fuel-history') return;
    var tbody = document.querySelector('.data-table tbody');
    if (!tbody) return;
    tbody.innerHTML = S().getState().reference.fuelHistory.map(function (h) {
      return '<tr><td class="tabular">' + fmtDate(h.at) + '</td><td>' + h.action + '</td><td>' + repName(h.by) + '</td></tr>';
    }).join('') || '<tr><td colspan="3">No history yet</td></tr>';
  }

  function hydrateReferenceEditPages() {
    /* CRUD: demo-crud.js */
  }

  function hydrateReferenceTmsMapping() {
    if (pageName() !== 'reference-tms-mapping') return;
    var mapping = S().getState().reference.tmsMapping;
    var tabs = ['b2b', 'threshold', 'mr2'];
    tabs.forEach(function (tab) {
      var tbody = document.querySelector('[data-tms-section="' + tab + '"] tbody');
      if (!tbody) return;
      var rows = mapping[tab] || [];
      if (!rows.length) return;
      tbody.innerHTML = rows.map(function (row) {
        return '<tr><td>' + (row.label || row.ruleName || '') + '</td>' +
          '<td class="tabular"><input value="' + (row.tariffCode || row.mr2Code || '') + '"></td>' +
          '<td class="tabular"><input value="' + (row.levelCode || row.tierMapping || row.appliesWhen || '') + '"></td>' +
          '<td>' + (row.discountLevel || row.bppcField || '') + '</td>' +
          '<td>' + (row.fuelIndex || '') + '</td>' +
          '<td>' + (row.exportSheet || row.exportTemplate || '') + '</td></tr>';
      }).join('');
    });

    /* save: demo-crud.js */
  }

  function serviceLabel(code) {
    var labels = {
      b2b: 'B2B',
      threshold: 'Threshold',
      wgni: 'WG No Inspection',
      wgi: 'White Glove Inspection',
      'wg-insp': 'White Glove Inspection',
      'wg-no-insp': 'WG No Inspection'
    };
    return labels[code] || code || 'Other';
  }

  function laneKey(q) {
    var o = (q.origin || '').replace(/\s*Metro\s*/i, '').trim();
    var d = (q.destination || '').replace(/\s*Metro\s*/i, '').trim();
    if (o && d) return o + ' → ' + d;
    return q.laneCode || 'Unknown lane';
  }

  function quoteInDateRange(q, rangeDays) {
    if (!rangeDays || rangeDays === 'All') return true;
    var days = parseInt(rangeDays, 10);
    if (!days) return true;
    var ts = new Date(q.updatedAt || q.createdAt).getTime();
    return Date.now() - ts <= days * 86400000;
  }

  function renderAnalyticsBarChart(mount, series, opts) {
    if (!mount || !series.length) {
      mount.innerHTML = '<p class="text-muted-sm">No data for this period.</p>';
      return;
    }
    var max = Math.max.apply(null, series.map(function (s) { return s.value; }).concat([1]));
    mount.innerHTML = series.map(function (s) {
      var pct = Math.round((s.value / max) * 100);
      var h = Math.max(pct, s.value > 0 ? 8 : 0);
      return '<div class="analytics-bar-wrap">' +
        '<span class="analytics-bar-value">' + s.display + '</span>' +
        '<div class="analytics-bar" style="height:' + h + '%" title="' + s.label + ': ' + s.display + '"></div>' +
        '<span class="analytics-bar-label">' + s.label + '</span></div>';
    }).join('');
    if (opts && opts.subEl && opts.subText) opts.subEl.textContent = opts.subText;
  }

  function renderStackedList(mount, rows) {
    if (!mount) return;
    if (!rows.length) {
      mount.innerHTML = '<li class="text-muted-sm">No data</li>';
      return;
    }
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    mount.innerHTML = rows.map(function (r) {
      var pct = Math.round((r.value / max) * 100);
      return '<li class="analytics-stacked-row">' +
        '<span>' + r.label + '</span><span>' + r.display + '</span>' +
        '<div class="analytics-stacked-track"><div class="analytics-stacked-fill ' + (r.cls || '') + '" style="width:' + pct + '%"></div></div>' +
        '</li>';
    }).join('');
  }

  function hydrateAnalyticsFull() {
    if (pageName() !== 'analytics') return;
    var state = S().getState();
    var metrics = S().getMetrics();
    var floor = state.settings.marginFloor || 15;
    var quotes = state.quotes.filter(function (q) { return S().isRepPipelineQuote(q); });
    var marginSum = 0;
    var belowFloor = 0;
    var portalPending = 0;
    var byService = {};
    var byStatus = {};
    var byMonth = {};
    var byTariff = {};
    var byRep = {};
    var marginBuckets = { high: 0, ok: 0, low: 0, leak: 0 };
    var leakage = [];
    var exceptions = [];

    quotes.forEach(function (q) {
      var p = S().computeQuotePricing(q);
      var margin = p.margin || 0;
      marginSum += margin;
      if (margin < floor) {
        belowFloor++;
        if (leakage.length < 8) {
          leakage.push({ q: q, margin: margin });
        }
      }
      if (q.status === 'portal_request') portalPending++;

      if (P() && P().hasCustomerDiscException && P().hasCustomerDiscException(q)) {
        if (exceptions.length < 8) exceptions.push(q);
      }

      var svc = q.primaryService || 'b2b';
      if (!byService[svc]) byService[svc] = { count: 0, marginSum: 0 };
      byService[svc].count++;
      byService[svc].marginSum += margin;

      byStatus[q.status] = (byStatus[q.status] || 0) + 1;

      var d = new Date(q.createdAt || q.updatedAt);
      var monthKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      if (!byMonth[monthKey]) byMonth[monthKey] = { count: 0, marginSum: 0 };
      byMonth[monthKey].count++;
      byMonth[monthKey].marginSum += margin;

      var tid = q.tariffId || 'Unknown';
      if (!byTariff[tid]) byTariff[tid] = { count: 0, marginSum: 0, revenue: 0 };
      byTariff[tid].count++;
      byTariff[tid].marginSum += margin;
      byTariff[tid].revenue += p.total || 0;

      if (q.repId) {
        if (!byRep[q.repId]) byRep[q.repId] = { count: 0, won: 0, lost: 0, marginSum: 0, pipeline: 0 };
        byRep[q.repId].count++;
        byRep[q.repId].marginSum += margin;
        if (q.status === 'converted' || q.status === 'accepted') byRep[q.repId].won++;
        if (q.status === 'lost') byRep[q.repId].lost++;
        if (['draft', 'pending', 'approved', 'sent', 'portal_request'].indexOf(q.status) >= 0) {
          byRep[q.repId].pipeline += p.total || 0;
        }
      }

      if (margin >= floor + 5) marginBuckets.high++;
      else if (margin >= floor) marginBuckets.ok++;
      else if (margin >= floor - 3) marginBuckets.low++;
      else marginBuckets.leak++;
    });

    var avgMargin = quotes.length ? Math.round((marginSum / quotes.length) * 10) / 10 : 0;

    document.querySelector('[data-analytics-floor-label]') &&
      (document.querySelector('[data-analytics-floor-label]').textContent = floor + '%');

    var kpiMap = {
      pipeline: fmtMoney(metrics.pipelineTotal).replace('.00', ''),
      open: String(metrics.openCount),
      'win-rate': metrics.winRate + '%',
      'avg-margin': avgMargin + '%',
      'below-floor': String(belowFloor),
      portal: String(portalPending)
    };
    document.querySelectorAll('[data-analytics-kpi]').forEach(function (card) {
      var key = card.getAttribute('data-analytics-kpi');
      var val = card.querySelector('.value');
      if (val && kpiMap[key] != null) val.textContent = kpiMap[key];
      if (card.classList.contains('kpi-card--drill') && !card._analyticsDrillWired) {
        card._analyticsDrillWired = true;
        card.style.cursor = 'pointer';
        card.addEventListener('click', function () {
          if (key === 'pipeline' || key === 'open') location.href = 'quotes.html?view=open&from=analytics';
          else if (key === 'win-rate') location.href = 'quotes.html?status=converted&from=analytics';
          else if (key === 'below-floor') location.href = 'quotes.html?from=analytics&drill=Below%20margin%20floor';
          else if (key === 'portal') location.href = 'quotes.html?status=portal_request&from=analytics';
        });
      }
    });

    var monthKeys = Object.keys(byMonth).sort().slice(-6);
    var monthLabels = monthKeys.map(function (k) {
      var parts = k.split('-');
      var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return months[parseInt(parts[1], 10) - 1] || k;
    });
    renderAnalyticsBarChart(
      document.querySelector('[data-analytics-volume-chart]'),
      monthKeys.map(function (k, i) {
        return { label: monthLabels[i], value: byMonth[k].count, display: String(byMonth[k].count) };
      }),
      { subEl: document.querySelector('[data-analytics-volume-sub]'), subText: quotes.length + ' quotes in store' }
    );
    renderAnalyticsBarChart(
      document.querySelector('[data-analytics-margin-chart]'),
      monthKeys.map(function (k, i) {
        var avg = byMonth[k].count ? Math.round((byMonth[k].marginSum / byMonth[k].count) * 10) / 10 : 0;
        return { label: monthLabels[i], value: avg, display: avg + '%' };
      }),
      { subEl: document.querySelector('[data-analytics-margin-sub]'), subText: 'Floor ' + floor + '% · team avg ' + avgMargin + '%' }
    );

    renderStackedList(
      document.querySelector('[data-analytics-service-mix]'),
      Object.keys(byService).sort(function (a, b) { return byService[b].count - byService[a].count; }).map(function (svc) {
        var row = byService[svc];
        var avg = row.count ? Math.round((row.marginSum / row.count) * 10) / 10 : 0;
        return { label: serviceLabel(svc), value: row.count, display: row.count + ' · ' + avg + '% avg', cls: '' };
      })
    );

    var statusOrder = ['portal_request', 'draft', 'pending', 'approved', 'sent', 'converted', 'lost', 'expired'];
    renderStackedList(
      document.querySelector('[data-analytics-outcomes]'),
      statusOrder.filter(function (st) { return byStatus[st]; }).map(function (st) {
        var cls = st === 'converted' ? 'analytics-stacked-fill--green' : (st === 'lost' || st === 'expired' ? 'analytics-stacked-fill--red' : (st === 'pending' ? 'analytics-stacked-fill--amber' : ''));
        return {
          label: G().quoteStatusLabel(st),
          value: byStatus[st],
          display: String(byStatus[st]),
          cls: cls
        };
      })
    );

    renderStackedList(
      document.querySelector('[data-analytics-margin-buckets]'),
      [
        { label: 'Healthy (≥ floor + 5%)', value: marginBuckets.high, display: String(marginBuckets.high), cls: 'analytics-stacked-fill--green' },
        { label: 'At floor', value: marginBuckets.ok, display: String(marginBuckets.ok), cls: 'analytics-stacked-fill--teal' },
        { label: 'Watch (below floor)', value: marginBuckets.low, display: String(marginBuckets.low), cls: 'analytics-stacked-fill--amber' },
        { label: 'Leakage', value: marginBuckets.leak, display: String(marginBuckets.leak), cls: 'analytics-stacked-fill--red' }
      ]
    );

    var repTb = document.querySelector('[data-analytics-reps] tbody');
    if (repTb) {
      repTb.innerHTML = state.users.filter(function (u) {
        return u.role === 'Sales Rep' || u.role === 'Sales Manager';
      }).map(function (u) {
        var r = byRep[u.id] || { count: 0, won: 0, lost: 0, marginSum: 0, pipeline: 0 };
        var wr = r.won + r.lost > 0 ? Math.round((r.won / (r.won + r.lost)) * 100) : 0;
        var avg = r.count ? Math.round((r.marginSum / r.count) * 10) / 10 : 0;
        return '<tr data-drill-href="quotes.html?rep=' + encodeURIComponent(u.name) + '">' +
          '<td>' + u.name + '</td><td class="tabular">' + r.count + '</td><td class="tabular">' + wr + '%</td>' +
          '<td class="tabular">' + avg + '%</td><td class="tabular">' + fmtMoney(r.pipeline).replace('.00', '') + '</td></tr>';
      }).join('');
    }

    var tariffTb = document.querySelector('[data-analytics-tariffs] tbody');
    if (tariffTb) {
      tariffTb.innerHTML = Object.keys(byTariff).sort(function (a, b) {
        return byTariff[b].count - byTariff[a].count;
      }).map(function (tid) {
        var t = byTariff[tid];
        var tariff = S().getTariff(tid);
        var avg = t.count ? Math.round((t.marginSum / t.count) * 10) / 10 : 0;
        return '<tr data-drill-href="tariff-detail.html?id=' + encodeURIComponent(tid) + '">' +
          '<td><a href="tariff-detail.html?id=' + encodeURIComponent(tid) + '">' + (tariff ? tariff.name : tid) + '</a></td>' +
          '<td class="tabular">' + t.count + '</td><td class="tabular">' + avg + '%</td>' +
          '<td class="tabular">' + fmtMoney(t.revenue).replace('.00', '') + '</td></tr>';
      }).join('');
    }

    var lanes = {};
    quotes.forEach(function (q) {
      var key = laneKey(q);
      if (!lanes[key]) {
        lanes[key] = {
          lane: key,
          customer: custName(q.customerId),
          count: 0,
          marginSum: 0,
          totalSum: 0,
          pipeline: 0,
          service: q.primaryService || 'b2b'
        };
      }
      var p = S().computeQuotePricing(q);
      lanes[key].count++;
      lanes[key].marginSum += p.margin || 0;
      lanes[key].totalSum += p.total || 0;
      if (['draft', 'pending', 'approved', 'sent', 'portal_request'].indexOf(q.status) >= 0) {
        lanes[key].pipeline += p.total || 0;
      }
    });
    var laneRows = Object.keys(lanes).map(function (k) { return lanes[k]; });

    var customerSel = document.querySelector('#a-customer');
    if (customerSel && customerSel.options.length <= 1) {
      var names = {};
      laneRows.forEach(function (L) { names[L.customer] = true; });
      Object.keys(names).sort().forEach(function (n) {
        var o = document.createElement('option');
        o.value = n;
        o.textContent = n;
        customerSel.appendChild(o);
      });
    }
    var laneSel = document.querySelector('#a-lane');
    if (laneSel && laneSel.options.length <= 1) {
      laneRows.forEach(function (L) {
        var o = document.createElement('option');
        o.value = L.lane;
        o.textContent = L.lane;
        laneSel.appendChild(o);
      });
    }

    var tbody = document.querySelector('#analytics-lanes tbody');
    if (tbody) {
      tbody.innerHTML = laneRows.map(function (L) {
        var avgM = L.count ? Math.round((L.marginSum / L.count) * 10) / 10 : 0;
        var avgT = L.count ? Math.round(L.totalSum / L.count) : 0;
        return '<tr data-lane="' + L.lane + '" data-customer="' + L.customer + '" data-service="' + L.service + '" data-drill-href="quotes.html?customer=' + encodeURIComponent(L.customer) + '">' +
          '<td>' + L.lane + '</td><td>' + L.customer + '</td><td class="tabular">' + L.count + '</td>' +
          '<td class="tabular">' + avgM + '%</td><td class="tabular">' + fmtMoney(avgT).replace('.00', '') + '</td>' +
          '<td class="tabular">' + fmtMoney(L.pipeline).replace('.00', '') + '</td></tr>';
      }).join('');
      var count = document.querySelector('[data-filter-count]');
      if (count) count.textContent = 'Showing all ' + laneRows.length + ' lane records';
    }

    var leakTb = document.querySelector('[data-analytics-leakage] tbody');
    if (leakTb) {
      leakTb.innerHTML = leakage.length ? leakage.map(function (row) {
        return '<tr data-drill-href="quote-detail.html?id=' + encodeURIComponent(row.q.id) + '">' +
          '<td class="tabular"><a href="quote-detail.html?id=' + encodeURIComponent(row.q.id) + '">' + row.q.id + '</a></td>' +
          '<td>' + custName(row.q.customerId) + '</td><td class="tabular">' + row.margin + '%</td>' +
          '<td>' + G().quoteStatusLabel(row.q.status) + '</td></tr>';
      }).join('') : '<tr><td colspan="4" class="text-muted-sm">No quotes below floor in current data</td></tr>';
    }

    var excTb = document.querySelector('[data-analytics-exceptions] tbody');
    if (excTb) {
      excTb.innerHTML = exceptions.length ? exceptions.map(function (q) {
        var master = q.appliedTerms ? q.appliedTerms.customerDiscPctMaster : q.customerDiscPct;
        var effective = P() && P().getEffectiveCustomerDisc ? P().getEffectiveCustomerDisc(q) : q.customerDiscPct;
        return '<tr data-drill-href="quote-detail.html?id=' + encodeURIComponent(q.id) + '">' +
          '<td class="tabular"><a href="quote-detail.html?id=' + encodeURIComponent(q.id) + '">' + q.id + '</a></td>' +
          '<td class="tabular">' + (master != null ? master : '—') + '%</td><td class="tabular">' + effective + '%</td>' +
          '<td>' + G().quoteStatusLabel(q.status) + '</td></tr>';
      }).join('') : '<tr><td colspan="4" class="text-muted-sm">No discount exceptions in current data</td></tr>';
    }

    global.dispatchEvent(new CustomEvent('awest:filter-refresh'));
    if (global.AwestMockup && global.AwestMockup.initDrilldownRows) {
      global.AwestMockup.initDrilldownRows();
    }
  }

  /* ── Phase 5: Portal ── */
  function hydratePortalSelfService() {
    if (pageName() !== 'portal-self-service') return;
    var cid = S().getState().portal.activeCustomerId;
    var addrs = S().getState().portal.addresses.filter(function (a) { return a.customerId === cid; });
    var comms = S().getState().portal.commodities.filter(function (c) { return c.customerId === cid; });
    var tickets = S().getState().portal.supportTickets.filter(function (t) { return t.customerId === cid; });

    var addrUl = document.querySelector('[data-portal-addresses]');
    if (addrUl) {
      addrUl.innerHTML = addrs.map(function (a) {
        return '<li>' + a.label + ' — ' + a.lines + (a.default ? ' <span class="badge badge-active">Default</span>' : '') + '</li>';
      }).join('') || '<li>No addresses — <a href="portal-add-address.html">Add one</a></li>';
    } else {
      document.querySelectorAll('.card ul, .portal-list').forEach(function (ul, i) {
        if (i === 0) {
          ul.innerHTML = addrs.map(function (a) {
            return '<li>' + a.label + ' — ' + a.lines + (a.default ? ' <span class="badge badge-active">Default</span>' : '') + '</li>';
          }).join('') || '<li>No addresses — <a href="portal-add-address.html">Add one</a></li>';
        }
      });
    }

    var commUl = document.querySelector('[data-portal-commodities]');
    if (commUl) {
      commUl.innerHTML = comms.map(function (c) {
        return '<li>' + c.name + ' — ' + (c.classCode || 'FAK') + (c.nmfc ? ' · NMFC ' + c.nmfc : '') + '</li>';
      }).join('') || '<li>No saved commodities — <a href="portal-add-commodity.html">Add one</a></li>';
    } else {
      document.querySelectorAll('.card').forEach(function (card) {
        var h = card.querySelector('h3, h2, .panel-title');
        if (h && /commodit/i.test(h.textContent)) {
          var ul = card.querySelector('ul');
          if (ul) {
            ul.innerHTML = comms.map(function (c) {
              return '<li>' + c.name + ' — ' + (c.classCode || 'FAK') + '</li>';
            }).join('') || '<li>No saved commodities — <a href="portal-add-commodity.html">Add one</a></li>';
          }
        }
      });
    }

    var tables = document.querySelectorAll('.data-table tbody');
    if (tables[0]) {
      tables[0].innerHTML = tickets.map(function (t) {
        return '<tr><td>' + t.subject + '</td><td><span class="badge">' + t.status + '</span></td><td class="tabular">' + fmtDate(t.createdAt) + '</td></tr>';
      }).join('') || '<tr><td colspan="3">No tickets</td></tr>';
    }

    wirePortalAccountLabel();
  }

  function hydratePortalAddAddress() {
    /* save: demo-crud.js */
  }

  function hydratePortalAddCommodity() {
    /* save: demo-crud.js */
  }

  function hydratePortalPod() {
    if (pageName() !== 'portal-pod') return;
    var shId = getQuery('id') || 'SH-8790';
    var sh = S().getShipment(shId);
    if (!sh) return;
    document.querySelectorAll('h1, .portal-page-title').forEach(function (h) {
      if (/POD|Proof/.test(h.textContent)) h.textContent = 'Proof of Delivery — ' + sh.id;
    });
    var p = document.querySelector('.card p');
    if (p) p.textContent = sh.origin + ' → ' + sh.destination + ' · Delivered ' + (sh.eta || '');
  }

  function hydratePortalPricingHelp() {
    if (pageName() !== 'portal-pricing-help') return;
    var s = S().getState().settings;
    var fuelPct = S().getState().reference.fuel.slice(-1)[0];
    var portalCfg = s.portalQuote || {};
    document.querySelectorAll('.card p, .help-block').forEach(function (p) {
      if (p.textContent.indexOf('discount') >= 0) {
        var c = S().getCustomer(S().getState().portal.activeCustomerId);
        if (c) p.innerHTML = p.innerHTML.replace(/[\d.]+%/, c.overallDiscPct + '%');
      }
      if (p.textContent.indexOf('fuel') >= 0 && fuelPct) {
        p.innerHTML = p.innerHTML.replace(/[\d.]+%/g, fuelPct.pct + '%');
      }
    });
    document.querySelectorAll('[data-portal-insurance-example]').forEach(function (el) {
      if (!P()) return;
      var dv = portalCfg.declaredValue || 18000;
      var ins = P().computeInsurance(dv);
      el.innerHTML = 'When you enter a declared value, your quote includes an <strong>insurance charge of 1% of declared value, with a $25 minimum</strong>. If declared value is $0, no insurance charge is added.';
      var ex = el.parentElement && el.parentElement.querySelector('[data-portal-insurance-sample]');
      if (ex) ex.innerHTML = '<strong>Example:</strong> ' + fmtMoney(dv) + ' declared value → 1% = ' + fmtMoney(ins) + ' insurance (above the $25 floor).';
    });
  }

  function hydratePortalQuoteRequestFull() {
    if (pageName() !== 'portal-quote-request') return;
    var state = S().getState();
    var cfg = state.settings.portalQuote || {};
    var weightEl = document.querySelector('[data-shipment-weight]');
    var cubeEl = document.querySelector('[data-shipment-cube]');
    var dvEl = document.querySelector('[data-declared-value]');
    var originEl = document.querySelector('[data-portal-origin]');
    var destEl = document.querySelector('[data-portal-destination]');
    var routeNote = document.querySelector('[data-portal-route-note]');
    var tierSummary = document.querySelector('[data-portal-tier-summary]');
    var tierCards = document.querySelectorAll('.service-tier-card[data-tier-id]');
    var submitBtn = document.querySelector('[data-portal-submit]');
    var selectedTier = 'wgi';
    var tierLabels = {
      threshold: 'Threshold',
      wgni: 'White Glove No Inspection',
      wgi: 'White Glove Inspection'
    };

    function parseVal(el, fallback) {
      return P() ? P().parseNumericInput(el, fallback) : fallback;
    }

    function syncSummary() {
      var origin = parsePortalLocation(originEl ? originEl.value : 'High Point, NC 27260');
      var dest = parsePortalLocation(destEl ? destEl.value : 'Anderson, SC 29621');
      if (routeNote) {
        var oCode = origin.zip ? origin.zip.slice(0, 3) : '272';
        var dCode = dest.zip ? dest.zip.slice(0, 3) : '296';
        routeNote.textContent = oCode + ' → ' + dCode;
      }
      if (tierSummary) {
        tierSummary.textContent = 'Preferred service: ' + (tierLabels[selectedTier] || selectedTier);
      }
    }

    tierCards.forEach(function (card) {
      card.addEventListener('click', function () {
        selectedTier = card.getAttribute('data-tier-id') || 'wgi';
        tierCards.forEach(function (c) { c.classList.remove('is-recommended'); });
        card.classList.add('is-recommended');
        syncSummary();
      });
    });

    [weightEl, cubeEl, dvEl, originEl, destEl].forEach(function (el) {
      if (!el || el._portalSummaryWired) return;
      el._portalSummaryWired = true;
      el.addEventListener('input', syncSummary);
      el.addEventListener('change', syncSummary);
    });

    if (submitBtn && !submitBtn._wired) {
      submitBtn._wired = true;
      submitBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var weight = parseVal(weightEl, cfg.weight || 2400);
        var cube = parseVal(cubeEl, cfg.cube || 520);
        var dv = parseVal(dvEl, cfg.declaredValue || 18000);
        var origin = parsePortalLocation(originEl ? originEl.value : '');
        var dest = parsePortalLocation(destEl ? destEl.value : '');
        var q = S().createPortalQuote({
          customerId: state.portal.activeCustomerId,
          origin: origin.label || origin.cityState,
          destination: dest.label || dest.cityState,
          pickupZip: origin.zip || '27260',
          deliveryZip: dest.zip || '29621',
          weight: weight,
          cube: cube,
          declaredValue: dv,
          preferredService: selectedTier,
          primaryService: selectedTier,
          serviceFamily: 'hd'
        });
        location.href = 'portal-quote-confirmation.html?id=' + encodeURIComponent(q.id);
      });
    }

    wirePortalAccountLabel();
    if (weightEl && !weightEl.value) weightEl.value = String(cfg.weight || 2400);
    if (cubeEl && !cubeEl.value) cubeEl.value = String(cfg.cube || 520);
    if (dvEl && !dvEl.value) dvEl.value = String(cfg.declaredValue || 18000);
    syncSummary();
  }

  function hydrateTariffCompetitorFull() {
    if (pageName() !== 'tariff-competitor-comparison') return;
    var id = getQuery('id') || getQuery('quote') || 'Q-2026-0823';
    var q = S().getQuote(id);
    if (!q || !P()) return;
    var p = S().computeQuotePricing(q);
    var meta = P().pricingMetaFromQuote(q);
    var awMount = document.querySelector('[data-competitor-aw]');
    if (awMount) awMount.innerHTML = P().renderPricingBreakdown(p, false, meta);
    var compInput = document.querySelector('[data-competitor-rate]');
    var deltaEl = document.querySelector('[data-competitor-delta]');
    function refreshDelta() {
      if (!deltaEl) return;
      var comp = P().parseNumericInput(compInput, 0);
      if (!comp) {
        deltaEl.textContent = 'Enter competitor rate to compare';
        return;
      }
      var delta = p.total - comp;
      var pct = comp ? Math.round((delta / comp) * 1000) / 10 : 0;
      deltaEl.textContent = (delta >= 0 ? '+' : '−') + fmtMoney(Math.abs(delta)) + ' (' + (delta >= 0 ? '+' : '−') + Math.abs(pct) + '%) — AW rate is ' + (delta >= 0 ? 'higher' : 'lower');
    }
    if (compInput) {
      P().bindNumericInput(compInput, refreshDelta);
      refreshDelta();
    }
    document.querySelectorAll('a[href="quote-builder.html"]').forEach(function (a) {
      a.href = 'quote-builder.html?id=' + encodeURIComponent(id);
    });
  }

  function hydrateTariffDetailFull() {
    if (pageName() !== 'tariff-detail') return;
    var id = getQuery('id') || 'TAR-B2B-BASE';
    var t = S().getTariff(id);
    if (!t) return;
    var cfg = t.config || {};
    var D = dummyTariff();
    var statusClass = t.status === 'active' ? 'badge-active' : (t.status === 'draft' ? 'badge-draft' : 'badge-pending');
    var detailUrl = 'tariff-detail.html?id=' + encodeURIComponent(id);
    var matrixUrl = 'tariff-rate-matrix.html?id=' + encodeURIComponent(id);

    document.title = t.id + ' — Tariff Detail — American West';
    var h1 = document.querySelector('[data-tariff-id]');
    if (h1) h1.textContent = t.id;
    var nameInput = document.querySelector('[data-tariff-name]');
    if (nameInput) nameInput.value = t.name;
    var subtitle = document.querySelector('[data-tariff-subtitle]');
    if (subtitle) subtitle.textContent = t.name;
    var statusEl = document.querySelector('[data-tariff-status]');
    if (statusEl) {
      statusEl.textContent = t.status.charAt(0).toUpperCase() + t.status.slice(1);
      statusEl.className = 'badge ' + statusClass;
    }
    var versionEl = document.querySelector('[data-tariff-version]');
    if (versionEl) versionEl.textContent = 'v' + (t.version || 1);
    var inheritEl = document.querySelector('[data-tariff-inherit-note]');
    if (inheritEl) {
      if (t.parentTariffId) {
        inheritEl.innerHTML = '<strong>Inherits from:</strong> <a href="tariff-detail.html?id=' +
          encodeURIComponent(t.parentTariffId) + '">' + t.parentTariffId +
          '</a> — rate matrix merges from parent; cells saved here override at quote time.';
      } else if (t.type === 'Base') {
        inheritEl.textContent = 'Base tariff — published rate schedule for this service type. Customer discounts and quote adjustments apply at quote time.';
      } else {
        inheritEl.hidden = true;
      }
    }
    var descInput = document.querySelector('[data-tariff-description]');
    if (descInput) descInput.value = cfg.description || t.name;
    var startInput = document.querySelector('[data-tariff-effective-start]');
    if (startInput) startInput.value = t.effectiveDate || '';
    var endInput = document.querySelector('[data-tariff-effective-end]');
    if (endInput) endInput.value = cfg.effectiveEnd || '';

    document.querySelectorAll('[data-tariff-matrix-link]').forEach(function (a) {
      a.href = matrixUrl;
    });
    document.querySelectorAll('[data-tariff-clone-link]').forEach(function (a) {
      a.href = 'tariff-wizard.html?clone=' + encodeURIComponent(id);
    });
    document.querySelectorAll('[data-tariff-delete-link]').forEach(function (a) {
      a.href = 'tariff-delete-confirm.html?id=' + encodeURIComponent(id);
    });
    document.querySelectorAll('[data-tariff-add-rule-link]').forEach(function (a) {
      a.href = 'tariff-add-override.html?id=' + encodeURIComponent(id);
    });

    document.querySelectorAll('[data-base-rate-field]').forEach(function (el) {
      var n = cfg.baseRateCwt != null ? cfg.baseRateCwt : D.baseRateCwt;
      el.value = String(n);
    });
    document.querySelectorAll('[data-tariff-base-rate-display]').forEach(function (el) {
      el.textContent = fmtMoney(cfg.baseRateCwt || D.baseRateCwt) + ' / CWT — national default';
    });
    document.querySelectorAll('[data-minimum-charge-field]').forEach(function (el) {
      el.value = String(cfg.minimumCharge != null ? cfg.minimumCharge : D.minimumChargeTariff);
    });
    document.querySelectorAll('[data-tariff-min-charge]').forEach(function (el) {
      var text = fmtMoney(cfg.minimumCharge || D.minimumChargeTariff) + ' minimum charge';
      if (el.tagName === 'TD') el.textContent = text;
      else el.textContent = text;
    });
    document.querySelectorAll('[data-margin-field]').forEach(function (el) {
      el.value = String(cfg.marginFloorPct != null ? cfg.marginFloorPct : 15);
    });
    document.querySelectorAll('[data-density-input]').forEach(function (el) {
      el.value = String(cfg.density != null ? cfg.density : 8.5);
    });
    document.querySelectorAll('[data-lane-field]').forEach(function (el) {
      el.value = cfg.rateTableLabel || 'National B2B Matrix';
    });
    document.querySelectorAll('[data-tariff-audit-base]').forEach(function (el) {
      el.textContent = fmtMoney(cfg.priorBaseRateCwt || D.priorBaseRateCwt) + ' → ' + fmtMoney(cfg.baseRateCwt || D.baseRateCwt);
    });

    var serviceSelect = document.querySelector('[data-service-select]');
    var uomSelect = document.querySelector('[data-uom-select]');
    var overviewRoot = document.querySelector('[data-tariff-overview]');
    if (serviceSelect) {
      var svcVal = 'b2b';
      var svc = String(t.service || '').toLowerCase();
      if (svc.indexOf('threshold') >= 0) svcVal = 'threshold';
      else if (svc.indexOf('no insp') >= 0 || svc.indexOf('wgni') >= 0) svcVal = 'wg-no-insp';
      else if (svc.indexOf('inspection') >= 0 || svc.indexOf('wgi') >= 0) svcVal = 'wg-insp';
      serviceSelect.value = svcVal;
    }
    if (uomSelect) {
      uomSelect.value = String(t.uom || 'CWT').toLowerCase();
    }
    if (overviewRoot) overviewRoot.setAttribute('data-tariff-store-hydrated', '1');

    /* baseline rules table: demo-crud.js hydrateTariffBaselineCrud */

    var historyAcc = document.querySelector('[data-tariff-history-accordion]');
    if (historyAcc) {
      var hash = (location.hash || '').replace(/^#/, '').toLowerCase();
      if (hash === 'panel-history' || hash === 'versions' || hash === 'audit' ||
          hash === 'panel-versions' || hash === 'panel-audit') {
        historyAcc.open = true;
        requestAnimationFrame(function () {
          var target = hash === 'versions' || hash === 'panel-versions'
            ? document.getElementById('panel-versions')
            : (hash === 'audit' || hash === 'panel-audit'
              ? document.getElementById('panel-audit')
              : historyAcc);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    }
  }

  function hydrateTariffComparisonFull() {
    if (pageName() !== 'tariff-comparison') return;
    var td = S().getState().settings.tariffDisplay || {};
    var D = dummyTariff();
    document.querySelectorAll('[data-tariff-rate-new]').forEach(function (el) {
      el.textContent = fmtMoney(td.baseRateCwt || D.baseRateCwt) + '/CWT';
    });
    document.querySelectorAll('[data-tariff-rate-old]').forEach(function (el) {
      el.textContent = fmtMoney(td.priorBaseRateCwt || D.priorBaseRateCwt) + '/CWT';
    });
    var delta = td.baseRateCwt && td.priorBaseRateCwt
      ? Math.round(((td.baseRateCwt - td.priorBaseRateCwt) / td.priorBaseRateCwt) * 1000) / 10
      : 0;
    document.querySelectorAll('[data-tariff-rate-change]').forEach(function (el) {
      el.textContent = 'Base rate increased from ' + fmtMoney(td.priorBaseRateCwt) + ' to ' + fmtMoney(td.baseRateCwt) + ' (+' + delta + '%)';
    });
  }

  function hydratePortalDashboardFull() {
    if (pageName() !== 'portal-dashboard' && pageName() !== 'portal-self-service') return;
    var state = S().getState();
    var cid = state.portal.activeCustomerId;
    var cust = S().getCustomer(cid);
    var welcome = document.querySelector('[data-portal-welcome]');
    if (welcome && cust) welcome.textContent = 'Welcome back, ' + cust.name;

    var portalQuotes = state.quotes.filter(function (q) {
      return S().isPortalCustomerVisibleQuote(q, cid);
    });
    var pending = portalQuotes.filter(function (q) { return q.status === 'portal_request'; });
    var ready = portalQuotes.filter(function (q) {
      return q.portalVisible && q.status === 'sent';
    });

    var notice = document.querySelector('[data-portal-notice]');
    if (notice) {
      if (ready.length) {
        notice.hidden = false;
        notice.innerHTML = '<strong>Quote ready:</strong> American West sent ' + ready.length + ' finalized quote' + (ready.length === 1 ? '' : 's') + ' — see Recent Activity below.';
      } else if (pending.length) {
        notice.hidden = false;
        notice.className = 'portal-notice portal-notice--pending';
        notice.innerHTML = '<strong>Request received:</strong> ' + pending.length + ' quote request' + (pending.length === 1 ? ' is' : 's are') + ' with your sales rep for pricing.';
      } else {
        notice.hidden = true;
      }
    }

    var activity = document.querySelector('[data-portal-activity]');
    var quotesTable = document.querySelector('[data-portal-quotes-table] tbody');
    if (quotesTable) {
      var sortedQuotes = portalQuotes.slice().sort(function (a, b) {
        return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
      });
      if (!sortedQuotes.length) {
        quotesTable.innerHTML = '<tr><td colspan="5">No quotes yet — <a href="portal-quote-request.html">Request a quote</a></td></tr>';
      } else {
        quotesTable.innerHTML = sortedQuotes.map(function (q) {
          var statusLabel = q.status === 'portal_request'
            ? 'Awaiting pricing'
            : (q.status === 'sent' ? 'Ready' : (G().quoteStatusLabel ? G().quoteStatusLabel(q.status) : q.status));
          var totalCell = q.status === 'portal_request'
            ? '—'
            : fmtMoney(quotePricing(q).total || 0);
          var detailHref = 'portal-quote-confirmation.html?id=' + encodeURIComponent(q.id);
          return '<tr data-drill-href="' + detailHref + '">' +
            '<td class="tabular"><a href="' + detailHref + '">' + q.id + '</a></td>' +
            '<td>' + laneLabel(q) + '</td>' +
            '<td><span class="badge badge-' + (q.status === 'portal_request' ? 'portal_request' : q.status) + '">' + statusLabel + '</span></td>' +
            '<td class="tabular">' + totalCell + '</td>' +
            '<td class="tabular">' + fmtDate(q.portalSubmittedAt || q.updatedAt || q.createdAt) + '</td></tr>';
        }).join('');
      }
    }
    if (activity) {
      var items = [];
      portalQuotes.slice().sort(function (a, b) {
        return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
      }).forEach(function (q) {
        var when = fmtDate(q.portalSubmittedAt || q.updatedAt || q.createdAt);
        if (q.status === 'portal_request') {
          items.push('<li><span>Quote request <a href="portal-quote-confirmation.html?id=' + encodeURIComponent(q.id) + '">' + q.id + '</a> sent to American West · ' + laneLabel(q) + '</span><span class="tabular" style="color:var(--neutral-600)">' + when + '</span></li>');
        } else if (q.portalVisible && q.status === 'sent') {
          var p = quotePricing(q);
          items.push('<li><span><a href="portal-quote-confirmation.html?id=' + encodeURIComponent(q.id) + '">Quote ' + q.id + ' ready</a> · ' + fmtMoney(p.total || 0) + '</span><span class="tabular" style="color:var(--neutral-600)">' + when + '</span></li>');
        }
      });
      state.shipments.filter(function (sh) { return sh.customerId === cid; }).slice(0, 3).forEach(function (sh) {
        items.push('<li><span>Shipment ' + sh.id + ' · ' + sh.status + '</span><span class="tabular" style="color:var(--neutral-600)">' + fmtDate(sh.updatedAt || sh.createdAt) + '</span></li>');
      });
      activity.innerHTML = items.length
        ? items.join('')
        : '<li><span>No recent activity</span></li>';
    }
  }

  function laneLabel(q) {
    return (q.origin || 'Origin') + ' → ' + (q.destination || 'Destination');
  }

  function quotePricing(q) {
    return S().computeQuotePricing(q);
  }

  function wirePortalAccountLabel() {
    var c = S().getCustomer(S().getState().portal.activeCustomerId);
    if (!c) return;
    document.querySelectorAll('.portal-account, .dropdown-trigger').forEach(function (el) {
      if (el.textContent.indexOf('▾') >= 0) el.textContent = c.name + ' ▾';
    });
    document.querySelectorAll('[data-dropdown-select]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-dropdown-select') === c.name);
    });
  }

  /* ── Phase 6: CRM ── */
  function hydrateCrmDashboardFull() {
    if (pageName() !== 'crm-dashboard') return;
    var metrics = S().getMetrics();
    var aging = S().getAvgQuoteAging();
    var board = S().getRepLeaderboard();

    document.querySelectorAll('.kpi-row .value').forEach(function (el, i) {
      if (i === 0) el.textContent = fmtMoney(metrics.pipelineTotal).replace('.00', '');
      if (i === 1) el.textContent = metrics.winRate + '%';
      if (i === 2) el.textContent = aging + ' days';
    });

    var lead = document.querySelector('.page-lead');
    if (lead) {
      var active = S().getState().quotes.filter(function (q) {
        return q.status !== 'lost' && q.status !== 'expired' && q.status !== 'converted' && q.status !== 'accepted';
      }).length;
      lead.textContent = 'Sales Pipeline · ' + active + ' active opportunities';
    }

    var repTb = document.querySelector('.data-table tbody');
    if (repTb) {
      repTb.innerHTML = board.map(function (r) {
        return '<tr data-drill-href="../internal/quotes.html?rep=' + encodeURIComponent(r.user.name) + '"><td>' + r.user.name + '</td><td class="tabular">' + r.quoteCount + '</td><td class="tabular">' + r.winRate + '%</td></tr>';
      }).join('');
    }

    var followUps = S().getState().crm.followUps;
    var ul = document.querySelector('[data-followup-list]') || document.querySelector('.card ul');
    if (ul) {
      ul.innerHTML = followUps.map(function (fu) {
        var q = S().getQuote(fu.quoteId);
        return '<li><a href="../internal/quote-detail.html?id=' + encodeURIComponent(fu.quoteId) + '" class="drill-list-item"><strong>' + fu.quoteId + '</strong> — ' + (q ? custName(q.customerId) : '') + ' · ' + fu.note + '</a></li>';
      }).join('') || '<li>No follow-ups scheduled</li>';
    }
    var fuCount = document.querySelector('[data-followup-count]');
    if (fuCount) fuCount.textContent = followUps.length + ' item' + (followUps.length === 1 ? '' : 's');
  }

  function hydrateCrmKanbanDrag() {
    if (pageName() !== 'crm-opportunities') return;
    document.querySelectorAll('.kanban-col').forEach(function (col) {
      var stage = col.getAttribute('data-stage');
      if (!stage || col._stageWired) return;
      col._stageWired = true;
      col.addEventListener('click', function (e) {
        var card = e.target.closest('.kanban-card');
        if (!card || e.shiftKey !== true) return;
        e.preventDefault();
        var id = (card.querySelector('strong') || {}).textContent;
        if (id && window.confirm('Move ' + id + ' to ' + stage + '?')) {
          S().setQuoteStatus(id, stage);
          location.reload();
        }
      });
    });
    var hint = document.querySelector('.page-header');
    if (hint && !document.querySelector('[data-kanban-hint]')) {
      var p = document.createElement('p');
      p.className = 'text-muted-sm';
      p.setAttribute('data-kanban-hint', '');
      p.textContent = 'Click a card to open the quote. Shift+click a card to move it to that column\'s stage.';
      hint.appendChild(p);
    }
  }

  /* ── Phase 7: Admin + auth ── */
  function hydrateAdminInvite() {
    /* save: demo-crud.js */
  }

  function hydrateAdminUserEdit() {
    if (pageName() !== 'admin-user-edit') return;
    var id = getQuery('id');
    var u = id ? S().getUser(id) : S().getCurrentUser();
    if (!u) return;
    document.querySelectorAll('.field input, .field select').forEach(function (input) {
      var label = input.closest('.field') && input.closest('.field').querySelector('label');
      if (!label) return;
      var t = label.textContent.toLowerCase();
      if (t.indexOf('name') >= 0) input.value = u.name;
      if (t.indexOf('email') >= 0) input.value = u.email;
      if (t.indexOf('role') >= 0) input.value = u.role;
    });
    /* save: demo-crud.js */
  }

  function hydrateAdminLists() {
    if (pageName() === 'admin-list-management') {
      var lists = S().getState().validationLists;
      var tbody = document.querySelector('.data-table tbody');
      if (tbody) {
        var rows = [];
        ['origins', 'commodities', 'uoms'].forEach(function (key) {
          (lists[key] || []).forEach(function (val) {
            rows.push('<tr><td>' + key + '</td><td>' + val + '</td><td class="actions"><a href="admin-list-edit.html?list=' + key + '&value=' + encodeURIComponent(val) + '">Edit</a></td></tr>');
          });
        });
        tbody.innerHTML = rows.join('');
      }
    }
    /* admin-list-edit + agreement template save: demo-crud.js */
  }

  function hydrateForgotPassword() {
    if (pageName() !== 'forgot-password') return;
    wireSaveLink('.btn-primary', function () {
      alert('Password reset email sent (simulated).');
      location.href = 'login.html';
    });
  }

  function applyRoleGates() {
    var user = S().getCurrentUser();
    if (!user) return;
    if (!G().canEditTariff(S().getState())) {
      document.querySelectorAll('a[href*="tariff-wizard"], a[href*="admin-users"]').forEach(function (a) {
        if (user.role === 'Sales Rep') a.style.opacity = '0.5';
      });
    }
  }

  function hydrateReferenceLanes() {
    if (pageName() === 'reference-lanes' || pageName() === 'reference-lanes-b2b') {
      var col = 'b2bLanes';
      var tbody = document.querySelector('.data-table tbody');
      if (!tbody) return;
      var items = S().getState().reference[col] || [];
      tbody.innerHTML = items.map(function (item) {
        return '<tr><td class="tabular">' + item.baseZip + '</td><td>' + item.description + '</td><td>' + (item.originStation || '—') + '</td><td class="actions"><a href="reference-lane-b2b-edit.html?id=' + encodeURIComponent(item.id) + '">Edit</a></td></tr>';
      }).join('');
    }
  }

  var EXT_ROUTES = [
    hydrateQuoteComparison,
    hydrateQuoteBuilder,
    hydrateQuoteDetailActions,
    hydrateQuoteEsignFull,
    hydrateQuotePdfFull,
    hydrateQuoteTmsPage,
    hydrateTariffWizard,
    hydrateTariffConfirm,
    hydrateTariffComparison,
    hydrateCustomerDetailFull,
    hydrateReferenceHub,
    hydrateReferenceLanes,
    hydrateReferenceFuelHistory,
    hydrateReferenceEditPages,
    hydrateReferenceTmsMapping,
    hydrateAnalyticsFull,
    hydratePortalSelfService,
    hydratePortalAddAddress,
    hydratePortalAddCommodity,
    hydratePortalPod,
    hydratePortalPricingHelp,
    hydratePortalQuoteRequestFull,
    hydratePortalDashboardFull,
    hydrateTariffCompetitorFull,
    hydrateTariffDetailFull,
    hydrateTariffComparisonFull,
    hydrateCrmDashboardFull,
    hydrateCrmKanbanDrag,
    hydrateAdminInvite,
    hydrateAdminUserEdit,
    hydrateAdminLists,
    hydrateForgotPassword,
    applyRoleGates,
    wirePortalAccountLabel
  ];

  function runExt() {
    if (!S()) return;
    EXT_ROUTES.forEach(function (fn) { try { fn(); } catch (e) { console.warn('hydrate ext:', e); } });
    if (global.AwestDemoCrud) global.AwestDemoCrud.run();
  }

  var origRun = H.run;
  H.run = function () {
    origRun();
    runExt();
  };

  var origRerun = H.rerun;
  H.rerun = function () {
    origRerun();
    runExt();
  };

  global.AwestDemoHydratePages = { run: runExt };
})(typeof window !== 'undefined' ? window : this);
