/**
 * Landing page — live pricing copy from session store config
 */
(function (global) {
  'use strict';

  function boot() {
    if (!global.AwestStore || !global.AwestPricingMock) return;
    global.AwestStore.load();
    var P = global.AwestPricingMock;
    var S = global.AwestStore;
    var fmt = P.formatMoney.bind(P);

    var q847 = S.getQuote('Q-2026-0847');
    var q823 = S.getQuote('Q-2026-0823');
    var cfg = P.getPricingConfig();
    var svc = (q847 && q847.primaryService) || 'b2b';
    var p847 = q847 && P.pricingWithLayers
      ? P.pricingWithLayers(q847, svc, q847.quoteAdjustments)
      : (q847 && q847.pricing ? q847.pricing : P.basePreset(7, { custDiscPct: 5 }));
    var p823 = q823 && P.pricingWithLayers
      ? P.pricingWithLayers(q823, (q823.primaryService || 'b2b'), q823.quoteAdjustments)
      : (q823 && q823.pricing ? q823.pricing : P.basePreset(0, { custDiscPct: 5 }));

    var appliedMaster = q847 && q847.appliedTerms
      ? q847.appliedTerms.customerDiscPctMaster
      : p847.custDiscMaster || 5;
    var exceptionNote = p847.custDiscSource === 'exception'
      ? ' → −' + p847.custDiscPct + '% exception (−' + fmt(p847.custDiscAmt).replace('−', '') + ', master ' + appliedMaster + '%)'
      : (appliedMaster ? ' → −' + appliedMaster + '% applied (−' + fmt(p847.custDiscAmt).replace('−', '') + ')' : '');

    global.AwestLiveCopy = {
      quoteFormulaExample: function () {
        return '$' + cfg.ratePerLb + '/lb × ' + Number(cfg.weight).toLocaleString() + ' lbs = ' + fmt(cfg.linehaul) +
          exceptionNote +
          (p847.quoteDiscPct ? ' → −' + p847.quoteDiscPct + '% quote (−' + fmt(p847.quoteDiscAmt).replace('−', '') + ')' : '') +
          ' → fuel ' + fmt(p847.fuel) +
          ' → accessorials ' + fmt(p847.insurance + p847.lift + p847.residential) +
          ' → total ' + fmt(p847.total) +
          ' (standard Q-0823, applied only: ' + fmt(p823.total) + ')';
      }
    };

    document.querySelectorAll('[data-live-quote-example]').forEach(function (el) {
      el.textContent = global.AwestLiveCopy.quoteFormulaExample();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
