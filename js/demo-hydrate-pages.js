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
      var p = q.pricing || {};
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
      if (diffEl && l && r && l.pricing && r.pricing) {
        var delta = r.pricing.total - l.pricing.total;
        var pct = l.pricing.total ? Math.round((delta / l.pricing.total) * 1000) / 10 : 0;
        diffEl.innerHTML = '<li>Total ' + (delta >= 0 ? 'increased' : 'decreased') + ' by ' + fmtMoney(Math.abs(delta)) + ' (' + (delta >= 0 ? '+' : '−') + Math.abs(pct) + '%)</li>' +
          '<li>Margin: ' + l.pricing.margin + '% → ' + r.pricing.margin + '%</li>' +
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
    var customerId = q && q.customerId ? q.customerId : 'PACI-1200';
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
      }
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
    var p = q.pricing || {};
    var state = S().getState();

    var lifecycleLabels = {
      draft: 'Draft', pending: 'Pending Approval', approved: 'Approved',
      sent: 'Sent', accepted: 'Accepted', converted: 'Booked', lost: 'Lost'
    };
    var nextStepText = {
      draft: 'Next step: finalize the quote or submit for manager approval if discounts exceed your authority.',
      pending: 'Next step: a Sales Manager approves or rejects this quote.',
      approved: 'Next step: generate a PDF and send the quote to the customer.',
      sent: 'Next step: customer accepts the quote, or mark as lost if they decline.',
      accepted: 'Next step: send to dispatch to book the shipment.',
      converted: 'This quote is booked — the shipment can be tracked in the customer portal.',
      lost: 'This opportunity was marked lost. Create a new quote if the customer returns.'
    };

    var stepper = document.querySelector('[data-quote-lifecycle]') || document.querySelector('.stepper');
    if (stepper) {
      var steps = q.status === 'lost'
        ? ['draft', 'pending', 'lost']
        : ['draft', 'pending', 'approved', 'sent', 'accepted', 'converted'];
      var idx = steps.indexOf(q.status);
      if (q.status === 'converted') idx = 5;
      stepper.innerHTML = steps.map(function (st, i) {
        var cls = 'step';
        if (i < idx) cls += ' done';
        if (st === q.status || i === idx) cls += ' active';
        return '<span class="' + cls + '">' + (lifecycleLabels[st] || st) + '</span>' +
          (i < steps.length - 1 ? '<span class="arrow">→</span>' : '');
      }).join('');
    }

    var nextEl = document.querySelector('[data-quote-next-step]');
    if (nextEl) nextEl.textContent = nextStepText[q.status] || '';

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
        sendBtn.textContent = 'Mark as Sent';
        sendBtn.addEventListener('click', function () { S().sendQuote(id); location.reload(); });
        actions.insertBefore(sendBtn, actions.firstChild);
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

    wireSaveLink('.btn-primary', function () {
      if (!q.artifacts.pdf.generatedAt) {
        alert('Generate PDF before sending for e-signature.');
        return;
      }
      S().sendEsign(id);
      alert('Sent for e-signature (simulated).');
      location.reload();
    });

    document.querySelectorAll('.btn-secondary').forEach(function (btn) {
      if (btn._wired || btn.textContent.indexOf('Sign') < 0 && btn.textContent.indexOf('Decline') < 0) return;
      btn._wired = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        if (btn.textContent.indexOf('Sign') >= 0) {
          S().signEsign(id);
          alert('Signed (simulated).');
        } else {
          S().declineEsign(id);
          alert('Declined (simulated).');
        }
        location.reload();
      });
    });
  }

  function hydrateQuotePdfFull() {
    if (pageName() !== 'quote-pdf') return;
    var id = getQuery('id') || 'Q-2026-0823';
    var q = S().getQuote(id);
    if (!q) return;
    var p = q.pricing || {};
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
    var dl = document.querySelector('.btn-primary');
    if (dl && !dl._wired) {
      dl._wired = true;
      dl.addEventListener('click', function (e) {
        e.preventDefault();
        S().generatePdf(id);
        alert('PDF generated for ' + id + ' (simulated).');
        location.href = 'quote-detail.html?id=' + encodeURIComponent(id);
      });
    }
  }

  function hydrateQuoteTmsPage() {
    if (pageName() !== 'quote-tms-export') return;
    var id = getQuery('id') || 'Q-2026-0823';
    var q = S().getQuote(id);
    if (!q) return;
    var card = document.querySelector('.card');
    if (q.artifacts.tmsExport.status === 'success') {
      if (card) {
        card.querySelector('p').innerHTML = q.id + ' exported as <strong>' + q.id.replace(/-/g, '_') + '_TMS.xlsx</strong> — normalized via <a href="reference-tms-mapping.html">TMS rate-key mapping</a>.';
      }
    } else {
      if (card) {
        card.innerHTML = '<h2 class="panel-heading">Export to TMS</h2><p style="margin:var(--space-md) 0">Quote ' + q.id + ' · Total ' + fmtMoney((q.pricing && q.pricing.total) || 0) + '</p>' +
          '<button type="button" class="btn btn-primary" data-tms-run>Run export</button>';
        var btn = card.querySelector('[data-tms-run]');
        if (btn) btn.addEventListener('click', function () {
          S().exportTms(id);
          location.reload();
        });
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
    var baseInput = document.getElementById('tw-base');
    if (baseInput) baseInput.value = fmtMoney(td.baseRateCwt || 58);
    document.querySelectorAll('[data-wizard-base-summary]').forEach(function (el) {
      el.textContent = 'CWT · ' + fmtMoney(td.baseRateCwt || 58) + ' base · min density 6.0';
    });
      wireSaveLink('.btn-primary, a.btn-primary', function () {
      var nameInput = document.querySelector('.wizard-step.active input, .field input, input[type="text"]');
      var name = nameInput ? nameInput.value : 'New Tariff';
      var id = 'TAR-' + Date.now().toString(36).slice(-6).toUpperCase();
      S().saveTariff({
        id: id, name: name || 'New Tariff', type: 'Base', service: 'B2B', uom: 'CWT',
        customerId: null, status: 'draft', effectiveDate: new Date().toISOString().slice(0, 10), version: 1, parentTariffId: null
      });
      location.href = 'tariff-detail.html?id=' + encodeURIComponent(id);
    });
  }

  function hydrateTariffConfirm() {
    var name = pageName();
    if (name === 'tariff-delete-confirm') {
      wireSaveLink('.btn-burgundy, .btn-primary', function () {
        var id = getQuery('id') || 'TAR-SPOT-001';
        S().deleteTariff(id);
        location.href = 'tariffs.html';
      });
    }
    if (name === 'tariff-rollback-confirm') {
      wireSaveLink('.btn-primary', function () {
        S().rollbackTariff(getQuery('id') || 'TAR-B2B-BASE');
        location.href = 'tariff-detail.html?id=' + encodeURIComponent(getQuery('id') || 'TAR-B2B-BASE');
      });
    }
    if (name === 'tariff-add-override') {
      wireSaveLink('.btn-primary', function () {
        S().saveTariffOverride({
          tariffId: getQuery('id') || 'TAR-B2B-BASE',
          level: 'customer',
          customerId: getQuery('customer') || 'PACI-1200',
          adjustments: { pct: -2 }
        });
        location.href = 'tariff-detail.html?id=' + encodeURIComponent(getQuery('id') || 'TAR-B2B-BASE');
      });
    }
  }

  function hydrateTariffComparison() {
    if (pageName() !== 'tariff-comparison' && pageName() !== 'tariff-competitor-comparison') return;
    var tariffs = S().getState().tariffs;
    document.querySelectorAll('select').forEach(function (sel, i) {
      sel.innerHTML = tariffs.map(function (t) {
        return '<option value="' + t.id + '">' + t.name + '</option>';
      }).join('');
    });
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

    wireSaveLink('.btn-primary', function () {
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
      location.href = 'reference.html';
    });
  }

  function hydrateAnalyticsFull() {
    if (pageName() !== 'analytics') return;
    var metrics = S().getMetrics();
    var board = S().getRepLeaderboard();
    document.querySelectorAll('[data-win-rate-kpis] .kpi-card .value').forEach(function (el, i) {
      if (i === 0) el.textContent = metrics.winRate + '%';
      if (board[i - 1]) el.textContent = board[i - 1].winRate + '%';
    });

    var lanes = S().getLaneAnalytics();
    var tbody = document.querySelector('#analytics-lanes tbody');
    if (tbody) {
      tbody.innerHTML = lanes.map(function (L) {
        return '<tr data-lane="' + L.lane + '" data-customer="' + L.customer + '"><td>' + L.lane + '</td><td class="tabular">' + L.quotes + '</td><td class="tabular">' + L.avgMargin + '%</td></tr>';
      }).join('');
      var count = document.querySelector('[data-filter-count]');
      if (count) count.textContent = 'Showing all ' + lanes.length + ' lane records';
    }
  }

  /* ── Phase 5: Portal ── */
  function hydratePortalSelfService() {
    if (pageName() !== 'portal-self-service') return;
    var cid = S().getState().portal.activeCustomerId;
    var addrs = S().getState().portal.addresses.filter(function (a) { return a.customerId === cid; });
    var comms = S().getState().portal.commodities.filter(function (c) { return c.customerId === cid; });
    var tickets = S().getState().portal.supportTickets.filter(function (t) { return t.customerId === cid; });

    document.querySelectorAll('.card ul, .portal-list').forEach(function (ul, i) {
      if (i === 0) {
        ul.innerHTML = addrs.map(function (a) {
          return '<li>' + a.label + ' — ' + a.lines + (a.default ? ' <span class="badge badge-active">Default</span>' : '') + '</li>';
        }).join('') || '<li>No addresses — <a href="portal-add-address.html">Add one</a></li>';
      }
    });

    var tables = document.querySelectorAll('.data-table tbody');
    if (tables[0]) {
      tables[0].innerHTML = tickets.map(function (t) {
        return '<tr><td>' + t.subject + '</td><td><span class="badge">' + t.status + '</span></td><td class="tabular">' + fmtDate(t.createdAt) + '</td></tr>';
      }).join('') || '<tr><td colspan="3">No tickets</td></tr>';
    }

    wirePortalAccountLabel();
  }

  function hydratePortalAddAddress() {
    if (pageName() !== 'portal-add-address') return;
    wireSaveLink('.btn-primary', function () {
      var fields = document.querySelectorAll('.field input');
      S().savePortalAddress({
        customerId: S().getState().portal.activeCustomerId,
        label: fields[0] ? fields[0].value : 'Address',
        lines: (fields[1] ? fields[1].value : '') + ', ' + (fields[2] ? fields[2].value : ''),
        default: false
      });
      location.href = 'portal-self-service.html';
    });
  }

  function hydratePortalAddCommodity() {
    if (pageName() !== 'portal-add-commodity') return;
    wireSaveLink('.btn-primary', function () {
      var fields = document.querySelectorAll('.field input');
      S().savePortalCommodity({
        customerId: S().getState().portal.activeCustomerId,
        name: fields[0] ? fields[0].value : 'Commodity',
        nmfc: fields[1] ? fields[1].value : '',
        dims: fields[2] ? fields[2].value : ''
      });
      location.href = 'portal-self-service.html';
    });
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
    var fuelRow = state.reference.fuel.slice(-1)[0];
    var fuelPct = fuelRow ? fuelRow.pct : 28.4;
    var residential = P() ? P().getPricingConfig().residential : 120;
    var weightEl = document.querySelector('[data-shipment-weight]');
    var cubeEl = document.querySelector('[data-shipment-cube]');
    var dvEl = document.querySelector('[data-declared-value]');
    var tierCards = document.querySelectorAll('.service-tier-card');
    var totalEl = document.querySelector('.portal-quote-total');
    var breakdown = document.querySelector('.portal-breakdown');
    var cubeHint = document.querySelector('[data-portal-cube-hint]');
    var computeNote = document.querySelector('.portal-compute-note');
    var acceptBtn = document.querySelector('[data-portal-book]');
    var selectedTier = cfg.selectedTier || 'wgi';

    function parseVal(el, fallback) {
      return P() ? P().parseNumericInput(el, fallback) : fallback;
    }

    function renderSelected(t) {
      if (totalEl) totalEl.textContent = fmtMoney(t.total);
      if (!breakdown || !P()) return;
      var dv = parseVal(dvEl, cfg.declaredValue || 18000);
      breakdown.innerHTML =
        '<div class="portal-breakdown-line"><span>Linehaul charge<span class="portal-breakdown-formula">$' + t.ratePerLb + '/lb × ' + Number(t.weight).toLocaleString() + ' lbs = ' + fmtMoney(t.linehaul) + '</span></span><span class="tabular">' + fmtMoney(t.linehaul) + '</span></div>' +
        '<div class="portal-breakdown-line"><span>Fuel surcharge (' + t.fuelPct + '% × linehaul)<a href="portal-pricing-help.html#terms-fuel" class="portal-help-link">What does this mean?</a><span class="portal-breakdown-formula">' + fmtMoney(t.linehaul) + ' × ' + t.fuelPct + '% = ' + fmtMoney(t.fuel) + '</span></span><span class="tabular">' + fmtMoney(t.fuel) + '</span></div>' +
        '<div class="portal-breakdown-line"><span>Declared value insurance<span class="portal-breakdown-formula">max(1% × ' + fmtMoney(dv) + ', $25) = ' + fmtMoney(t.insurance) + '</span></span><span class="tabular">' + fmtMoney(t.insurance) + '</span></div>' +
        '<div class="portal-breakdown-line"><span>Residential delivery<a href="portal-pricing-help.html#terms-accessorial" class="portal-help-link">?</a></span><span class="tabular">' + fmtMoney(t.residential) + '</span></div>' +
        '<div class="portal-breakdown-line total"><span>Total</span><span class="tabular">' + fmtMoney(t.total) + '</span></div>' +
        '<p style="font-size:11px;opacity:.7;margin-top:var(--space-sm)">Fuel surcharge updated weekly from current diesel prices. Insurance is one charge per shipment, not per service tier.</p>';
    }

    function refresh() {
      if (!P()) return;
      var weight = parseVal(weightEl, cfg.weight || 2400);
      var cube = parseVal(cubeEl, cfg.cube || 520);
      var dv = parseVal(dvEl, cfg.declaredValue || 18000);
      if (cubeHint) cubeHint.textContent = cube + ' cu ft → rate group 2 (251–500 cf bracket). Group 6 requires a custom quote.';
      if (computeNote) {
        computeNote.textContent = 'How this price was calculated: we look up your delivery ZIP to a home-delivery tier, find the per-pound rate for your cube bracket (' + cube + ' cf = group 2), multiply by weight, apply the lane minimum if needed, then add fuel (' + fuelPct + '% of linehaul) and insurance (1% of declared value, $25 minimum).';
      }
      var tiers = (cfg.tiers || []).map(function (t) {
        return Object.assign({}, t, P().computePortalTier({
          weight: weight,
          declaredValue: dv,
          ratePerLb: t.ratePerLb,
          fuelPct: fuelPct,
          residential: residential
        }));
      });
      tierCards.forEach(function (card, i) {
        var t = tiers[i];
        if (!t) return;
        var priceEl = card.querySelector('.service-tier-price');
        if (priceEl) priceEl.textContent = fmtMoney(t.total);
        card.onclick = function () {
          selectedTier = cfg.tiers[i].id;
          tierCards.forEach(function (c) { c.classList.remove('is-recommended'); });
          card.classList.add('is-recommended');
          renderSelected(t);
        };
      });
      var selIdx = cfg.tiers.findIndex(function (t) { return t.id === selectedTier; });
      if (selIdx < 0) selIdx = tiers.length - 1;
      if (tiers[selIdx]) renderSelected(tiers[selIdx]);
    }

    [weightEl, cubeEl, dvEl].forEach(function (el) {
      if (!el || el._portalPricingWired) return;
      el._portalPricingWired = true;
      el.addEventListener('input', refresh);
      el.addEventListener('change', refresh);
    });

    if (acceptBtn && !acceptBtn._wired) {
      acceptBtn._wired = true;
      acceptBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var weight = parseVal(weightEl, cfg.weight);
        var cube = parseVal(cubeEl, cfg.cube);
        var dv = parseVal(dvEl, cfg.declaredValue);
        var tierDef = (cfg.tiers || []).find(function (t) { return t.id === selectedTier; }) || (cfg.tiers || [])[2];
        var pricing = P().computePortalTier({
          weight: weight,
          declaredValue: dv,
          ratePerLb: tierDef.ratePerLb,
          fuelPct: fuelPct,
          residential: residential
        });
        var q = S().createPortalQuote({
          customerId: state.portal.activeCustomerId,
          origin: 'Seattle',
          destination: 'Portland',
          weight: weight,
          cube: cube,
          declaredValue: dv,
          status: 'sent',
          sentAt: new Date().toISOString(),
          pricingMode: 'override',
          pricingOverride: { total: pricing.total, margin: 18 }
        });
        location.href = 'portal-quote-confirmation.html?id=' + encodeURIComponent(q.id);
      });
    }

    wirePortalAccountLabel();
    if (weightEl && !weightEl.value) weightEl.value = String(cfg.weight || 2400);
    if (cubeEl && !cubeEl.value) cubeEl.value = String(cfg.cube || 520);
    if (dvEl && !dvEl.value && P()) dvEl.value = P().formatMoney(cfg.declaredValue || 18000).replace('−', '');
    refresh();
  }

  function hydrateTariffCompetitorFull() {
    if (pageName() !== 'tariff-competitor-comparison') return;
    var id = getQuery('id') || getQuery('quote') || 'Q-2026-0823';
    var q = S().getQuote(id);
    if (!q || !P()) return;
    var p = q.pricing || {};
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
    var td = S().getState().settings.tariffDisplay || {};
    var fuelPct = S().getState().reference.fuel.slice(-1)[0];
    document.querySelectorAll('[data-base-rate-field]').forEach(function (el) {
      var val = fmtMoney(td.baseRateCwt || 58) + ' / CWT';
      if (el.tagName === 'INPUT') el.value = val;
      else el.textContent = val + ' — national default';
    });
    document.querySelectorAll('[data-tariff-base-rate-display]').forEach(function (el) {
      el.textContent = fmtMoney(td.baseRateCwt || 58) + ' / CWT — national default';
    });
    document.querySelectorAll('[data-tariff-lane-override]').forEach(function (el) {
      el.textContent = 'TMV-SC +$' + (td.laneOverrideCwt || 1.07) + '/CWT';
    });
    document.querySelectorAll('[data-tariff-lane-flat]').forEach(function (el) {
      el.textContent = '+' + fmtMoney(td.laneOverrideFlat || 45) + '/shipment';
    });
    document.querySelectorAll('[data-tariff-min-charge]').forEach(function (el) {
      el.textContent = fmtMoney(td.minimumCharge || 285) + ' minimum charge';
    });
    document.querySelectorAll('[data-tariff-audit-base]').forEach(function (el) {
      el.textContent = fmtMoney(td.priorBaseRateCwt || 56.55) + ' → ' + fmtMoney(td.baseRateCwt || 58);
    });
    document.querySelectorAll('details summary + p').forEach(function (p) {
      if (p.textContent.indexOf('SC:293,296,297') >= 0 && p.querySelector('[data-tariff-lane-override]')) {
        p.querySelector('[data-tariff-lane-override]').textContent = '+$' + (td.laneOverrideCwt || 1.07) + '/CWT';
      }
    });
    if (fuelPct) {
      document.querySelectorAll('[data-tariff-fuel]').forEach(function (el) {
        el.textContent = fuelPct.pct + '%';
      });
    }
  }

  function hydrateTariffComparisonFull() {
    if (pageName() !== 'tariff-comparison') return;
    var td = S().getState().settings.tariffDisplay || {};
    document.querySelectorAll('[data-tariff-rate-new]').forEach(function (el) {
      el.textContent = fmtMoney(td.baseRateCwt || 58) + '/CWT';
    });
    document.querySelectorAll('[data-tariff-rate-old]').forEach(function (el) {
      el.textContent = fmtMoney(td.priorBaseRateCwt || 56.55) + '/CWT';
    });
    var delta = td.baseRateCwt && td.priorBaseRateCwt
      ? Math.round(((td.baseRateCwt - td.priorBaseRateCwt) / td.priorBaseRateCwt) * 1000) / 10
      : 0;
    document.querySelectorAll('[data-tariff-rate-change]').forEach(function (el) {
      el.textContent = 'Base rate increased from ' + fmtMoney(td.priorBaseRateCwt) + ' to ' + fmtMoney(td.baseRateCwt) + ' (+' + delta + '%)';
    });
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
        return q.status !== 'lost' && q.status !== 'accepted';
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
    if (pageName() !== 'admin-invite') return;
    var form = document.querySelector('form, .card');
    wireSaveLink('.btn-primary', function () {
      var inputs = document.querySelectorAll('.field input, .field select');
      var email = inputs[0] ? inputs[0].value : 'new@americanwest.com';
      var name = inputs[1] ? inputs[1].value : 'New User';
      var role = inputs[2] ? inputs[2].value : 'Sales Rep';
      S().inviteUser({ email: email, name: name, role: role });
      location.href = 'admin-users.html';
    });
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
    wireSaveLink('.btn-primary', function () {
      var partial = { id: u.id, name: u.name, email: u.email, role: u.role, status: u.status };
      document.querySelectorAll('.field').forEach(function (field) {
        var label = (field.querySelector('label') || {}).textContent || '';
        var input = field.querySelector('input, select');
        if (!input) return;
        if (label.toLowerCase().indexOf('name') >= 0) partial.name = input.value;
        if (label.toLowerCase().indexOf('email') >= 0) partial.email = input.value;
        if (label.toLowerCase().indexOf('role') >= 0) partial.role = input.value;
        if (label.toLowerCase().indexOf('status') >= 0) partial.status = input.value;
      });
      S().saveUser(partial);
      location.href = 'admin-users.html';
    });
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
    if (pageName() === 'admin-list-edit') {
      wireSaveLink('.btn-primary', function () {
        var list = getQuery('list') || 'origins';
        var input = document.querySelector('.field input');
        var val = input ? input.value : '';
        var lists = S().getState().validationLists;
        if (val && lists[list].indexOf(val) < 0) lists[list].push(val);
        S().saveValidationLists(lists);
        location.href = 'admin-list-management.html';
      });
    }
    if (pageName() === 'admin-agreement-template') {
      var ta = document.querySelector('textarea');
      if (ta) ta.value = S().getState().settings.agreementTemplate || ta.value;
      wireSaveLink('.btn-primary', function () {
        S().saveSettings({ agreementTemplate: ta ? ta.value : '' });
        location.href = 'admin-config.html';
      });
    }
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
