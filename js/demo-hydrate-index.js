/**
 * Landing page — live pricing copy + mockup index from catalog
 */
(function (global) {
  'use strict';

  function boot() {
    renderMockupIndex();
    if (!global.AwestStore || !global.AwestPricingMock) return;
    global.AwestStore.load();
    refreshLiveCopy();
    global.addEventListener('awest:change', refreshLiveCopy);
  }

  function renderMockupIndex() {
    var catalog = global.AwestMockupCatalog;
    if (!catalog) return;

    var mount = document.getElementById('wt-mockup-groups');
    if (mount) catalog.renderMockupGroups(mount);

    var count = catalog.pageCount();
    document.querySelectorAll('[data-mockup-page-count]').forEach(function (el) {
      el.textContent = String(count);
    });
    document.querySelectorAll('[data-store-version]').forEach(function (el) {
      el.textContent = 'v' + catalog.STORE_VERSION;
    });
  }

  function refreshLiveCopy() {
    if (!global.AwestStore || !global.AwestPricingMock) return;
    var P = global.AwestPricingMock;
    var S = global.AwestStore;
    var fmt = P.formatMoney.bind(P);
    var state = S.getState();
    var floor = state.settings.marginFloor || 15;

    var q847 = S.getQuote('Q-2026-0847');
    var q823 = S.getQuote('Q-2026-0823');
    var p847 = q847 ? S.computeQuotePricing(q847) : P.basePreset(7, { custDiscPct: 5 });
    var p823 = q823 ? S.computeQuotePricing(q823) : P.basePreset(0, { custDiscPct: 5 });

    var appliedMaster = q847 && q847.appliedTerms
      ? q847.appliedTerms.customerDiscPctMaster
      : p847.custDiscMaster || 5;
    var exceptionNote = p847.custDiscSource === 'exception'
      ? ' → −' + p847.custDiscPct + '% exception (−' + fmt(p847.custDiscAmt).replace('−', '') + ', master ' + appliedMaster + '%)'
      : (appliedMaster ? ' → −' + appliedMaster + '% applied (−' + fmt(p847.custDiscAmt).replace('−', '') + ')' : '');

    global.AwestLiveCopy = {
      quoteFormulaExample: function () {
        return '$' + p847.ratePerLb + '/lb × ' + Number(p847.weight || 4200).toLocaleString() + ' lbs = ' + fmt(p847.linehaul) +
          exceptionNote +
          (p847.quoteDiscPct ? ' → −' + p847.quoteDiscPct + '% quote (−' + fmt(p847.quoteDiscAmt).replace('−', '') + ')' : '') +
          ' → fuel ' + fmt(p847.fuel) +
          ' → accessorials ' + fmt(p847.insurance + p847.lift + p847.residential) +
          ' → total ' + fmt(p847.total) +
          ' → margin ' + (p847.margin || 0) + '% (floor ' + floor + '%)' +
          ' · Q-0823 applied-only: ' + fmt(p823.total) + ' @ ' + (p823.margin || 0) + '% margin';
      },
      marginQ847: p847.margin || 0,
      marginQ823: p823.margin || 0,
      marginFloor: floor,
      refresh: refreshLiveCopy
    };

    document.querySelectorAll('[data-live-quote-example]').forEach(function (el) {
      el.textContent = global.AwestLiveCopy.quoteFormulaExample();
    });
    document.querySelectorAll('[data-live-margin-q847]').forEach(function (el) {
      el.textContent = (p847.margin || 0) + '%';
    });
    document.querySelectorAll('[data-live-margin-q823]').forEach(function (el) {
      el.textContent = (p823.margin || 0) + '%';
    });
    document.querySelectorAll('[data-live-margin-floor]').forEach(function (el) {
      el.textContent = floor + '%';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
