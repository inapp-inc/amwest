/**
 * Workflow & governance — role checks and approval rules
 */
(function (global) {
  'use strict';

  var ROLES = {
    'Sales Rep': { canApprove: false, canEditTariff: false, canManageUsers: false },
    'Sales Manager': { canApprove: true, canEditTariff: false, canManageUsers: false },
    Operations: { canApprove: false, canEditTariff: true, canManageUsers: false },
    Admin: { canApprove: true, canEditTariff: true, canManageUsers: true }
  };

  function getRoleCaps(role) {
    return ROLES[role] || ROLES['Sales Rep'];
  }

  function needsApproval(state, quote) {
    var s = state.settings;
    var P = typeof global !== 'undefined' ? global.AwestPricingMock : null;
    var Store = typeof global !== 'undefined' ? global.AwestStore : null;
    var effectiveCust = quote.customerDiscPct || 0;
    if (P && P.getEffectiveCustomerDisc) effectiveCust = P.getEffectiveCustomerDisc(quote);
    var totalDisc = effectiveCust + (quote.quoteDiscPct || 0);
    var pricing = Store && Store.computeQuotePricing
      ? Store.computeQuotePricing(quote)
      : (quote.pricing || {});
    var margin = pricing.margin != null ? pricing.margin : 0;
    if (P && P.hasCustomerDiscException && P.hasCustomerDiscException(quote)) {
      return {
        type: 'customer_override',
        msg: 'Customer discount exception (' + effectiveCust + '%) differs from snapshotted master (' +
          quote.appliedTerms.customerDiscPctMaster + '%) — manager approval required.'
      };
    }
    if (totalDisc > s.repMaxDiscount) {
      return {
        type: 'discount',
        msg: 'Combined discount of ' + totalDisc + '% exceeds rep authority (max ' + s.repMaxDiscount + '%).'
      };
    }
    if (margin < s.marginFloor) {
      return {
        type: 'margin',
        msg: 'Custom discount reduced margin to ' + margin + '% (floor ' + s.marginFloor + '%).'
      };
    }
    return null;
  }

  function canApprove(state) {
    var user = state.users.find(function (u) { return u.id === state.meta.currentUserId; });
    return user && getRoleCaps(user.role).canApprove;
  }

  function canEditTariff(state) {
    var user = state.users.find(function (u) { return u.id === state.meta.currentUserId; });
    return user && getRoleCaps(user.role).canEditTariff;
  }

  function canManageUsers(state) {
    var user = state.users.find(function (u) { return u.id === state.meta.currentUserId; });
    return user && getRoleCaps(user.role).canManageUsers;
  }

  /* Quote lifecycle: Draft → Pending Approval → Approved → Sent → {Expired | Converted | Lost} */
  var QUOTE_LIFECYCLE_LINEAR = ['draft', 'pending', 'approved', 'sent'];
  var QUOTE_LIFECYCLE_TERMINAL = ['expired', 'converted', 'lost'];
  var QUOTE_STATUS_LABELS = {
    draft: 'Draft',
    pending: 'Pending Approval',
    approved: 'Approved',
    sent: 'Sent',
    expired: 'Expired',
    converted: 'Converted to Shipment',
    lost: 'Lost Opportunity',
    accepted: 'Converted to Shipment'
  };

  function normalizeQuoteStatus(status) {
    return status === 'accepted' ? 'converted' : status;
  }

  function quoteStatusLabel(status) {
    var st = normalizeQuoteStatus(status);
    return QUOTE_STATUS_LABELS[st] || status;
  }

  function isQuoteOpen(status) {
    return QUOTE_LIFECYCLE_LINEAR.indexOf(status) >= 0;
  }

  function isQuoteTerminal(status) {
    return QUOTE_LIFECYCLE_TERMINAL.indexOf(normalizeQuoteStatus(status)) >= 0;
  }

  function renderQuoteStepperHtml(status, stepClass) {
    stepClass = stepClass || 'step';
    var st = normalizeQuoteStatus(status);
    var linearIdx = QUOTE_LIFECYCLE_LINEAR.indexOf(st);
    var isTerminal = QUOTE_LIFECYCLE_TERMINAL.indexOf(st) >= 0;
    var parts = [];

    QUOTE_LIFECYCLE_LINEAR.forEach(function (step, i) {
      var cls = stepClass;
      if (isTerminal || linearIdx > i) cls += ' done';
      if (!isTerminal && linearIdx === i) cls += ' active';
      parts.push('<span class="' + cls + '">' + quoteStatusLabel(step) + '</span>');
      parts.push('<span class="arrow">→</span>');
    });

    if (isTerminal) {
      parts.push('<span class="' + stepClass + ' active quote-lifecycle-terminal quote-lifecycle-terminal--' + st + '">' + quoteStatusLabel(st) + '</span>');
    } else if (st === 'sent') {
      parts.push('<span class="quote-lifecycle-branch text-muted-sm">→ Expired · Converted to Shipment · Lost Opportunity</span>');
    } else {
      parts.pop();
    }
    return parts.join('');
  }

  function renderQuoteLifecycleStrip(status) {
    var st = normalizeQuoteStatus(status);
    var linearIdx = QUOTE_LIFECYCLE_LINEAR.indexOf(st);
    var isTerminal = QUOTE_LIFECYCLE_TERMINAL.indexOf(st) >= 0;
    var html = '<div class="quote-lifecycle-strip">';
    QUOTE_LIFECYCLE_LINEAR.forEach(function (step, i) {
      var cls = 'quote-lifecycle-step';
      if (isTerminal || linearIdx > i) cls += ' done';
      if (!isTerminal && linearIdx === i) cls += ' active';
      html += '<span class="' + cls + '">' + quoteStatusLabel(step) + '</span>';
    });
    if (isTerminal) {
      html += '<span class="quote-lifecycle-step active">' + quoteStatusLabel(st) + '</span>';
    }
    html += '</div>';
    return html;
  }

  var QUOTE_NEXT_STEP = {
    draft: 'Next step: finalize the quote or submit for manager approval if discounts exceed your authority.',
    pending: 'Next step: a Sales Manager approves or rejects this quote.',
    approved: 'Next step: generate a PDF and send the quote to the customer.',
    sent: 'Next step: customer books the shipment, the quote expires, or mark as lost if they decline.',
    expired: 'This quote expired without conversion. Create a new quote if the customer returns.',
    converted: 'Quote converted to shipment — track progress in the customer portal shipment tracker.',
    lost: 'This opportunity was marked lost. Create a new quote if the customer returns.'
  };

  function quoteNextStep(status) {
    return QUOTE_NEXT_STEP[normalizeQuoteStatus(status)] || '';
  }

  global.AwestGovernance = {
    getRoleCaps: getRoleCaps,
    needsApproval: needsApproval,
    canApprove: canApprove,
    canEditTariff: canEditTariff,
    canManageUsers: canManageUsers,
    QUOTE_LIFECYCLE_LINEAR: QUOTE_LIFECYCLE_LINEAR,
    QUOTE_LIFECYCLE_TERMINAL: QUOTE_LIFECYCLE_TERMINAL,
    QUOTE_STATUS_LABELS: QUOTE_STATUS_LABELS,
    normalizeQuoteStatus: normalizeQuoteStatus,
    quoteStatusLabel: quoteStatusLabel,
    isQuoteOpen: isQuoteOpen,
    isQuoteTerminal: isQuoteTerminal,
    renderQuoteStepperHtml: renderQuoteStepperHtml,
    renderQuoteLifecycleStrip: renderQuoteLifecycleStrip,
    quoteNextStep: quoteNextStep
  };

  var BASE_RATE_LABELS = {
    cwt: 'Base rate ($/CWT)',
    cube: 'Base rate ($/cu ft)',
    seat: 'Base rate ($/seat)',
    invoice: 'Base rate (% of invoice)',
    flat: 'Base rate ($, flat)',
    spot: 'Base rate (spot)'
  };

  function parseNumericField(val, fallback) {
    if (val == null || val === '' || val === '—' || val === '-') {
      return fallback != null ? fallback : 0;
    }
    var n = parseFloat(String(val).replace(/[,$+%\s]/g, ''));
    return isNaN(n) ? (fallback != null ? fallback : 0) : n;
  }

  function formatNumericField(n, decimals) {
    if (n == null || isNaN(n)) return '';
    if (decimals != null) return Number(n).toFixed(decimals);
    var r = Math.round(Number(n) * 100) / 100;
    return r % 1 === 0 ? String(r) : String(r);
  }

  function baseRateLabelForUom(uom) {
    return BASE_RATE_LABELS[String(uom || 'cwt').toLowerCase()] || 'Base rate';
  }

  function parseDensityField(val, fallback) {
    if (val == null || val === '' || val === '—' || val === '-') {
      return fallback != null ? fallback : null;
    }
    return parseNumericField(val, fallback != null ? fallback : 8.5);
  }

  function formatDensityLabel(n) {
    if (n == null || n === '' || n === '—') return '—';
    var v = parseNumericField(n, null);
    if (v == null || isNaN(v)) return '—';
    return formatNumericField(v, 1) + ' lbs/cu ft';
  }

  global.AwestNumericFields = {
    parse: parseNumericField,
    format: formatNumericField,
    baseRateLabelForUom: baseRateLabelForUom,
    parseDensity: parseDensityField,
    formatDensityLabel: formatDensityLabel,
    BASE_RATE_LABELS: BASE_RATE_LABELS
  };
})(typeof window !== 'undefined' ? window : this);
