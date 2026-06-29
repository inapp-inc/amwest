/**
 * Cross-entity CRUD — session store smoke tests
 * Run: node js/crud-store.test.js
 */
(function (global) {
  'use strict';

  var passed = 0;
  var failed = 0;

  function assert(cond, msg) {
    if (cond) passed++;
    else {
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
  global.dispatchEvent = function () {};
  global.alert = function () {};

  require('./dummy-tariff-data.js');
require('./seed-data.js');
  require('./tariff-engine.js');
  require('./governance.js');
  require('./awest-store.js');

  var S = global.AwestStore;
  S.resetToSeed();

  /* Customer create + update */
  var custId = 'TEST-9999';
  S.saveCustomer({
    id: custId,
    code: custId,
    name: 'Test Customer Inc',
    repId: 'user-jordan',
    status: 'active',
    overallDiscPct: 4,
    serviceDiscounts: [{ service: 'B2B', pct: 4, density: 8.5 }],
    laneDiscounts: [],
    tariffIds: ['TAR-B2B-BASE'],
    tariffNotes: 'Test notes',
    pickupLocation: '123 Test St'
  });
  assert(S.getCustomer(custId) && S.getCustomer(custId).name === 'Test Customer Inc', 'create customer');
  S.saveCustomer({ id: custId, overallDiscPct: 6, serviceDiscounts: [{ service: 'B2B', pct: 6, density: 8.5 }] });
  assert(S.getCustomer(custId).overallDiscPct === 6, 'update customer discount');

  /* Fuel edit + override */
  var fuel = S.getState().reference.fuel.slice(-1)[0];
  S.saveReferenceCollection('fuel', { id: fuel.id, effectiveDate: fuel.effectiveDate, pct: 29.1, source: 'Manual', authorId: 'user-admin' });
  assert(S.getState().reference.fuel.slice(-1)[0].pct === 29.1, 'update fuel rate');
  S.saveReferenceCollection('fuel', {
    id: 'fuel-override-test',
    effectiveDate: '2026-06-22',
    pct: 30.0,
    source: 'Manual override',
    authorId: 'user-admin'
  });
  assert(S.getState().reference.fuel.length === 2, 'fuel override adds row');

  /* Admin invite + settings */
  var beforeUsers = S.getState().users.length;
  S.inviteUser({ email: 'test@americanwest.com', name: 'Test Invite', role: 'Sales Rep' });
  assert(S.getState().users.length === beforeUsers + 1, 'invite user');
  S.saveSettings({ agreementTemplate: 'Custom agreement {{customer}}' });
  assert(S.getState().settings.agreementTemplate.indexOf('Custom agreement') === 0, 'save agreement template');

  /* Validation lists */
  var lists = S.getState().validationLists;
  lists.origins = lists.origins.concat(['TEST-ORIGIN']);
  S.saveValidationLists(lists);
  assert(S.getState().validationLists.origins.indexOf('TEST-ORIGIN') >= 0, 'save validation list');

  /* Portal address + commodity */
  var cid = S.getState().portal.activeCustomerId;
  var addrBefore = S.getState().portal.addresses.length;
  S.savePortalAddress({ customerId: cid, label: 'Test dock', lines: '456 Warehouse Rd', default: false });
  assert(S.getState().portal.addresses.length === addrBefore + 1, 'portal address create');
  S.savePortalCommodity({ customerId: cid, name: 'Test SKU', nmfc: '12345', dims: '40×40×40' });
  assert(S.getState().portal.commodities.some(function (c) { return c.name === 'Test SKU'; }), 'portal commodity create');

  /* Portal quote */
  var pq = S.createPortalQuote({
    customerId: cid,
    origin: 'Seattle',
    destination: 'Portland',
    weight: 2000,
    status: 'sent',
    pricingOverride: { total: 1500, margin: 18 }
  });
  assert(pq && pq.channel === 'portal', 'create portal quote');
  assert(S.getQuote(pq.id), 'portal quote in store');

  /* Base tariff auto-resolve on create/update */
  var sariQ = S.createQuote({
    customerId: 'SARI-1211',
    primaryService: 'b2b',
    tariffId: 'TAR-PACI-B2B'
  });
  assert(sariQ && sariQ.tariffId === 'TAR-B2B-BASE', 'createQuote re-resolves stale tariffId for SARI');
  S.updateQuote(sariQ.id, { primaryService: 'threshold', tariffId: 'TAR-PACI-B2B' });
  assert(S.getQuote(sariQ.id).tariffId === 'TAR-HD-TH-002', 'updateQuote re-resolves tariff for Threshold');

  /* Quote approve lifecycle */
  S.setCurrentUser('user-morgan');
  S.approveQuote('Q-2026-0847');
  assert(S.getQuote('Q-2026-0847').status === 'approved', 'approve quote');

  /* Reference accessorial create */
  S.saveReferenceCollection('accessorials', {
    id: 'acc-test',
    name: 'Test acc',
    trigger: 'Always',
    rate: 50,
    rateType: 'flat',
    status: 'active'
  });
  assert(S.getState().reference.accessorials.some(function (a) { return a.id === 'acc-test'; }), 'create accessorial');

  /* TMS mapping */
  var b2b = S.getState().reference.tmsMapping.b2b.slice();
  if (b2b.length) b2b[0] = Object.assign({}, b2b[0], { tariffCode: 'XX9-TEST' });
  S.saveTmsMapping('b2b', b2b);
  assert(S.getState().reference.tmsMapping.b2b[0].tariffCode === 'XX9-TEST', 'save TMS mapping');

  /* Cleanup customer */
  S.deleteCustomer(custId);
  assert(!S.getCustomer(custId), 'delete customer');

  console.log('\nCRUD store tests: ' + passed + ' passed, ' + failed + ' failed');
  if (failed) process.exit(1);
})(typeof global !== 'undefined' ? global : this);
