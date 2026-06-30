/**
 * Tariff CRUD — session store (awest:store) smoke tests
 * Run: node js/tariff-store.test.js
 */
(function (global) {
  'use strict';

  var passed = 0;
  var failed = 0;

  function assert(cond, msg) {
    if (cond) {
      passed++;
    } else {
      failed++;
      console.error('FAIL:', msg);
    }
  }

  global.window = global;
  global.sessionStorage = {
    _data: {},
    getItem: function (k) { return this._data[k] || null; },
    setItem: function (k, v) { this._data[k] = v; },
    removeItem: function (k) { delete this._data[k]; }
  };
  global.localStorage = {
    _data: {},
    getItem: function (k) { return this._data[k] || null; },
    setItem: function (k, v) { this._data[k] = v; },
    removeItem: function (k) { delete this._data[k]; }
  };
  global.dispatchEvent = function () {};

require('./dummy-tariff-data.js');
require('./seed-data.js');
require('./tariff-engine.js');
require('./governance.js');
require('./awest-store.js');

  var S = global.AwestStore;
  S.resetToSeed();

  var testId = 'TAR-CRUD-TEST';
  S.saveTariff({
    id: testId,
    name: 'CRUD Test Tariff',
    type: 'Base',
    service: 'B2B',
    uom: 'CWT',
    customerId: null,
    status: 'draft',
    effectiveDate: '2026-06-01',
    version: 1,
    parentTariffId: null,
    config: {
      baseRateCwt: 59.5,
      minimumCharge: 290,
      marginFloorPct: 14,
      density: 8.0,
      rateTableLabel: 'Test Matrix',
      description: 'Created by tariff-store.test.js',
      effectiveEnd: '2026-12-31',
      baselineRules: [{ type: 'Promotion', scope: '—', value: 'None active', effect: '—' }]
    }
  });

  var created = S.getTariff(testId);
  assert(created && created.name === 'CRUD Test Tariff', 'create tariff');
  assert(created.config && created.config.baseRateCwt === 59.5, 'create tariff config');

  S.saveTariff({
    id: testId,
    name: 'CRUD Test Tariff (updated)',
    config: {
      baseRateCwt: 60.1,
      minimumCharge: 295,
      baselineRules: created.config.baselineRules.concat([
        { type: 'Commodity', scope: 'Upholstery', value: '+5%', effect: '+5% on base rate' }
      ])
    }
  });

  var updated = S.getTariff(testId);
  assert(updated.name === 'CRUD Test Tariff (updated)', 'update tariff name');
  assert(updated.config.baseRateCwt === 60.1, 'update tariff base rate');
  assert(updated.config.baselineRules.length === 2, 'update baseline rules');

  var matrixKey = testId + '::wgi_lax';
  S.saveRateMatrix(matrixKey, {
    tariffId: testId,
    comboId: 'wgi_lax',
    rows: [{ zone: '900', description: 'Test zone', rates: [1, 2, 3, 4, 5, 6, 7] }],
    savedAt: new Date().toISOString()
  });
  assert(S.getRateMatrix(testId, 'wgi_lax'), 'save rate matrix');
  assert(S.listRateMatrixKeys(testId).length === 1, 'list rate matrix keys');

  var cloned = S.cloneTariff(testId);
  assert(cloned && cloned.id !== testId, 'clone tariff');
  assert(cloned.name.indexOf('copy') >= 0, 'clone tariff name suffix');

  S.deleteTariff(testId);
  assert(!S.getTariff(testId), 'delete tariff');
  assert(S.listRateMatrixKeys(testId).length === 0, 'delete tariff cascades matrices');

  S.deleteTariff(cloned.id);

  S.saveTariff({
    id: 'TAR-RULES-TEST',
    name: 'Rules Test',
    config: {
      baselineRules: [
        { type: 'Commodity', scope: 'Upholstery', value: '+10%', effect: '+10% on base rate' }
      ]
    }
  });
  assert(S.getTariff('TAR-RULES-TEST').config.baselineRules[0].value === '+10%', 'baseline rules persist');
  S.deleteTariff('TAR-RULES-TEST');

  console.log('\nTariff store tests: ' + passed + ' passed, ' + failed + ' failed');
  if (failed) process.exit(1);
})(typeof global !== 'undefined' ? global : this);
