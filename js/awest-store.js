/**
 * Session store — simulated database in sessionStorage
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'awest:store';
  var state = null;

  function deepClone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function getPricing() {
    return global.AwestPricingMock;
  }

  function getGov() {
    return global.AwestGovernance;
  }

  function latestFuelPct(s) {
    if (!s.reference.fuel.length) return s.settings.demoLane.fuelPct;
    return s.reference.fuel[s.reference.fuel.length - 1].pct;
  }

  function storePricingAdapter(s) {
    return {
      getState: function () { return s; },
      getCustomer: function (id) {
        return s.customers.find(function (c) { return c.id === id; });
      }
    };
  }

  function ensureAllQuoteModels(s) {
    var P = getPricing();
    if (!P || !P.ensureQuotePricingModel) return;
    s.quotes.forEach(function (q) {
      P.ensureQuotePricingModel(q, storePricingAdapter(s));
    });
    decorateDemoQuotes(s);
  }

  function decorateDemoQuotes(s) {
    var q847 = s.quotes.find(function (q) { return q.id === 'Q-2026-0847'; });
    if (!q847 || !q847.quoteAdjustments || !q847.appliedTerms) return;
    var ov = q847.quoteAdjustments.find(function (l) { return l.presetId === 'customer-disc-override'; });
    if (!ov || ov._demoException) return;
    ov.enabled = true;
    ov.value = 8;
    ov.masterValue = q847.appliedTerms.customerDiscPctMaster;
    ov._demoException = true;
    var P = getPricing();
    if (P && P.syncQuoteFlatFields) P.syncQuoteFlatFields(q847);
  }

  function applyQuoteGovernance(q, s) {
    if (!q || q.pricingMode === 'override') return;
    var terminal = ['sent', 'expired', 'converted', 'lost', 'accepted'];
    if (terminal.indexOf(q.status) >= 0) return;
    var gov = getGov().needsApproval(s, q);
    if (gov) {
      if (q.status !== 'pending') q.status = 'pending';
      return;
    }
    if (q.status === 'pending') q.status = 'approved';
  }

  function computeQuotePricing(quote, s) {
    if (quote.pricingMode === 'override' && quote.pricingOverride) {
      var po = quote.pricingOverride;
      return {
        linehaul: 0, custDiscPct: quote.customerDiscPct, custDiscAmt: 0,
        quoteDiscPct: quote.quoteDiscPct || 0, quoteDiscAmt: 0,
        lane: quote.laneOverride || 0, fuel: 0, fuelPct: latestFuelPct(s),
        insurance: 0, lift: 0, residential: 0,
        total: po.total, margin: po.margin,
        stack: { linehaul: po.total * 0.6, fuel: po.total * 0.25, access: po.total * 0.15, disc: 0 },
        personalized: (quote.quoteDiscPct || 0) > 0
      };
    }
    var P = getPricing();
    if (!P || !P.enginePricing) return { total: 0, margin: 0, stack: { linehaul: 0, fuel: 0, access: 0, disc: 0 } };
    if (P.ensureQuotePricingModel) P.ensureQuotePricingModel(quote, storePricingAdapter(s));
    var p;
    if (P.pricingWithLayers) {
      p = P.pricingWithLayers(quote, quote.primaryService || 'b2b', quote.quoteAdjustments);
    } else {
      p = P.enginePricing(quote, quote.primaryService || 'b2b');
    }
    p.personalized = (quote.quoteDiscPct || 0) > 0 ||
      (P.hasCustomerDiscException && P.hasCustomerDiscException(quote));
    return p;
  }

  function recomputeQuote(quote, s) {
    quote.pricing = computeQuotePricing(quote, s);
    return quote;
  }

  function recomputeAllQuotes(s) {
    ensureAllQuoteModels(s);
    var P = getPricing();
    if (!P || !P.enginePricing) return;
    s.quotes.forEach(function (q) { recomputeQuote(q, s); });
  }

  function audit(s, entityType, entityId, action, summary) {
    s.auditEvents.push({
      id: uid('audit'),
      entityType: entityType,
      entityId: entityId,
      action: action,
      summary: summary,
      userId: s.meta.currentUserId,
      at: new Date().toISOString()
    });
  }

  function persist() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('AwestStore: persist failed', e);
    }
    global.dispatchEvent(new CustomEvent('awest:change', { detail: { state: state } }));
  }

  function load() {
    var raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        state = JSON.parse(raw);
        migrateStore(state);
        recomputeAllQuotes(state);
        return state;
      } catch (e) {
        console.warn('AwestStore: corrupt store, re-seeding', e);
      }
    }
    resetToSeed();
    return state;
  }

  function dummyTariff() {
    return global.AwestDummyTariff || {
      baseRateCwt: 77.77,
      priorBaseRateCwt: 75,
      minimumChargeTariff: 111,
      minimumChargeLane: 88,
      mctcLevel: 'DEMO-9001'
    };
  }

  function defaultTariffConfig(tariff, settings) {
    var td = (settings && settings.tariffDisplay) || {};
    var D = dummyTariff();
    return {
      baseRateCwt: td.baseRateCwt || D.baseRateCwt,
      priorBaseRateCwt: td.priorBaseRateCwt || D.priorBaseRateCwt,
      minimumCharge: td.minimumCharge || D.minimumChargeTariff,
      marginFloorPct: 15,
      density: 8.5,
      rateTableLabel: 'National B2B Matrix',
      description: tariff.name || '',
      effectiveEnd: '2026-12-31',
      baselineRules: tariff.id === 'TAR-B2B-BASE' ? [
        { type: 'Commodity', scope: 'Upholstery', value: '+8%', effect: '+8% on base rate' },
        { type: 'Minimum charge', scope: 'All lanes', value: '$' + D.minimumChargeLane, effect: 'Floor after rate × weight' },
        { type: 'Promotion', scope: '—', value: 'None active', effect: '—' }
      ] : [
        { type: 'Promotion', scope: '—', value: 'None active', effect: '—' }
      ]
    };
  }

  function ensureTariffConfigs(s) {
    (s.tariffs || []).forEach(function (t) {
      if (!t.config) t.config = defaultTariffConfig(t, s.settings);
    });
  }

  function bootstrapTariffData(s) {
    var TE = global.AwestTariffEngine;
    if (!TE) return;
    TE.ensureTariffOriginGrid(s);
    TE.buildSeedRateMatrices(s);
  }

  function migrateStore(s) {
    if (!s.settings.quoteLayerTemplates || !s.settings.quoteLayerTemplates.length) {
      var seed = global.AwestSeed.build();
      s.settings.quoteLayerTemplates = seed.settings.quoteLayerTemplates;
      s.settings.computedLayerLabels = seed.settings.computedLayerLabels;
    }
    if (!s.meta.version || s.meta.version < 3) {
      s.meta.version = 3;
    }
    if (!s.meta.version || s.meta.version < 4) {
      ensureTariffConfigs(s);
      s.meta.version = 4;
    }
    if (!s.meta.version || s.meta.version < 5) {
      ensureTariffConfigs(s);
      bootstrapTariffData(s);
      s.meta.version = 5;
    }
    if (!s.meta.version || s.meta.version < 6) {
      var seed6 = global.AwestSeed.build();
      s.tariffs = seed6.tariffs;
      (s.customers || []).forEach(function (c) {
        var sc = seed6.customers.find(function (x) { return x.id === c.id; });
        if (sc) c.tariffIds = (sc.tariffIds || []).slice();
      });
      var retiredTariffs = { 'TAR-PACI-B2B': 'TAR-B2B-BASE', 'TAR-SARI-V35': 'TAR-B2B-BASE' };
      (s.quotes || []).forEach(function (q) {
        if (retiredTariffs[q.tariffId]) q.tariffId = retiredTariffs[q.tariffId];
      });
      if (s.rateMatrices) {
        Object.keys(s.rateMatrices).forEach(function (key) {
          if (key.indexOf('TAR-PACI-B2B') === 0 || key.indexOf('TAR-SARI-V35') === 0) {
            delete s.rateMatrices[key];
          }
        });
      }
      ensureTariffConfigs(s);
      bootstrapTariffData(s);
      s.meta.version = 6;
    }
    if (!s.meta.version || s.meta.version < 7) {
      (s.quotes || []).forEach(function (q) {
        if (q.status === 'accepted') {
          q.status = 'converted';
          q.convertedAt = q.convertedAt || q.acceptedAt || q.updatedAt;
        }
      });
      s.meta.version = 7;
    }
    if (!s.meta.version || s.meta.version < 8) {
      (s.customers || []).forEach(function (c) {
        (c.serviceDiscounts || []).forEach(function (sd) {
          if (sd.density == null || sd.density === '') return;
          if (typeof sd.density === 'number') return;
          var NF = global.AwestNumericFields;
          sd.density = NF ? NF.parseDensity(sd.density, null) : parseFloat(String(sd.density).replace(/[^\d.-]/g, '')) || null;
        });
      });
      s.meta.version = 8;
    }
    if (!s.meta.version || s.meta.version < 9) {
      var seed9 = global.AwestSeed.build();
      s.settings.tariffDisplay = seed9.settings.tariffDisplay;
      s.tariffs = seed9.tariffs;
      s.reference = seed9.reference;
      s.rateMatrices = {};
      ensureTariffConfigs(s);
      bootstrapTariffData(s);
      s.meta.version = 9;
    }
  }

  function resetToSeed() {
    state = global.AwestSeed.build();
    ensureTariffConfigs(state);
    bootstrapTariffData(state);
    recomputeAllQuotes(state);
    persist();
    return state;
  }

  function getState() {
    if (!state) load();
    return state;
  }

  function commit(mutator) {
    mutator(state);
    recomputeAllQuotes(state);
    persist();
    return state;
  }

  /* ── Lookups ── */
  function getQuote(id) {
    return getState().quotes.find(function (q) { return q.id === id; });
  }

  function getCustomer(id) {
    return getState().customers.find(function (c) { return c.id === id; });
  }

  function getTariff(id) {
    return getState().tariffs.find(function (t) { return t.id === id; });
  }

  function getUser(id) {
    return getState().users.find(function (u) { return u.id === id; });
  }

  function getCurrentUser() {
    return getUser(getState().meta.currentUserId);
  }

  function getShipment(id) {
    return getState().shipments.find(function (sh) { return sh.id === id; });
  }

  /* ── Quotes ── */
  function updateQuote(id, partial) {
    return commit(function (s) {
      var q = s.quotes.find(function (x) { return x.id === id; });
      if (!q) return;
      Object.keys(partial).forEach(function (k) { q[k] = partial[k]; });
      if (q.pricingMode !== 'override') {
        if ('tariffId' in partial) {
          if (partial.tariffId == null || !getTariff(partial.tariffId)) {
            q.tariffId = resolveQuoteBaseTariff(s, q.customerId, q.primaryService);
          }
        } else if ('primaryService' in partial || 'customerId' in partial) {
          q.tariffId = resolveQuoteBaseTariff(s, q.customerId, q.primaryService);
        }
        syncAppliedTermsTariff(q, s);
      }
      if (partial.quoteDiscPct != null && q.quoteAdjustments && q.quoteAdjustments.length) {
        var ql = q.quoteAdjustments.find(function (l) { return l.presetId === 'quote-discount'; });
        if (ql) {
          ql.value = partial.quoteDiscPct;
          ql.enabled = true;
        }
      }
      var P = getPricing();
      if (P && P.ensureQuotePricingModel) P.ensureQuotePricingModel(q, storePricingAdapter(s));
      if (P && P.syncQuoteFlatFields) P.syncQuoteFlatFields(q);
      q.updatedAt = new Date().toISOString();
      recomputeQuote(q, s);
      applyQuoteGovernance(q, s);
      audit(s, 'quote', id, 'update', 'Quote updated');
    });
  }

  function approveQuote(id) {
    var s = getState();
    if (!getGov().canApprove(s)) {
      alert('Your role cannot approve quotes. Sign in as Sales Manager or Admin.');
      return null;
    }
    return commit(function (st) {
      var q = st.quotes.find(function (x) { return x.id === id; });
      if (!q || q.status !== 'pending') return;
      q.status = 'approved';
      q.approvedBy = st.meta.currentUserId;
      q.approvedAt = new Date().toISOString();
      q.updatedAt = q.approvedAt;
      audit(st, 'quote', id, 'approve', 'Quote approved');
    });
  }

  function rejectQuote(id, reason) {
    return commit(function (s) {
      var q = s.quotes.find(function (x) { return x.id === id; });
      if (!q) return;
      q.status = 'draft';
      q.rejectionReason = reason || '';
      q.updatedAt = new Date().toISOString();
      audit(s, 'quote', id, 'reject', 'Quote rejected');
    });
  }

  function nextQuoteId() {
    var s = getState();
    var max = 8400;
    s.quotes.forEach(function (q) {
      var m = q.id.match(/Q-2026-(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return 'Q-2026-' + String(max + 1).padStart(4, '0');
  }

  function resolveQuoteBaseTariff(s, customerId, serviceType) {
    var cid = customerId || 'PACI-1200';
    var svc = serviceType || 'b2b';
    if (global.AwestTariffEngine) {
      var t = global.AwestTariffEngine.resolveAutoTariff(s, cid, svc);
      if (t) return t.id;
    }
    return 'TAR-B2B-BASE';
  }

  function syncAppliedTermsTariff(q, s) {
    if (!q.appliedTerms) return;
    var t = getTariff(q.tariffId);
    q.appliedTerms.tariffId = q.tariffId;
    q.appliedTerms.tariffLabel = t ? t.name : q.tariffId;
  }

  function createQuote(partial) {
    var id = partial.id || nextQuoteId();
    commit(function (s) {
      var cust = getCustomer(partial.customerId);
      var serviceType = partial.primaryService || 'b2b';
      var q = Object.assign({
        id: id,
        customerId: partial.customerId || 'PACI-1200',
        repId: s.meta.currentUserId,
        channel: partial.channel || 'internal',
        status: partial.status || 'draft',
        pickupZip: partial.pickupZip || s.settings.demoLane.pickupZip || '27260',
        deliveryZip: partial.deliveryZip || s.settings.demoLane.deliveryZip || '29621',
        origin: partial.origin || 'High Point, NC',
        destination: partial.destination || 'Anderson, SC',
        originStation: partial.originStation || s.settings.demoLane.originStation || 'TMV',
        laneCode: partial.laneCode || 'SC:293,296,297',
        hdPoi: partial.hdPoi || 'Greenville Tier 1',
        tariffId: 'TAR-B2B-BASE',
        primaryService: serviceType,
        serviceFamily: partial.serviceFamily || 'b2b',
        appliedTerms: partial.appliedTerms || null,
        quoteAdjustments: partial.quoteAdjustments || null,
        adjustmentLayers: partial.adjustmentLayers || null,
        weight: partial.weight || s.settings.demoLane.weight || 4200,
        cube: partial.cube || s.settings.demoLane.cube || 494,
        commodity: partial.commodity || 'FAK',
        declaredValue: partial.declaredValue || 45000,
        customerDiscPct: partial.customerDiscPct != null ? partial.customerDiscPct : (cust ? cust.overallDiscPct : 5),
        quoteDiscPct: partial.quoteDiscPct || 0,
        laneOverride: partial.laneOverride != null ? partial.laneOverride : 0,
        pricingMode: partial.pricingMode || 'engine',
        lineItems: partial.lineItems || [],
        competitor: partial.competitor || null,
        artifacts: { pdf: { generatedAt: null }, esign: { status: 'none', sentAt: null, signedAt: null }, tmsExport: { status: 'none', exportedAt: null, error: null } },
        rejectionReason: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        approvedBy: null, approvedAt: null, sentAt: null, acceptedAt: null, convertedAt: null, expiredAt: null
      }, partial);
      if (q.pricingMode !== 'override') {
        if (partial.tariffId != null && getTariff(partial.tariffId)) {
          q.tariffId = partial.tariffId;
        } else {
          q.tariffId = resolveQuoteBaseTariff(s, q.customerId, q.primaryService);
        }
        syncAppliedTermsTariff(q, s);
      }
      var P = getPricing();
      if (P && P.ensureQuotePricingModel) {
        P.ensureQuotePricingModel(q, storePricingAdapter(s));
      }
      if (P && P.syncQuoteFlatFields) P.syncQuoteFlatFields(q);
      recomputeQuote(q, s);
      if (!partial.status) applyQuoteGovernance(q, s);
      s.quotes.unshift(q);
      audit(s, 'quote', id, 'create', 'Quote created');
    });
    return getQuote(id);
  }

  function generatePdf(quoteId) {
    return commit(function (s) {
      var q = s.quotes.find(function (x) { return x.id === quoteId; });
      if (!q) return;
      q.artifacts.pdf.generatedAt = new Date().toISOString();
      audit(s, 'quote', quoteId, 'pdf', 'PDF generated');
    });
  }

  function sendEsign(quoteId) {
    return commit(function (s) {
      var q = s.quotes.find(function (x) { return x.id === quoteId; });
      if (!q) return;
      if (!q.artifacts.pdf.generatedAt) {
        alert('Generate PDF before sending for e-signature.');
        return;
      }
      q.artifacts.esign.status = 'sent';
      q.artifacts.esign.sentAt = new Date().toISOString();
      audit(s, 'quote', quoteId, 'esign', 'Sent for e-signature');
    });
  }

  function exportTms(quoteId) {
    return commit(function (s) {
      var q = s.quotes.find(function (x) { return x.id === quoteId; });
      if (!q) return;
      if (!s.reference.tmsMapping.b2b.length) {
        q.artifacts.tmsExport.status = 'failed';
        q.artifacts.tmsExport.error = 'TMS mapping not configured';
        return;
      }
      q.artifacts.tmsExport.status = 'success';
      q.artifacts.tmsExport.exportedAt = new Date().toISOString();
      q.artifacts.tmsExport.error = null;
      audit(s, 'quote', quoteId, 'tms', 'Exported to TMS');
    });
  }

  function createShipmentFromQuote(s, q) {
    var shId = 'SH-' + String(8800 + s.shipments.length + 1);
    s.shipments.unshift({
      id: shId,
      customerId: q.customerId,
      quoteId: q.id,
      origin: q.origin,
      destination: q.destination,
      status: 'booked',
      eta: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
      podAvailable: false,
      milestones: ['Booked'],
      podUrl: 'portal-pod.html?id=' + shId
    });
    return shId;
  }

  function convertQuoteToShipment(quoteId) {
    return commit(function (s) {
      var q = s.quotes.find(function (x) { return x.id === quoteId; });
      if (!q || q.status === 'converted') return;
      q.status = 'converted';
      var now = new Date().toISOString();
      q.convertedAt = now;
      q.acceptedAt = q.acceptedAt || now;
      q.updatedAt = now;
      var shId = createShipmentFromQuote(s, q);
      audit(s, 'quote', quoteId, 'convert', 'Converted to shipment ' + shId);
    });
  }

  function acceptQuote(quoteId) {
    return convertQuoteToShipment(quoteId);
  }

  function expireQuote(quoteId) {
    return commit(function (s) {
      var q = s.quotes.find(function (x) { return x.id === quoteId; });
      if (!q) return;
      q.status = 'expired';
      q.expiredAt = new Date().toISOString();
      q.updatedAt = q.expiredAt;
      audit(s, 'quote', quoteId, 'expire', 'Quote expired');
    });
  }

  function markQuoteLost(quoteId) {
    return commit(function (s) {
      var q = s.quotes.find(function (x) { return x.id === quoteId; });
      if (!q) return;
      q.status = 'lost';
      q.updatedAt = new Date().toISOString();
      audit(s, 'quote', quoteId, 'status', 'Status → lost');
    });
  }

  function setQuoteStatus(id, status) {
    return commit(function (s) {
      var q = s.quotes.find(function (x) { return x.id === id; });
      if (!q) return;
      var now = new Date().toISOString();
      if (status === 'converted') {
        if (q.status === 'converted') return;
        q.status = 'converted';
        q.convertedAt = now;
        q.acceptedAt = q.acceptedAt || now;
        q.updatedAt = now;
        if (!s.shipments.some(function (sh) { return sh.quoteId === q.id; })) {
          createShipmentFromQuote(s, q);
        }
        audit(s, 'quote', id, 'convert', 'Converted to shipment');
        return;
      }
      q.status = status;
      q.updatedAt = now;
      if (status === 'sent') q.sentAt = now;
      if (status === 'expired') q.expiredAt = now;
      if (status === 'accepted') {
        q.status = 'converted';
        q.convertedAt = now;
        q.acceptedAt = now;
        createShipmentFromQuote(s, q);
        audit(s, 'quote', id, 'convert', 'Converted to shipment (legacy accepted)');
        return;
      }
      audit(s, 'quote', id, 'status', 'Status → ' + status);
    });
  }

  function sendQuote(id) {
    return setQuoteStatus(id, 'sent');
  }

  function signEsign(quoteId) {
    return commit(function (s) {
      var q = s.quotes.find(function (x) { return x.id === quoteId; });
      if (!q || q.artifacts.esign.status !== 'sent') return;
      q.artifacts.esign.status = 'signed';
      q.artifacts.esign.signedAt = new Date().toISOString();
      audit(s, 'quote', quoteId, 'esign', 'E-signature completed');
    });
  }

  function declineEsign(quoteId) {
    return commit(function (s) {
      var q = s.quotes.find(function (x) { return x.id === quoteId; });
      if (!q) return;
      q.artifacts.esign.status = 'declined';
      audit(s, 'quote', quoteId, 'esign', 'E-signature declined');
    });
  }

  function publishTariff(id) {
    return commit(function (s) {
      var t = s.tariffs.find(function (x) { return x.id === id; });
      if (!t) return;
      t.version = (t.version || 1) + 1;
      t.status = 'active';
      s.tariffVersions.push({
        tariffId: id,
        version: t.version,
        snapshot: deepClone(t),
        createdAt: new Date().toISOString(),
        authorId: s.meta.currentUserId
      });
      audit(s, 'tariff', id, 'publish', 'Published v' + t.version);
    });
  }

  function cloneTariff(id) {
    var src = getTariff(id);
    if (!src) return null;
    var newId = 'TAR-' + uid('clone').slice(-8).toUpperCase();
    saveTariff(Object.assign(deepClone(src), {
      id: newId,
      name: src.name + ' (copy)',
      version: 1,
      status: 'draft',
      parentTariffId: src.parentTariffId || null
    }));
    var prefix = id + '::';
    Object.keys(getState().rateMatrices || {}).forEach(function (key) {
      if (key.indexOf(prefix) !== 0) return;
      var combo = key.slice(prefix.length);
      var data = deepClone(getState().rateMatrices[key]);
      data.tariffId = newId;
      saveRateMatrix(newId + '::' + combo, data);
    });
    return getTariff(newId);
  }

  function rollbackTariff(id) {
    return commit(function (s) {
      var versions = s.tariffVersions.filter(function (v) { return v.tariffId === id; });
      if (!versions.length) return;
      var prev = versions[versions.length - 1].snapshot;
      var i = s.tariffs.findIndex(function (t) { return t.id === id; });
      if (i >= 0) s.tariffs[i] = Object.assign({}, prev);
      audit(s, 'tariff', id, 'rollback', 'Rolled back tariff');
    });
  }

  function saveTariffOverride(override) {
    commit(function (s) {
      if (!override.id) override.id = uid('ovr');
      var i = s.tariffOverrides.findIndex(function (o) { return o.id === override.id; });
      if (i >= 0) s.tariffOverrides[i] = override;
      else s.tariffOverrides.push(override);
      audit(s, 'tariff', override.tariffId, 'override', 'Override saved');
    });
  }

  function getRateMatrix(tariffId, comboId) {
    var key = tariffId + '::' + comboId;
    return getState().rateMatrices[key] || null;
  }

  function listRateMatrixKeys(tariffId) {
    var prefix = tariffId + '::';
    return Object.keys(getState().rateMatrices).filter(function (k) { return k.indexOf(prefix) === 0; });
  }

  function saveRateMatrix(key, data) {
    commit(function (s) {
      s.rateMatrices[key] = data;
      var tariffId = String(key).split('::')[0];
      audit(s, 'tariff', tariffId, 'matrix', 'Rate matrix saved');
    });
  }

  function saveFollowUp(fu) {
    commit(function (s) {
      if (!fu.id) fu.id = uid('fu');
      var i = s.crm.followUps.findIndex(function (x) { return x.id === fu.id; });
      if (i >= 0) s.crm.followUps[i] = fu;
      else s.crm.followUps.push(fu);
    });
  }

  function deleteFollowUp(id) {
    commit(function (s) {
      s.crm.followUps = s.crm.followUps.filter(function (x) { return x.id !== id; });
    });
  }

  function savePortalTicket(ticket) {
    commit(function (s) {
      if (!ticket.id) ticket.id = uid('tkt');
      ticket.createdAt = ticket.createdAt || new Date().toISOString();
      var i = s.portal.supportTickets.findIndex(function (x) { return x.id === ticket.id; });
      if (i >= 0) s.portal.supportTickets[i] = ticket;
      else s.portal.supportTickets.push(ticket);
    });
  }

  function deletePortalAddress(id) {
    commit(function (s) {
      s.portal.addresses = s.portal.addresses.filter(function (a) { return a.id !== id; });
    });
  }

  function deletePortalCommodity(id) {
    commit(function (s) {
      s.portal.commodities = s.portal.commodities.filter(function (c) { return c.id !== id; });
    });
  }

  function inviteUser(partial) {
    var id = uid('user');
    saveUser(Object.assign({
      id: id,
      name: partial.name || 'New User',
      email: partial.email,
      role: partial.role || 'Sales Rep',
      status: 'pending',
      quoteCount: 0
    }, partial));
    return getUser(id);
  }

  function setAssistantPrefill(data) {
    try {
      sessionStorage.setItem('awest:assistant-prefill', JSON.stringify(data));
    } catch (e) { /* ignore */ }
  }

  function getAssistantPrefill() {
    try {
      var raw = sessionStorage.getItem('awest:assistant-prefill');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function clearAssistantPrefill() {
    sessionStorage.removeItem('awest:assistant-prefill');
  }

  function getRepLeaderboard() {
    var s = getState();
    var reps = {};
    s.quotes.forEach(function (q) {
      if (!q.repId) return;
      if (!reps[q.repId]) reps[q.repId] = { quotes: 0, won: 0, lost: 0 };
      reps[q.repId].quotes++;
      if (q.status === 'converted') reps[q.repId].won++;
      if (q.status === 'accepted') reps[q.repId].won++;
      if (q.status === 'lost') reps[q.repId].lost++;
    });
    return s.users.filter(function (u) {
      return u.role === 'Sales Rep' || u.role === 'Sales Manager';
    }).map(function (u) {
      var r = reps[u.id] || { quotes: 0, won: 0, lost: 0 };
      var wr = r.won + r.lost > 0 ? Math.round((r.won / (r.won + r.lost)) * 100) : 0;
      return { user: u, quoteCount: r.quotes, winRate: wr };
    });
  }

  function getLaneAnalytics() {
    var s = getState();
    var lanes = {};
    s.quotes.forEach(function (q) {
      var lane = q.laneCode || 'UNKNOWN';
      if (!lanes[lane]) lanes[lane] = { count: 0, marginSum: 0 };
      lanes[lane].count++;
      var p = computeQuotePricing(q, s);
      lanes[lane].marginSum += p.margin || 0;
      lanes[lane].customer = (s.customers.find(function (c) { return c.id === q.customerId; }) || {}).name || q.customerId;
    });
    return Object.keys(lanes).map(function (lane) {
      var L = lanes[lane];
      return {
        lane: lane,
        quotes: L.count,
        avgMargin: L.count ? Math.round((L.marginSum / L.count) * 10) / 10 : 0,
        customer: L.customer
      };
    });
  }

  function getAvgQuoteAging() {
    var s = getState();
    var sent = s.quotes.filter(function (q) { return q.status === 'sent' && q.sentAt; });
    if (!sent.length) return 0;
    var totalDays = sent.reduce(function (sum, q) {
      return sum + (Date.now() - new Date(q.sentAt).getTime()) / 86400000;
    }, 0);
    return Math.round((totalDays / sent.length) * 10) / 10;
  }

  function recomputeQuotesForCustomer(customerId) {
    commit(function (s) {
      var c = s.customers.find(function (x) { return x.id === customerId; });
      if (!c) return;
      var P = getPricing();
      s.quotes.forEach(function (q) {
        if (q.customerId !== customerId) return;
        if (P && P.ensureQuotePricingModel) {
          P.ensureQuotePricingModel(q, storePricingAdapter(s));
        }
        recomputeQuote(q, s);
      });
    });
  }

  /* ── Customers ── */
  function saveCustomer(customer) {
    commit(function (s) {
      var i = s.customers.findIndex(function (c) { return c.id === customer.id; });
      if (i >= 0) s.customers[i] = Object.assign({}, s.customers[i], customer);
      else s.customers.push(customer);
      var P = getPricing();
      s.quotes.forEach(function (q) {
        if (q.customerId !== customer.id) return;
        if (q.appliedTerms) {
          recomputeQuote(q, s);
          return;
        }
        if (P && P.ensureQuotePricingModel) {
          P.ensureQuotePricingModel(q, storePricingAdapter(s));
        } else {
          q.customerDiscPct = customer.overallDiscPct;
        }
        recomputeQuote(q, s);
      });
      audit(s, 'customer', customer.id, 'save', 'Customer saved');
    });
  }

  function deleteCustomer(id) {
    commit(function (s) {
      s.customers = s.customers.filter(function (c) { return c.id !== id; });
    });
  }

  /* ── Tariffs ── */
  function saveTariff(tariff) {
    commit(function (s) {
      ensureTariffConfigs(s);
      var i = s.tariffs.findIndex(function (t) { return t.id === tariff.id; });
      if (i >= 0) {
        var prev = s.tariffs[i];
        s.tariffs[i] = Object.assign({}, prev, tariff);
        if (tariff.config) {
          s.tariffs[i].config = Object.assign({}, prev.config || {}, tariff.config);
          if (tariff.config.baselineRules) {
            s.tariffs[i].config.baselineRules = tariff.config.baselineRules.slice();
          }
        }
      } else {
        var next = Object.assign({}, tariff);
        if (!next.config) next.config = defaultTariffConfig(next, s.settings);
        s.tariffs.push(next);
      }
      audit(s, 'tariff', tariff.id, 'save', 'Tariff saved');
    });
  }

  function deleteTariff(id) {
    commit(function (s) {
      s.tariffs = s.tariffs.filter(function (t) { return t.id !== id; });
      Object.keys(s.rateMatrices).forEach(function (key) {
        if (key.indexOf(id + '::') === 0) delete s.rateMatrices[key];
      });
      s.tariffOverrides = (s.tariffOverrides || []).filter(function (o) { return o.tariffId !== id; });
      audit(s, 'tariff', id, 'delete', 'Tariff deleted');
    });
  }

  /* ── Reference ── */
  function saveReferenceCollection(collection, item) {
    commit(function (s) {
      var arr = s.reference[collection];
      if (!arr) return;
      var i = arr.findIndex(function (x) { return x.id === item.id; });
      if (i >= 0) arr[i] = Object.assign({}, arr[i], item);
      else arr.push(item);
      if (collection === 'fuel') {
        s.reference.fuelHistory.push({
          fuelId: item.id,
          action: i >= 0 ? 'updated' : 'created',
          at: new Date().toISOString(),
          by: s.meta.currentUserId
        });
        recomputeAllQuotes(s);
      }
      if (collection === 'accessorials') {
        recomputeAllQuotes(s);
      }
      audit(s, 'reference', collection, 'save', collection + ' item saved');
    });
  }

  function deleteReferenceItem(collection, id) {
    commit(function (s) {
      s.reference[collection] = s.reference[collection].filter(function (x) { return x.id !== id; });
    });
  }

  function saveTmsMapping(tab, rows) {
    commit(function (s) {
      s.reference.tmsMapping[tab] = rows;
      audit(s, 'reference', 'tmsMapping', 'save', 'TMS mapping saved');
    });
  }

  /* ── Users ── */
  function saveUser(user) {
    commit(function (s) {
      var i = s.users.findIndex(function (u) { return u.id === user.id; });
      if (i >= 0) s.users[i] = Object.assign({}, s.users[i], user);
      else s.users.push(user);
    });
  }

  function setCurrentUser(userId) {
    commit(function (s) {
      s.meta.currentUserId = userId;
      s.meta.lastLoginAt = new Date().toISOString();
    });
  }

  /* ── Portal ── */
  function setPortalCustomer(customerId) {
    commit(function (s) {
      s.portal.activeCustomerId = customerId;
    });
  }

  function savePortalAddress(addr) {
    commit(function (s) {
      if (!addr.id) addr.id = uid('addr');
      var i = s.portal.addresses.findIndex(function (a) { return a.id === addr.id; });
      if (i >= 0) s.portal.addresses[i] = addr;
      else s.portal.addresses.push(addr);
    });
  }

  function savePortalCommodity(c) {
    commit(function (s) {
      if (!c.id) c.id = uid('comm');
      var i = s.portal.commodities.findIndex(function (x) { return x.id === c.id; });
      if (i >= 0) s.portal.commodities[i] = c;
      else s.portal.commodities.push(c);
    });
  }

  function createPortalQuote(partial) {
    return createQuote(Object.assign({}, partial, { channel: 'portal', status: partial.status || 'sent' }));
  }

  /* ── Settings ── */
  function saveSettings(partial) {
    commit(function (s) {
      Object.assign(s.settings, partial);
      if (partial.tariffDisplay || partial.demoLane) {
        recomputeAllQuotes(s);
      }
    });
  }

  function saveValidationLists(lists) {
    commit(function (s) {
      Object.assign(s.validationLists, lists);
    });
  }

  /* ── Derived metrics ── */
  function getMetrics() {
    var s = getState();
    var quotes = s.quotes.filter(function (q) { return q.channel === 'internal' || !q.channel; });
    var open = quotes.filter(function (q) {
      return ['draft', 'pending', 'approved', 'sent'].indexOf(q.status) >= 0;
    });
    var pending = quotes.filter(function (q) { return q.status === 'pending'; });
    var sentWeek = quotes.filter(function (q) {
      return q.status === 'sent' && q.sentAt && (Date.now() - new Date(q.sentAt).getTime()) < 7 * 86400000;
    });
    var converted = quotes.filter(function (q) {
      return q.status === 'converted' || q.status === 'accepted';
    });
    var lost = quotes.filter(function (q) { return q.status === 'lost'; });
    var winRate = converted.length + lost.length > 0
      ? Math.round((converted.length / (converted.length + lost.length)) * 100)
      : 68;
    var pipelineTotal = quotes.reduce(function (sum, q) {
      return sum + (computeQuotePricing(q, getState()).total || 0);
    }, 0);
    return {
      openCount: open.length,
      pendingCount: pending.length,
      sentWeekCount: sentWeek.length || 1,
      winRate: winRate,
      pipelineTotal: pipelineTotal
    };
  }

  function exportState() {
    return deepClone(getState());
  }

  function importState(json) {
    state = json;
    recomputeAllQuotes(state);
    persist();
  }

  global.AwestStore = {
    load: load,
    getState: getState,
    commit: commit,
    resetToSeed: resetToSeed,
    persist: persist,
    getQuote: getQuote,
    getCustomer: getCustomer,
    getTariff: getTariff,
    getUser: getUser,
    getCurrentUser: getCurrentUser,
    getShipment: getShipment,
    updateQuote: updateQuote,
    approveQuote: approveQuote,
    rejectQuote: rejectQuote,
    createQuote: createQuote,
    generatePdf: generatePdf,
    sendEsign: sendEsign,
    exportTms: exportTms,
    acceptQuote: acceptQuote,
    convertQuoteToShipment: convertQuoteToShipment,
    expireQuote: expireQuote,
    markQuoteLost: markQuoteLost,
    setQuoteStatus: setQuoteStatus,
    sendQuote: sendQuote,
    signEsign: signEsign,
    declineEsign: declineEsign,
    publishTariff: publishTariff,
    cloneTariff: cloneTariff,
    rollbackTariff: rollbackTariff,
    saveTariffOverride: saveTariffOverride,
    getRateMatrix: getRateMatrix,
    listRateMatrixKeys: listRateMatrixKeys,
    saveRateMatrix: saveRateMatrix,
    saveFollowUp: saveFollowUp,
    deleteFollowUp: deleteFollowUp,
    savePortalTicket: savePortalTicket,
    deletePortalAddress: deletePortalAddress,
    deletePortalCommodity: deletePortalCommodity,
    inviteUser: inviteUser,
    setAssistantPrefill: setAssistantPrefill,
    getAssistantPrefill: getAssistantPrefill,
    clearAssistantPrefill: clearAssistantPrefill,
    getRepLeaderboard: getRepLeaderboard,
    getLaneAnalytics: getLaneAnalytics,
    getAvgQuoteAging: getAvgQuoteAging,
    recomputeQuotesForCustomer: recomputeQuotesForCustomer,
    saveCustomer: saveCustomer,
    deleteCustomer: deleteCustomer,
    saveTariff: saveTariff,
    deleteTariff: deleteTariff,
    saveReferenceCollection: saveReferenceCollection,
    deleteReferenceItem: deleteReferenceItem,
    saveTmsMapping: saveTmsMapping,
    saveUser: saveUser,
    setCurrentUser: setCurrentUser,
    setPortalCustomer: setPortalCustomer,
    savePortalAddress: savePortalAddress,
    savePortalCommodity: savePortalCommodity,
    createPortalQuote: createPortalQuote,
    saveSettings: saveSettings,
    saveValidationLists: saveValidationLists,
    getMetrics: getMetrics,
    computeQuotePricing: function (q) { return computeQuotePricing(q, getState()); },
    getQuotePricing: function (quoteOrId) {
      var q = typeof quoteOrId === 'string' ? getQuote(quoteOrId) : quoteOrId;
      if (!q) return null;
      return computeQuotePricing(q, getState());
    },
    recomputeAllQuotes: function () {
      if (!state) load();
      recomputeAllQuotes(state);
      persist();
    },
    exportState: exportState,
    importState: importState,
    uid: uid
  };
})(typeof window !== 'undefined' ? window : this);
