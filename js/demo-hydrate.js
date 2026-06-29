/**
 * Page hydrators — bind mockup HTML to session store
 */
(function (global) {
  'use strict';

  var P = function () { return global.AwestPricingMock; };
  var S = function () { return global.AwestStore; };
  var G = function () { return global.AwestGovernance; };

  function pageName() {
    var p = location.pathname.split('/').pop() || '';
    return p.replace('.html', '');
  }

  function fmtMoney(n) {
    return P() ? P().formatMoney(n) : '$' + (n || 0).toFixed(2);
  }

  function fmtPct(n) {
    return P() ? P().formatPct(n) : String(n);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== 2026 ? 'numeric' : undefined });
  }

  function custName(id) {
    var c = S().getCustomer(id);
    return c ? c.name : id;
  }

  function repName(id) {
    var u = S().getUser(id);
    return u ? u.name : 'Unknown';
  }

  function statusBadge(status) {
    var labels = {
      draft: 'Draft', pending: 'Pending Approval', approved: 'Approved',
      sent: 'Sent', accepted: 'Accepted', lost: 'Lost', converted: 'Booked'
    };
    var cls = 'badge badge-' + (status === 'pending' ? 'pending' : status);
    return '<span class="' + cls + '">' + (labels[status] || status) + '</span>';
  }

  function quoteDetailHref(id) {
    var q = S().getQuote(id);
    var page = (q && q.status === 'pending') ? 'quote-detail-pending.html' : 'quote-detail.html';
    return page + '?id=' + encodeURIComponent(id);
  }

  function laneLabel(q) {
    var o = (q.origin || '').replace(' Metro', '');
    var d = (q.destination || '').replace(' Metro', '');
    return o + ' → ' + d;
  }

  function marginGauge(margin) {
    var cls = margin < 15 ? 'red' : margin < 18 ? 'amber' : 'green';
    var w = Math.min(Math.max(margin * 3, 20), 100);
    return '<div class="margin-gauge"><div class="margin-gauge-track"><div class="margin-gauge-fill ' + cls + '" style="width:' + w + '%"></div><div class="margin-gauge-tick" style="left:40%"></div></div><span class="margin-gauge-label tabular">' + margin + '%</span></div>';
  }

  function getQueryQuoteId() {
    return new URLSearchParams(location.search).get('id');
  }

  function getQueryCustomerId() {
    return new URLSearchParams(location.search).get('customer') ||
      new URLSearchParams(location.search).get('customerId');
  }

  /* ── Quotes list ── */
  function hydrateQuotes() {
    var table = document.getElementById('quotes-table');
    if (!table) return;
    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    var state = S().getState();
    var quotes = state.quotes.filter(function (q) { return q.channel !== 'portal'; });
    var html = '';
    quotes.forEach(function (q) {
      var cust = custName(q.customerId);
      var p = q.pricing || {};
      var discTotal = (q.customerDiscPct || 0) + (q.quoteDiscPct || 0);
      var href = quoteDetailHref(q.id);
      var canApprove = q.status === 'pending' && G().canApprove(state);
      var sentThisWeek = q.sentAt && (Date.now() - new Date(q.sentAt).getTime()) < 7 * 86400000;
      html += '<tr data-quote-id="' + q.id + '" data-status="' + q.status + '" data-customer="' + cust + '" data-rep="' + repName(q.repId) + '" data-search="' + q.id + ' ' + cust + ' ' + q.origin + ' ' + q.destination + '" data-amount="' + (p.total || 0) + '"' + (sentThisWeek ? ' data-period="week"' : '') + '>';
      html += '<td class="tabular"><a href="' + href + '">' + q.id + '</a></td>';
      html += '<td>' + cust + '</td><td>' + laneLabel(q) + '</td>';
      html += '<td class="quote-disc-mount"></td>';
      html += '<td class="quote-amount-cell" tabindex="0" role="button" aria-haspopup="dialog" aria-label="View quote calculation"><span class="quote-total-amt tabular">' + fmtMoney(p.total || 0) + '</span><div class="quote-stack-mount"></div></td>';
      html += '<td class="tabular" data-quote-margin>' + (p.margin || 0) + '%</td>';
      html += '<td>' + statusBadge(q.status) + '</td>';
      html += '<td class="tabular">' + fmtDate(q.updatedAt) + '</td>';
      html += '<td class="actions"><div class="quote-row-actions">';
      if (canApprove) {
        html += '<button type="button" class="btn-approve-inline" data-inline-approve>Approve</button>';
        html += '<button type="button" class="btn-reject-inline" data-inline-reject>Reject</button>';
      }
      html += '<button type="button" class="action-pill quote-calc-toggle" data-calc-toggle>Show calculation</button>';
      html += '<a href="' + href + '" class="action-pill">Open</a></div></td></tr>';
      html += '<tr class="quote-detail-row is-collapsed" data-quote-detail="' + q.id + '"><td colspan="9"><div class="quote-row-breakdown">' +
        '<label class="quote-disc-field quote-disc-field--detail"><span class="quote-disc-field-label">Quote discount</span>' +
        '<input type="number" data-quote-disc-input list="aw-discount-presets" min="0" max="100" step="0.1" value="' + fmtPct(q.quoteDiscPct || 0) + '" class="quote-disc-input tabular">' +
        '<span class="quote-disc-field-suffix">%</span></label>' +
        '<div data-breakdown-mount></div></div></td></tr>';
    });
    tbody.innerHTML = html;
    var count = document.querySelector('[data-filter-count]');
    if (count) count.textContent = 'Showing all ' + quotes.length + ' records';
    hydrateFilterOptions('#q-customer', state.customers.map(function (c) { return c.name; }));
    hydrateFilterOptions('#q-rep', state.users.filter(function (u) { return u.role === 'Sales Rep' || u.role === 'Sales Manager'; }).map(function (u) { return u.name; }));
  }

  function hydrateFilterOptions(sel, names) {
    var el = document.querySelector(sel);
    if (!el) return;
    var cur = el.value;
    while (el.options.length > 1) el.remove(1);
    names.forEach(function (n) {
      var o = document.createElement('option');
      o.value = n;
      o.textContent = n;
      el.appendChild(o);
    });
    if (cur && cur !== 'All') el.value = cur;
  }

  /* ── Dashboard ── */
  function commodityLabel(code) {
    if (!code || code === 'FAK') return 'FAK (general freight)';
    return code;
  }

  function hydrateDashboard() {
    var state = S().getState();
    var user = S().getCurrentUser();
    var metrics = S().getMetrics();
    var repNameEnc = encodeURIComponent(user.name);
    var myQuotes = state.quotes.filter(function (q) {
      return q.repId === user.id && q.channel !== 'portal';
    });
    var openStatuses = ['draft', 'pending', 'approved', 'sent'];
    var open = myQuotes.filter(function (q) { return openStatuses.indexOf(q.status) >= 0; });
    var pending = myQuotes.filter(function (q) { return q.status === 'pending'; });
    var sentWeek = myQuotes.filter(function (q) {
      return q.status === 'sent' && q.sentAt && (Date.now() - new Date(q.sentAt).getTime()) < 7 * 86400000;
    });

    var userNameEl = document.querySelector('[data-dashboard-user-name]');
    if (userNameEl) userNameEl.textContent = user.name;
    var userRoleEl = document.querySelector('[data-dashboard-user-role]');
    if (userRoleEl) userRoleEl.textContent = user.role;

    function quotesDrill(params) {
      var parts = ['from=dashboard', 'rep=' + repNameEnc];
      Object.keys(params).forEach(function (k) {
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
      });
      return 'quotes.html?' + parts.join('&');
    }

    function analyticsDrill(params) {
      var parts = ['from=dashboard', 'rep=' + repNameEnc];
      Object.keys(params).forEach(function (k) {
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
      });
      return 'analytics.html?' + parts.join('&');
    }

    var kpiConfig = {
      open: {
        count: open.length,
        href: quotesDrill({ view: 'open', drill: 'Open Quotes' }),
        title: 'View your open quotes (' + open.length + ')',
        hint: open.length === 1 ? 'View 1 quote →' : 'View ' + open.length + ' quotes →'
      },
      pending: {
        count: pending.length,
        href: quotesDrill({ status: 'pending', drill: 'Pending Approval' }),
        title: 'View quotes pending approval (' + pending.length + ')',
        hint: pending.length === 1 ? 'Review 1 quote →' : 'Review ' + pending.length + ' quotes →'
      },
      'sent-week': {
        count: sentWeek.length,
        href: quotesDrill({ status: 'sent', period: 'week', drill: 'Quotes Sent This Week' }),
        title: 'View quotes sent this week (' + sentWeek.length + ')',
        hint: sentWeek.length === 1 ? 'View 1 quote →' : 'View ' + sentWeek.length + ' quotes →'
      },
      'win-rate': {
        count: metrics.winRate + '%',
        href: analyticsDrill({ metric: 'win-rate', drill: 'Win Rate' }),
        title: 'View win rate analytics (' + metrics.winRate + '%)',
        hint: 'View analytics →'
      }
    };

    document.querySelectorAll('[data-dashboard-kpi]').forEach(function (card) {
      var key = card.getAttribute('data-dashboard-kpi');
      var cfg = kpiConfig[key];
      if (!cfg) return;
      card.href = cfg.href;
      card.title = cfg.title;
      var val = card.querySelector('.value');
      if (val) val.textContent = cfg.count;
      var hint = card.querySelector('.kpi-drill-hint');
      if (hint) hint.textContent = cfg.hint;
    });

    var pendingAllHref = quotesDrill({ status: 'pending', drill: 'Pending Approval' });
    document.querySelectorAll('[data-dashboard-panel-link="pending"], [data-dashboard-view-all="pending"]').forEach(function (a) {
      a.href = pendingAllHref;
    });
    var pendingViewAll = document.querySelector('[data-dashboard-view-all="pending"]');
    if (pendingViewAll) pendingViewAll.textContent = pending.length ? 'View all ' + pending.length + ' →' : 'View all →';

    var recentAllHref = quotesDrill({ view: 'open', drill: 'My Recent Quotes' });
    document.querySelectorAll('[data-dashboard-panel-link="recent"], [data-dashboard-view-all="recent"]').forEach(function (a) {
      a.href = recentAllHref;
    });
    var recentViewAll = document.querySelector('[data-dashboard-view-all="recent"]');
    if (recentViewAll) recentViewAll.textContent = open.length ? 'View all ' + open.length + ' →' : 'View all →';

    var pendingPanel = document.querySelector('[data-dashboard-panel="pending"]');
    var pendingTb = pendingPanel ? pendingPanel.querySelector('tbody') : null;
    if (pendingTb) {
      var rows = pending.length ? pending : state.quotes.filter(function (q) { return q.status === 'pending'; });
      pendingTb.innerHTML = rows.slice(0, 5).map(function (q) {
        var p = q.pricing || {};
        var applied = q.appliedTerms ? q.appliedTerms.customerDiscPctMaster : (q.customerDiscPct || 0);
        var disc = applied + '% applied';
        if (P() && P().hasCustomerDiscException && P().hasCustomerDiscException(q)) {
          disc += ' · ' + P().getEffectiveCustomerDisc(q) + '% exception';
        }
        if (q.quoteDiscPct) disc += ' · +' + (q.quoteDiscPct || 0) + '% quote';
        var href = quoteDetailHref(q.id);
        var actions = G().canApprove(state)
          ? '<button type="button" class="btn-approve-inline" data-dashboard-approve="' + q.id + '">Approve</button><button type="button" class="btn-reject-inline" data-dashboard-reject="' + q.id + '">Reject</button>'
          : '';
        return '<tr data-drill-href="' + href + '"><td>' + custName(q.customerId) + '</td><td class="tabular"><a href="' + href + '">' + q.id + '</a></td><td class="tabular">' + disc + '</td><td class="tabular">' + (p.margin || 0) + '%</td><td>' + marginGauge(p.margin || 0) + '</td><td class="actions">' + actions + '<a href="' + href + '" class="action-pill">Review</a></td></tr>';
      }).join('');

      var pendingPanel = pendingTb.closest('.panel');
      if (pendingPanel) {
        var mgrHint = pendingPanel.querySelector('[data-manager-hint]');
        if (!mgrHint) {
          mgrHint = document.createElement('p');
          mgrHint.className = 'inline-notice info flow-hint';
          mgrHint.setAttribute('data-manager-hint', '');
          pendingPanel.insertBefore(mgrHint, pendingPanel.querySelector('table'));
        }
        if (G().canApprove(state)) {
          mgrHint.hidden = false;
          mgrHint.innerHTML = '<strong>Manager view:</strong> Review discount and margin, then approve or open the quote for full detail.';
        } else if (rows.length) {
          mgrHint.hidden = false;
          mgrHint.innerHTML = '<strong>Waiting on your manager.</strong> These quotes exceed your discount authority and need Sales Manager approval before you can send them to the customer.';
        } else {
          mgrHint.hidden = true;
        }
      }
    }

    var panels = document.querySelectorAll('.panel');
    panels.forEach(function (panel) {
      var h2 = panel.querySelector('h2');
      if (!h2 || h2.textContent.indexOf('Recent') < 0) return;
      var tb = panel.querySelector('tbody');
      if (!tb) return;
      var recent = myQuotes.slice().sort(function (a, b) {
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      }).slice(0, 5);
      tb.innerHTML = recent.map(function (q) {
        var href = quoteDetailHref(q.id);
        return '<tr data-drill-href="' + href + '"><td class="tabular"><a href="' + href + '">' + q.id + '</a></td><td>' + custName(q.customerId) + '</td><td>' + statusBadge(q.status) + '</td><td class="tabular">' + fmtDate(q.updatedAt) + '</td><td class="actions"><a href="' + href + '">Open</a></td></tr>';
      }).join('');
    });
  }

  /* ── Quote detail ── */
  function hydrateQuoteDetail() {
    var id = getQueryQuoteId() || 'Q-2026-0823';
    var q = S().getQuote(id);
    if (!q) {
      document.querySelector('.main-content').innerHTML = '<p class="inline-notice">Quote not found: ' + id + '. <a href="quotes.html">Back to quotes</a></p>';
      return;
    }
    var p = q.pricing || {};
    var cust = custName(q.customerId);
    var state = S().getState();
    var meta = P() ? P().pricingMetaFromQuote(q) : { weight: q.weight, ratePerLb: state.settings.demoLane.ratePerLb };
    var h1 = document.querySelector('.page-header h1');
    if (h1) h1.textContent = q.id;
    var sub = document.querySelector('.page-header p');
    if (sub) {
      var discParts = [];
      if (q.appliedTerms) discParts.push(q.appliedTerms.customerDiscPctMaster + '% applied');
      if (P() && P().hasCustomerDiscException && P().hasCustomerDiscException(q)) {
        discParts.push(P().getEffectiveCustomerDisc(q) + '% exception');
      }
      if (q.quoteDiscPct) discParts.push('+' + q.quoteDiscPct + '% quote');
      var discNote = discParts.length ? ' · ' + discParts.join(' · ') : '';
      sub.textContent = cust + ' · ' + q.origin + ' → ' + q.destination + discNote;
    }
    var badge = document.querySelector('.page-header .badge');
    if (badge) badge.outerHTML = statusBadge(q.status);

    document.querySelectorAll('[data-detail-breakdown]').forEach(function (el) {
      el.setAttribute('data-quote-disc', String(q.quoteDiscPct || 0));
      el.setAttribute('data-quote-id', q.id);
      el.setAttribute('data-customer-disc', String(q.customerDiscPct || 0));
      if (P()) el.innerHTML = P().renderPricingBreakdown(p, false, meta);
    });

    document.querySelectorAll('[data-quote-total-summary]').forEach(function (el) {
      el.textContent = fmtMoney(p.total || 0);
    });
    document.querySelectorAll('[data-quote-margin-summary]').forEach(function (el) {
      el.textContent = (p.margin || 0) + '%';
    });

    document.querySelectorAll('.disclosure-body.pricing-lines').forEach(function (el) {
      if (P()) el.innerHTML = P().renderPricingBreakdown(p, false, meta);
    });

    var cards = document.querySelectorAll('.card');
    cards.forEach(function (card) {
      if (card.textContent.indexOf('Shipment Summary') >= 0) {
        card.querySelector('p').innerHTML = 'Weight: <span class="tabular">' + (q.weight || 0).toLocaleString() + ' lbs</span> · Cube: <span class="tabular">' + (q.cube || 0) + '</span> · Commodity: ' + commodityLabel(q.commodity || 'FAK') + ' · Declared value: <span class="tabular">' + fmtMoney(q.declaredValue || 0) + '</span>';
      }
    });

    document.querySelectorAll('.margin-gauge-fill').forEach(function (fill) {
      var m = p.margin || 0;
      fill.className = 'margin-gauge-fill ' + (m < 15 ? 'red' : m < 18 ? 'amber' : 'green');
      fill.style.width = Math.min(m * 3, 100) + '%';
    });
    document.querySelectorAll('.margin-gauge-label').forEach(function (el) {
      el.textContent = (p.margin || 0) + '%';
    });

    document.querySelectorAll('[data-quote-calc-meta] p').forEach(function (el) {
      if (el.textContent.indexOf('Fuel rate') >= 0) {
        var fuel = state.reference.fuel.slice(-1)[0];
        if (fuel) {
          el.innerHTML = '<strong>Fuel rate:</strong> ' + fuel.pct + '% from ' + fuel.source + ', ' + fmtDate(fuel.effectiveDate);
        }
      }
      if (el.textContent.indexOf('Tariff:') >= 0 && q.tariffId) {
        el.innerHTML = '<strong>Tariff:</strong> <a href="tariff-detail.html?id=' + encodeURIComponent(q.tariffId) + '">' + q.tariffId + '</a>';
      }
      if (el.textContent.indexOf('Approved by') >= 0 && q.approvedBy) {
        el.innerHTML = '<strong>Approved by:</strong> ' + repName(q.approvedBy) + ', ' + fmtDate(q.approvedAt);
      }
    });

    document.querySelectorAll('a[href="quote-comparison.html"]').forEach(function (a) {
      a.href = 'quote-comparison.html?id=' + encodeURIComponent(id);
    });
    document.querySelectorAll('a[href="quote-pdf.html"], a[href="quote-esign.html"], a[href="quote-tms-export.html"]').forEach(function (a) {
      if (a.href.indexOf('id=') < 0) a.href = a.getAttribute('href').split('.html')[0] + '.html?id=' + encodeURIComponent(id);
    });

    document.title = 'Quote ' + q.id + ' — American West';
  }

  /* ── Customers ── */
  function hydrateCustomers() {
    var tbody = document.querySelector('#customers-table tbody');
    if (!tbody) return;
    var state = S().getState();
    tbody.innerHTML = state.customers.map(function (c) {
      var rep = repName(c.repId);
      var tCount = (c.tariffIds || []).length;
      return '<tr data-rep="' + rep + '" data-status="' + c.status + '" data-search="' + c.code + ' ' + c.name + '">' +
        '<td class="tabular">' + c.code + '</td>' +
        '<td><a href="customer-detail.html?id=' + encodeURIComponent(c.id) + '">' + c.name + '</a></td>' +
        '<td class="tabular"><a href="customer-detail.html?id=' + encodeURIComponent(c.id) + '">' + tCount + '</a></td>' +
        '<td class="tabular">' + c.overallDiscPct + '% overall</td>' +
        '<td>' + rep + '</td>' +
        '<td class="actions"><a href="customer-detail.html?id=' + encodeURIComponent(c.id) + '">Edit</a><a href="quotes.html?customer=' + encodeURIComponent(c.name) + '">View Quotes</a></td></tr>';
    }).join('');
    var count = document.querySelector('[data-filter-count]');
    if (count) count.textContent = 'Showing all ' + state.customers.length + ' records';
  }

  function hydrateCustomerDetail() {
    var id = getQueryCustomerId() || new URLSearchParams(location.search).get('id') || 'PACI-1200';
    var c = S().getCustomer(id);
    if (!c) return;
    var h1 = document.querySelector('h1');
    if (h1) h1.textContent = c.name;
    document.title = c.name + ' — American West';
    var sub = document.querySelector('.page-header p');
    if (sub) sub.innerHTML = c.code + ' · <span class="badge badge-active">Active</span>';
    var notesEl = document.querySelector('[data-tariff-notes-text]');
    if (notesEl && c.tariffNotes) notesEl.value = c.tariffNotes;
    var pickupEl = document.querySelector('[data-pickup-location]');
    if (pickupEl && c.pickupLocation) pickupEl.value = c.pickupLocation;
    var fuelEl = document.querySelector('[data-fixed-fuel]');
    if (fuelEl && c.fixedFuelPct != null) fuelEl.value = c.fixedFuelPct + '%';
    var quotes = S().getState().quotes.filter(function (q) { return q.customerId === c.id; });
    var qt = document.querySelector('[data-customer-quotes] tbody');
    if (qt) {
      qt.innerHTML = quotes.map(function (q) {
        var p = q.pricing || {};
        return '<tr><td class="tabular"><a href="' + quoteDetailHref(q.id) + '">' + q.id + '</a></td><td class="tabular">' + fmtMoney(p.total || 0) + '</td><td>' + statusBadge(q.status) + '</td><td class="actions"><a href="' + quoteDetailHref(q.id) + '">Open</a></td></tr>';
      }).join('');
    }
  }

  /* ── Tariffs ── */
  function hydrateTariffs() {
    var tbody = document.querySelector('#tariffs-table tbody, .data-table tbody');
    if (!tbody || !document.querySelector('h1') || document.querySelector('h1').textContent.indexOf('Tariff') < 0) return;
    if (pageName() !== 'tariffs' && pageName() !== 'tariffs-page2') return;
    var tariffs = S().getState().tariffs;
    tbody.innerHTML = tariffs.map(function (t) {
      var cust = t.customerId ? custName(t.customerId) : '—';
      return '<tr data-status="' + t.status + '" data-search="' + t.id + ' ' + t.name + '">' +
        '<td class="tabular"><a href="tariff-detail.html?id=' + encodeURIComponent(t.id) + '">' + t.id + '</a></td>' +
        '<td>' + t.name + '</td><td>' + t.type + '</td><td>' + t.service + '</td>' +
        '<td>' + cust + '</td><td><span class="badge badge-' + (t.status === 'active' ? 'active' : 'draft') + '">' + t.status + '</span></td>' +
        '<td class="tabular">v' + t.version + '</td>' +
        '<td class="actions"><a href="tariff-detail.html?id=' + encodeURIComponent(t.id) + '">Open</a><a href="tariff-rate-matrix.html?id=' + encodeURIComponent(t.id) + '">Edit matrix</a></td></tr>';
    }).join('');
  }

  function hydrateTariffDetail() {
    var id = new URLSearchParams(location.search).get('id') || 'TAR-B2B-BASE';
    var t = S().getTariff(id);
    if (!t) return;
    var h1 = document.querySelector('h1');
    if (h1) h1.textContent = t.id;
    document.title = t.name + ' — American West';
    var sub = document.querySelector('.page-header > div > p');
    if (sub) sub.innerHTML = t.service + ' · UOM ' + t.uom + ' · v' + t.version + ' · <span class="badge badge-' + (t.status === 'active' ? 'active' : 'draft') + '">' + t.status + '</span>';
    var lead = document.querySelector('.page-header .page-lead');
    if (lead) lead.textContent = t.name + (t.mctcLevel ? ' · MCTC ' + t.mctcLevel : '');
  }

  /* ── Reference tables ── */
  function hydrateReferenceTable(collection, cols) {
    var tbody = document.querySelector('.data-table tbody');
    if (!tbody) return;
    var items = S().getState().reference[collection] || [];
    tbody.innerHTML = items.map(function (item) {
      return '<tr>' + cols.map(function (col) {
        if (col === 'actions') {
          return '<td class="actions"><a href="#" data-ref-edit="' + item.id + '">Edit</a></td>';
        }
        return '<td' + (typeof item[col] === 'number' ? ' class="tabular"' : '') + '>' + (item[col] != null ? item[col] : '—') + '</td>';
      }).join('') + '</tr>';
    }).join('');
  }

  function hydrateReferenceFuel() {
    if (pageName() !== 'reference-fuel') return;
    hydrateReferenceTable('fuel', ['effectiveDate', 'pct', 'source', 'actions']);
    var latest = S().getState().reference.fuel.slice(-1)[0];
    document.querySelectorAll('.panel p, .card p').forEach(function (p) {
      if (latest && p.textContent.indexOf('%') >= 0 && p.textContent.indexOf('EIA') >= 0) {
        p.innerHTML = p.innerHTML.replace(/[\d.]+%/, latest.pct + '%');
      }
    });
  }

  function hydrateQuoteLayerTemplates() {
    if (pageName() !== 'quote-layer-templates') return;
    var tbody = document.querySelector('[data-quote-layer-templates-table] tbody');
    if (!tbody) return;
    var templates = S().getState().settings.quoteLayerTemplates || [];
    var typeLabel = {
      pct_linehaul: '% of linehaul',
      flat_add: 'Flat charge',
      flat_sub: 'Flat credit'
    };
    tbody.innerHTML = templates.map(function (t) {
      var def = t.defaultEnabled ? 'On by default' : 'Off by default';
      if (t.defaultValue != null && t.presetId !== 'customer-disc-override') {
        def += ' · ' + t.defaultValue + (t.type === 'pct_linehaul' ? '%' : '');
      }
      var approval = t.requiresApprovalWhenChanged ? 'When changed' : '—';
      return '<tr><td><strong>' + t.name + '</strong><br><span class="quote-layer-scope">' + (t.presetId || '') + '</span></td>' +
        '<td>' + (typeLabel[t.type] || t.type) + '</td>' +
        '<td>' + def + '</td>' +
        '<td>' + approval + '</td>' +
        '<td class="text-muted-sm">' + (t.hint || '—') + '</td></tr>';
    }).join('');
    var computed = document.querySelector('[data-computed-layer-labels]');
    if (computed) {
      var labels = S().getState().settings.computedLayerLabels || [];
      computed.innerHTML = labels.map(function (l) { return '<li>' + l + '</li>'; }).join('');
    }
  }

  function hydrateReferenceAccessorials() {
    if (pageName() !== 'reference-accessorials') return;
    var tbody = document.querySelector('.data-table tbody');
    if (!tbody) return;
    var items = S().getState().reference.accessorials || [];
    tbody.innerHTML = items.map(function (item) {
      var rate = P() ? P().formatAccessorialRate(item) : item.rate;
      return '<tr><td>' + item.name + '</td><td>' + item.trigger + '</td><td class="tabular">' + rate + '</td>' +
        '<td><span class="badge badge-' + (item.status === 'active' ? 'active' : 'draft') + '">' + item.status + '</span></td>' +
        '<td class="actions"><a href="reference-accessorial-edit.html?id=' + encodeURIComponent(item.id) + '">Edit</a></td></tr>';
    }).join('');
  }

  function hydrateReferenceLanesB2b() {
    if (pageName() !== 'reference-lanes-b2b') return;
    hydrateReferenceTable('b2bLanes', ['baseZip', 'description', 'originStation', 'cfq', 'tariffGroup', 'actions']);
  }

  function hydrateReferenceTiersHd() {
    if (pageName() !== 'reference-tiers-hd') return;
    var tbody = document.querySelector('.data-table tbody');
    if (!tbody) return;
    var items = S().getState().reference.hdTiers || [];
    tbody.innerHTML = items.map(function (item) {
      var bppc = item.bppc != null ? item.bppc : '—';
      var tierNote = item.tierMiles ? 'Tier ' + item.tier + ' · ' + item.tierMiles : item.poi;
      return '<tr><td class="tabular">' + item.zip + '</td><td>' + tierNote + '</td><td class="tabular">' + bppc + '</td>' +
        '<td>' + (item.origin || '—') + '</td><td>' + item.service + '</td>' +
        '<td class="actions"><a href="reference-tier-hd-edit.html?id=' + encodeURIComponent(item.id) + '">Edit</a></td></tr>';
    }).join('');
  }

  /* ── Analytics ── */
  function hydrateAnalytics() {
    var metrics = S().getMetrics();
    document.querySelectorAll('.kpi-card .value').forEach(function (el, i) {
      if (i === 0) el.textContent = metrics.openCount;
      if (i === 1) el.textContent = fmtMoney(metrics.pipelineTotal);
      if (i === 2) el.textContent = metrics.winRate + '%';
    });
  }

  /* ── Admin users ── */
  function hydrateAdminUsers() {
    if (pageName() !== 'admin-users') return;
    var tbody = document.querySelector('[data-admin-users] tbody');
    if (!tbody) return;
    tbody.innerHTML = S().getState().users.map(function (u) {
      var customers = u.quoteCount != null && u.quoteCount > 0 ? u.quoteCount : '—';
      return '<tr><td>' + u.name + '</td><td>' + u.email + '</td><td>' + u.role + '</td><td class="tabular">' + customers + '</td>' +
        '<td><span class="badge badge-active">' + u.status + '</span></td>' +
        '<td class="actions"><a href="admin-user-edit.html?id=' + encodeURIComponent(u.id) + '">Edit</a></td></tr>';
    }).join('');
  }

  /* ── Login ── */
  function hydrateLogin() {
    var form = document.querySelector('.login-card form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = (document.getElementById('email') || {}).value || '';
      var user = S().getState().users.find(function (u) {
        return u.email.toLowerCase() === email.toLowerCase();
      });
      if (user) S().setCurrentUser(user.id);
      else S().setCurrentUser('user-jordan');
      location.href = 'dashboard.html';
    });
  }

  /* ── Integration pages ── */
  function hydrateQuotePdf() {
    var id = getQueryQuoteId() || 'Q-2026-0823';
    var q = S().getQuote(id);
    if (!q) return;
    document.querySelectorAll('h1, .page-header h1').forEach(function (h) {
      if (/PDF|Quote/.test(h.textContent)) h.textContent = 'Quote PDF — ' + q.id;
    });
    var p = q.pricing || {};
    var cust = custName(q.customerId);
    document.querySelectorAll('[data-pdf-summary]').forEach(function (el) {
      el.innerHTML = '<strong>Customer:</strong> ' + cust + '<br><strong>Lane:</strong> ' + q.origin + ' → ' + q.destination +
        '<br><strong>Weight:</strong> ' + (q.weight || 0).toLocaleString() + ' lbs · <strong>Total:</strong> <span class="tabular">' + fmtMoney(p.total || 0) + '</span>';
    });
    var genBtn = document.querySelector('[data-generate-pdf], .btn-primary');
    if (genBtn && !genBtn._wired) {
      genBtn._wired = true;
      genBtn.addEventListener('click', function (e) {
        if (genBtn.tagName === 'A') return;
        e.preventDefault();
        S().generatePdf(id);
        alert('PDF generated for ' + id + ' (simulated).');
      });
    }
  }

  function hydrateQuoteEsign() {
    var id = getQueryQuoteId() || 'Q-2026-0823';
    var q = S().getQuote(id);
    if (!q) return;
    var btn = document.querySelector('.btn-primary');
    if (btn && !btn._wired) {
      btn._wired = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        S().sendEsign(id);
        alert('E-signature envelope sent (simulated).');
      });
    }
  }

  function hydrateQuoteTmsExport() {
    var id = getQueryQuoteId() || 'Q-2026-0823';
    var btn = document.querySelector('[data-tms-export], .btn-primary');
    if (btn && !btn._wired) {
      btn._wired = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        S().exportTms(id);
        var q = S().getQuote(id);
        var st = q && q.artifacts.tmsExport.status;
        alert(st === 'success' ? 'Exported to TMS (simulated).' : 'Export failed: ' + (q.artifacts.tmsExport.error || 'unknown'));
      });
    }
  }

  function hydrateQuoteComparison() {
    var id = getQueryQuoteId();
    if (!id) return;
    var q = S().getQuote(id);
    if (!q || !P()) return;
    document.querySelectorAll('[data-compare-total]').forEach(function (el, i) {
      if (i === 0 && q.pricing) el.textContent = fmtMoney(q.pricing.total);
    });
  }

  /* ── CRM ── */
  function hydrateCrmKanban() {
    var kanban = document.querySelector('.kanban');
    if (!kanban) return;
    var state = S().getState();
    var quotes = state.quotes.filter(function (q) { return q.channel !== 'portal' && q.status !== 'lost'; });
    var stages = ['draft', 'pending', 'approved', 'sent', 'accepted', 'converted'];
    var total = quotes.reduce(function (s, q) { return s + ((q.pricing && q.pricing.total) || 0); }, 0);
    var lead = document.querySelector('.page-lead');
    if (lead) lead.innerHTML = 'Quote stages by status · <span class="tabular">' + fmtMoney(total) + '</span> total value · ' + quotes.length + ' active quotes';

    stages.forEach(function (stage) {
      var col = kanban.querySelector('[data-stage="' + stage + '"]');
      if (!col) return;
      var stageQuotes = quotes.filter(function (q) { return q.status === stage; });
      var h3 = col.querySelector('h3');
      if (h3) {
        var span = h3.querySelector('.page-lead');
        if (span) span.textContent = '(' + stageQuotes.length + ')';
      }
      col.querySelectorAll('.kanban-card').forEach(function (c) { c.remove(); });
      stageQuotes.forEach(function (q) {
        var a = document.createElement('a');
        a.className = 'kanban-card';
        a.href = '../internal/' + quoteDetailHref(q.id);
        a.innerHTML = '<strong>' + q.id + '</strong><br><span class="tabular">' + fmtMoney((q.pricing && q.pricing.total) || 0) + '</span><br><small>' + fmtDate(q.updatedAt) + '</small>';
        col.appendChild(a);
      });
    });
  }

  function hydrateCrmDashboard() {
    /* Full KPI wiring lives in demo-hydrate-pages.js hydrateCrmDashboardFull */
  }

  /* ── Portal ── */
  function hydratePortalDashboard() {
    var state = S().getState();
    var cid = state.portal.activeCustomerId;
    var quotes = state.quotes.filter(function (q) {
      return q.customerId === cid && (q.channel === 'portal' || q.status === 'sent' || q.status === 'accepted');
    });
    var shipments = state.shipments.filter(function (sh) { return sh.customerId === cid; });
    document.querySelectorAll('.kpi-card .value, .stat-value').forEach(function (el, i) {
      if (i === 0) el.textContent = quotes.length;
      if (i === 1) el.textContent = shipments.filter(function (s) { return s.status !== 'delivered'; }).length;
    });
  }

  function hydratePortalQuoteRequest() {
    /* Live pricing wired in demo-hydrate-pages.js hydratePortalQuoteRequestFull */
  }

  function hydratePortalTracker() {
    var tbody = document.querySelector('.data-table tbody');
    if (!tbody) return;
    var cid = S().getState().portal.activeCustomerId;
    tbody.innerHTML = S().getState().shipments.filter(function (sh) {
      return sh.customerId === cid;
    }).map(function (sh) {
      return '<tr><td class="tabular">' + sh.id + '</td><td>' + sh.origin + ' → ' + sh.destination + '</td><td><span class="badge">' + sh.status + '</span></td><td class="tabular">' + (sh.eta || '—') + '</td><td class="actions">' +
        (sh.podAvailable ? '<a href="portal-pod.html?id=' + encodeURIComponent(sh.id) + '">POD</a>' : '—') + '</td></tr>';
    }).join('');
  }

  /* ── Wire forms (reference edits, admin) ── */
  function hydrateReferenceFuelEdit() {
    if (pageName() !== 'reference-fuel-edit') return;
    var fuel = S().getState().reference.fuel.slice(-1)[0];
    if (!fuel) return;
    var inputs = document.querySelectorAll('.card input.tabular');
    if (inputs[0]) inputs[0].value = fuel.effectiveDate;
    if (inputs[1]) inputs[1].value = fuel.pct;
    var save = document.querySelector('.btn-primary, a.btn-primary, button.btn-primary');
    if (save && !save._wired) {
      save._wired = true;
      save.addEventListener('click', function (e) {
        e.preventDefault();
        var pct = parseFloat(inputs[1].value) || fuel.pct;
        S().saveReferenceCollection('fuel', {
          id: fuel.id,
          effectiveDate: inputs[0].value,
          pct: pct,
          source: inputs[2] ? inputs[2].value : fuel.source,
          authorId: S().getState().meta.currentUserId
        });
        location.href = 'reference-fuel.html';
      });
    }
  }

  function hydratePortalConfirmation() {
    if (pageName() !== 'portal-quote-confirmation') return;
    var id = getQueryQuoteId();
    var q = id ? S().getQuote(id) : null;
    if (!q) return;
    var p = q.pricing || {};
    document.querySelectorAll('[data-portal-confirm-ref]').forEach(function (el) {
      var sh = S().getState().shipments.find(function (s) { return s.quoteId === q.id; });
      el.textContent = sh ? sh.id : q.id;
    });
    document.querySelectorAll('[data-portal-confirm-total]').forEach(function (el) {
      el.textContent = fmtMoney(p.total || 0);
    });
  }

  function wirePortalAccountSwitch() {
    document.querySelectorAll('[data-dropdown-select]').forEach(function (btn) {
      if (btn._wired) return;
      btn._wired = true;
      btn.addEventListener('click', function () {
        var name = btn.getAttribute('data-dropdown-select');
        var c = S().getState().customers.find(function (x) { return x.name === name; });
        if (c) {
          S().setPortalCustomer(c.id);
          location.reload();
        }
      });
    });
  }

  function hydrateAdminSystemConfig() {
    if (pageName() !== 'admin-system-config') return;
    var s = S().getState().settings;
    document.querySelectorAll('.card input.tabular, .card input[type="number"]').forEach(function (input) {
      var label = input.closest('.field') && input.closest('.field').querySelector('label');
      if (!label) return;
      var t = label.textContent.toLowerCase();
      if (t.indexOf('rep max') >= 0) input.value = s.repMaxDiscount;
      if (t.indexOf('margin floor') >= 0) input.value = s.marginFloor;
      if (t.indexOf('cubic') >= 0) input.value = s.cubicDivisor;
    });
  }

  function wireGenericForms() {
    document.querySelectorAll('[data-store-action="accept-quote"]').forEach(function (btn) {
      if (btn._wired) return;
      btn._wired = true;
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-quote-id') || getQueryQuoteId();
        if (id) { S().acceptQuote(id); location.reload(); }
      });
    });
  }

  function wireGenericSaveButtons() { /* replaced by demo-crud.js */ }

  var ROUTES = {
    quotes: hydrateQuotes,
    dashboard: hydrateDashboard,
    'quote-detail': hydrateQuoteDetail,
    'quote-detail-pending': hydrateQuoteDetail,
    customers: hydrateCustomers,
    'customer-detail': hydrateCustomerDetail,
    tariffs: hydrateTariffs,
    'tariffs-page2': hydrateTariffs,
    'tariff-detail': hydrateTariffDetail,
    'reference-fuel': hydrateReferenceFuel,
    'reference-fuel-edit': hydrateReferenceFuelEdit,
    'reference-accessorials': hydrateReferenceAccessorials,
    'quote-layer-templates': hydrateQuoteLayerTemplates,
    'reference-lanes-b2b': hydrateReferenceLanesB2b,
    'reference-tiers-hd': hydrateReferenceTiersHd,
    analytics: hydrateAnalytics,
    'admin-users': hydrateAdminUsers,
    'admin-system-config': hydrateAdminSystemConfig,
    login: hydrateLogin,
    'quote-pdf': hydrateQuotePdf,
    'quote-esign': hydrateQuoteEsign,
    'quote-tms-export': hydrateQuoteTmsExport,
    'crm-opportunities': hydrateCrmKanban,
    'crm-dashboard': hydrateCrmDashboard,
    'portal-dashboard': hydratePortalDashboard,
    'portal-quote-request': hydratePortalQuoteRequest,
    'portal-quote-confirmation': hydratePortalConfirmation,
    'portal-shipment-tracker': hydratePortalTracker,
    'portal-self-service': hydratePortalDashboard
  };

  function run() {
    if (!S()) return;
    var name = pageName();
    var fn = ROUTES[name];
    if (fn) fn();
    wireGenericForms();
    wirePortalAccountSwitch();
    fixQuoteLinks();
  }

  function fixQuoteLinks() {
    document.querySelectorAll('a[href="quote-detail-pending.html"], a[href="../internal/quote-detail-pending.html"]').forEach(function (a) {
      var text = (a.textContent || '').trim();
      var m = text.match(/Q-\d{4}-\d+/);
      var id = m ? m[0] : 'Q-2026-0847';
      var base = a.getAttribute('href').indexOf('../') === 0 ? '../internal/' : '';
      a.href = base + quoteDetailHref(id);
    });
    document.querySelectorAll('a[href="quote-detail.html"]').forEach(function (a) {
      if (a.href.indexOf('id=') >= 0) return;
      var m = (a.textContent || '').match(/Q-\d{4}-\d+/);
      if (m) a.href = quoteDetailHref(m[0]);
    });
  }

  function rerun() {
    run();
    if (P()) {
      P().initQuotesListEnhanced();
      P().initDashboardQuickApprove();
      P().initQuoteDetailApproval();
      P().initQuoteDetailBreakdown();
    }
  }

  global.AwestDemoHydrate = { run: run, rerun: rerun };
})(typeof window !== 'undefined' ? window : this);
