/**
 * Pricing engine smoke test — run: node js/pricing-mock.test.js
 */
'use strict';

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL:', msg);
}

global.window = global;
global.sessionStorage = {
  _data: {},
  getItem: function (k) { return this._data[k] || null; },
  setItem: function (k, v) { this._data[k] = v; },
  removeItem: function (k) { delete this._data[k]; }
};
global.dispatchEvent = function () {};

require('./dummy-tariff-data.js');
require('./seed-data.js');
require('./tariff-engine.js');
require('./pricing-mock.js');

var seed = global.AwestSeed.build();
global.AwestTariffEngine.buildSeedRateMatrices(seed);
global.AwestTariffEngine.ensureTariffOriginGrid(seed);
global.AwestStore = {
  getState: function () { return seed; },
  getCustomer: function (id) {
    return seed.customers.find(function (c) { return c.id === id; });
  }
};

var P = global.AwestPricingMock;

assert(P.weightGroup(100) === 1, '100 lbs = group 1');
assert(P.weightGroup(4200) === 6, '4200 lbs = group 6');
assert(P.resolveOriginStation('27260') === 'TMV', '27260 → TMV');

var autoPaci = P.resolveAutoTariff(seed, 'PACI-1200', 'b2b');
assert(autoPaci && autoPaci.id === 'TAR-B2B-BASE', 'PACI auto-selects assigned B2B base tariff');

var autoSari = P.resolveAutoTariff(seed, 'SARI-1211', 'b2b');
assert(autoSari && autoSari.id === 'TAR-B2B-BASE', 'SARI auto-selects assigned B2B base tariff');

var autoPaciTh = P.resolveAutoTariff(seed, 'PACI-1200', 'threshold');
assert(autoPaciTh && autoPaciTh.id === 'TAR-HD-TH-002', 'PACI auto-selects assigned Threshold base tariff');

var lightQ = {
  pickupZip: '27260',
  deliveryZip: '29621',
  weight: 200,
  cube: 50,
  declaredValue: 10000,
  customerDiscPct: 0,
  quoteDiscPct: 0,
  laneOverride: 0
};
var light = P.enginePricing(lightQ, 'b2b');
assert(light.minimumApplied === true, 'light weight should hit minimum');
assert(light.minimum === 88, 'minimum should be $88');
assert(Math.abs(light.ratePerLb - 0.42) < 0.001, 'rate row resolved');

var heavyQ = Object.assign({}, lightQ, { weight: 4200 });
var heavy = P.enginePricing(heavyQ, 'b2b');
assert(heavy.linehaul >= 88, 'heavy linehaul above minimum');
assert(heavy.zoneKey === 'SC:293,296,297', 'SC zone resolved');

seed.rateMatrices['TAR-B2B-BASE::b2b_tmv'].rows[0].rates[5] = 0.5;
var heavy2 = P.enginePricing(Object.assign({}, heavyQ, { tariffId: 'TAR-B2B-BASE' }), 'b2b');
assert(heavy2.linehaul > heavy.linehaul, 'matrix rate edit increases linehaul');

var cfq = P.enginePricing({ pickupZip: '27260', deliveryZip: '59801', weight: 500, cube: 100 }, 'b2b');
assert(cfq.cfq === true, 'Missoula should CFQ');

var all = P.quoteAllServices(heavyQ);
assert(all.b2b && all.threshold && all.wgni && all.wgi, 'four services returned');
assert(all.threshold.total > all.b2b.total, 'HD threshold typically higher than B2B');

var adapter = {
  getState: function () { return seed; },
  getCustomer: function (id) { return seed.customers.find(function (c) { return c.id === id; }); }
};
var demoQ = {
  customerId: 'PACI-1200',
  primaryService: 'b2b',
  tariffId: 'TAR-B2B-BASE',
  quoteDiscPct: 0,
  laneOverride: 0,
  pickupZip: '27260',
  deliveryZip: '29621',
  weight: 4200,
  cube: 494,
  declaredValue: 45000
};
P.ensureQuotePricingModel(demoQ, adapter);
assert(demoQ.appliedTerms && demoQ.appliedTerms.customerDiscPctMaster === 5, 'applied terms snapshot');
assert(demoQ.quoteAdjustments && demoQ.quoteAdjustments.length > 0, 'quote adjustments seeded');
var ov = demoQ.quoteAdjustments.find(function (l) { return l.presetId === 'customer-disc-override'; });
ov.enabled = true;
ov.value = 8;
P.syncQuoteFlatFields(demoQ);
assert(P.hasCustomerDiscException(demoQ), 'customer disc exception detected');
var priced = P.pricingWithQuoteModel(demoQ, 'b2b', demoQ.appliedTerms, demoQ.quoteAdjustments);
assert(priced.custDiscPct === 8, 'exception disc applied to pricing');
assert(priced.custDiscSource === 'exception', 'exception source flagged');

require('./governance.js');
require('./awest-store.js');

var storeState = global.AwestSeed.build();
sessionStorage.setItem('awest:store', JSON.stringify(storeState));
global.AwestStore.load();

var q847 = global.AwestStore.getQuote('Q-2026-0847');
assert(q847 && q847.appliedTerms, 'Q-2026-0847 has applied terms');
assert(global.AwestPricingMock.hasCustomerDiscException(q847), 'Q-2026-0847 demo exception');
var masterBefore = q847.appliedTerms.customerDiscPctMaster;
global.AwestStore.saveCustomer(Object.assign({}, seed.customers.find(function (c) { return c.id === 'PACI-1200'; }), {
  serviceDiscounts: [
    { service: 'B2B', pct: 15, density: 8.5 },
    { service: 'Threshold', pct: 3, density: 8.5 },
    { service: 'White Glove No Inspection', pct: 5, density: 8.5 },
    { service: 'White Glove Inspection', pct: 4, density: 7.0 }
  ],
  overallDiscPct: 15
}));
q847 = global.AwestStore.getQuote('Q-2026-0847');
assert(q847.appliedTerms.customerDiscPctMaster === masterBefore, 'customer save preserves applied terms snapshot');

var gov = global.AwestGovernance.needsApproval(global.AwestStore.getState(), q847);
assert(gov && gov.type === 'customer_override', 'exception quote requires approval');

var storeMargin = global.AwestStore.computeQuotePricing(q847);
var engineMargin = global.AwestPricingMock.pricingWithLayers(
  q847, q847.primaryService || 'b2b', q847.quoteAdjustments
);
assert(storeMargin.margin === engineMargin.margin, 'margin consistent: store vs engine');
assert(storeMargin.total === engineMargin.total, 'total consistent: store vs engine');
assert(q847.pricing && q847.pricing.margin === storeMargin.margin, 'persisted pricing matches compute');

var q823 = global.AwestStore.getQuote('Q-2026-0823');
var p823Store = global.AwestStore.computeQuotePricing(q823);
var p823Engine = global.AwestPricingMock.pricingWithLayers(
  q823, q823.primaryService || 'b2b', q823.quoteAdjustments
);
assert(p823Store.margin === p823Engine.margin, 'Q-0823 margin consistent across paths');

console.log('Results:', passed, 'passed,', failed, 'failed');
process.exit(failed > 0 ? 1 : 0);
