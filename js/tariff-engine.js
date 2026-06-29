/**
 * Tariff resolution — inheritance, rate matrices, origin grid, baseline rules
 */
(function (global) {
  'use strict';

  var AW_ORIGINS = ['LAX', 'SFO', 'DFW', 'EWR', 'TMV', 'PHX', 'ATL'];
  var SERVICE_TYPES = ['b2b', 'threshold', 'wgni', 'wgi'];
  var SERVICE_PREFIX = { b2b: 'b2b', threshold: 'thr', wgni: 'wgni', wgi: 'wgi' };
  var SERVICE_LABEL = { b2b: 'B2B', threshold: 'Threshold', wgni: 'WGNI', wgi: 'WGI' };
  var DEFAULT_BASE = {
    b2b: 'TAR-B2B-BASE',
    threshold: 'TAR-HD-TH-002',
    wgni: 'TAR-WGNI-BASE',
    wgi: 'TAR-WGI-BASE'
  };

  function dummyTariff() {
    return global.AwestDummyTariff || { minimumChargeLane: 88 };
  }

  function parseNum(val) {
    if (val == null) return 0;
    var n = parseFloat(String(val).replace(/[,$+%\s]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  function parsePct(val) {
    var s = String(val || '');
    var m = s.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
    if (m) return parseFloat(m[1]);
    if (s.indexOf('%') >= 0) return parseNum(s);
    return 0;
  }

  function parseMoney(val) {
    return parseNum(val);
  }

  function serviceTypeFromTariff(t) {
    if (!t) return 'b2b';
    var svc = String(t.service || '').toLowerCase();
    if (svc.indexOf('threshold') >= 0) return 'threshold';
    if (svc === 'wgni' || svc.indexOf('no insp') >= 0) return 'wgni';
    if (svc === 'wgi' || svc.indexOf('glove') >= 0) return 'wgi';
    return 'b2b';
  }

  function tariffMatchesService(t, serviceType) {
    return serviceTypeFromTariff(t) === serviceType;
  }

  function comboId(serviceType, originStation) {
    var prefix = SERVICE_PREFIX[serviceType] || 'b2b';
    var code = String(originStation || 'tmv').toLowerCase();
    return prefix + '_' + code;
  }

  function defaultOriginCell() {
    return { density: 8.5, minAdjPct: 0, linehaulAdjPct: 0 };
  }

  function defaultOriginGrid() {
    var grid = {};
    AW_ORIGINS.forEach(function (origin) {
      var enabled = origin !== 'EWR';
      var entry = { enabled: enabled };
      SERVICE_TYPES.forEach(function (st) {
        entry[st] = defaultOriginCell();
        if (origin === 'DFW') entry[st].density = 8.0;
        if (origin === 'LAX') {
          if (st === 'b2b') entry[st].linehaulAdjPct = 5;
          if (st === 'wgni') entry[st].linehaulAdjPct = 3;
          if (st === 'wgi') entry[st].linehaulAdjPct = 5;
        }
      });
      grid[origin] = entry;
    });
    grid.EWR.enabled = false;
    return grid;
  }

  function getTariff(state, id) {
    return (state.tariffs || []).find(function (t) { return t.id === id; }) || null;
  }

  function getTariffChain(state, tariffId) {
    var chain = [];
    var seen = {};
    var cur = getTariff(state, tariffId);
    while (cur && !seen[cur.id]) {
      chain.unshift(cur);
      seen[cur.id] = true;
      cur = cur.parentTariffId ? getTariff(state, cur.parentTariffId) : null;
    }
    return chain;
  }

  function mergeOriginGrid(chain) {
    var merged = {};
    chain.forEach(function (t) {
      var g = (t.config && t.config.originGrid) || {};
      Object.keys(g).forEach(function (origin) {
        if (!merged[origin]) merged[origin] = { enabled: false };
        var src = g[origin];
        merged[origin].enabled = src.enabled != null ? src.enabled : merged[origin].enabled;
        SERVICE_TYPES.forEach(function (st) {
          if (!src[st]) return;
          if (!merged[origin][st]) merged[origin][st] = defaultOriginCell();
          Object.assign(merged[origin][st], src[st]);
        });
      });
    });
    return merged;
  }

  function getEffectiveConfig(state, tariffId) {
    var chain = getTariffChain(state, tariffId);
    var leaf = chain.length ? chain[chain.length - 1] : null;
    var D = dummyTariff();
    var merged = {
      minimumCharge: D.minimumChargeLane,
      density: 8.5,
      marginFloorPct: 15,
      baselineRules: [],
      originGrid: defaultOriginGrid()
    };
    chain.forEach(function (t) {
      var c = t.config || {};
      if (c.minimumCharge != null) merged.minimumCharge = c.minimumCharge;
      if (c.density != null) merged.density = c.density;
      if (c.marginFloorPct != null) merged.marginFloorPct = c.marginFloorPct;
      if (c.baselineRules && c.baselineRules.length) merged.baselineRules = c.baselineRules.slice();
    });
    merged.originGrid = mergeOriginGrid(chain);
    return { chain: chain, leaf: leaf, config: merged };
  }

  function getOriginCell(state, tariffId, originStation, serviceType) {
    var eff = getEffectiveConfig(state, tariffId);
    var origin = String(originStation || 'TMV').toUpperCase();
    var grid = eff.config.originGrid[origin];
    if (!grid || grid.enabled === false) return null;
    return grid[serviceType] || defaultOriginCell();
  }

  function getEffectiveMatrix(state, tariffId, combo) {
    var chain = getTariffChain(state, tariffId);
    for (var i = chain.length - 1; i >= 0; i--) {
      var key = chain[i].id + '::' + combo;
      var hit = state.rateMatrices && state.rateMatrices[key];
      if (hit && hit.rows && hit.rows.length) return hit;
    }
    return null;
  }

  function zip3(zip) {
    var z = String(zip || '').replace(/\D/g, '');
    return z.length >= 3 ? z.slice(0, 3) : z;
  }

  function matchB2bRow(rows, zoneKey, deliveryZip) {
    var z3 = zip3(deliveryZip);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.zoneKey && r.zoneKey === zoneKey) return r;
      if (r.description && zoneKey && r.description.indexOf(zoneKey) >= 0) return r;
      if (zoneKey && zoneKey.indexOf(r.zone) >= 0) return r;
      if (r.zone && z3 && (r.zone === z3 || zoneKey.indexOf(r.zone) >= 0)) return r;
    }
    return rows[0] || null;
  }

  function matchHdRow(rows, poi, bppc) {
    return rows.find(function (r) {
      return (poi && r.poi === poi) || (bppc && r.bppc === bppc) ||
        (poi && r.description === poi) || (bppc && r.zone === bppc);
    }) || rows.find(function (r) {
      return poi && r.description && r.description.indexOf(poi) >= 0;
    }) || null;
  }

  function rateFromRow(row, weightGroup, serviceType) {
    if (!row) return null;
    var wg = Math.max(1, Math.min(6, weightGroup || 1));
    var idx = wg - 1;
    var ratePerLb = row.ratePerLb;
    var ratePerCube = row.ratePerCube;
    if (row.rates && row.rates.length) {
      if (serviceType === 'threshold' && row.rates.length > 1) {
        ratePerCube = row.rates[1];
        ratePerLb = row.rates[0];
      } else {
        ratePerLb = row.rates[idx] != null ? row.rates[idx] : row.rates[row.rates.length - 1];
      }
    }
    return {
      ratePerLb: ratePerLb || 0,
      ratePerCube: ratePerCube || 0,
      minimum: row.minimum != null ? row.minimum : 0
    };
  }

  function applyOriginAdjustments(rateInfo, cell) {
    if (!rateInfo || !cell) return rateInfo;
    var lhAdj = parseNum(cell.linehaulAdjPct);
    var minAdj = parseNum(cell.minAdjPct);
    var mult = 1 + lhAdj / 100;
    return {
      ratePerLb: Math.round((rateInfo.ratePerLb * mult) * 10000) / 10000,
      ratePerCube: rateInfo.ratePerCube ? Math.round((rateInfo.ratePerCube * mult) * 100) / 100 : 0,
      minimum: Math.round((rateInfo.minimum * (1 + minAdj / 100)) * 100) / 100,
      density: cell.density != null ? parseNum(cell.density) : null
    };
  }

  function commodityMatches(scope, commodity) {
    var c = String(commodity || 'FAK').toUpperCase();
    var s = String(scope || '').toUpperCase();
    if (!s || s === '—') return false;
    if (c === s) return true;
    if (s.indexOf('UPH') >= 0 && (c === 'UPH' || c.indexOf('UPHOL') >= 0)) return true;
    if (s.indexOf('CASE') >= 0 && c === 'CAS') return true;
    if (s.indexOf('FAK') >= 0 && c === 'FAK') return true;
    return c.indexOf(s.slice(0, 3)) >= 0 || s.indexOf(c) >= 0;
  }

  function applyBaselineRules(linehaul, minimum, rules, commodity, tariffMinimum) {
    var lh = linehaul;
    var min = minimum;
    (rules || []).forEach(function (rule) {
      var type = String(rule.type || '').toLowerCase();
      if (type.indexOf('commodity') >= 0 && commodityMatches(rule.scope, commodity)) {
        var pct = parsePct(rule.value);
        if (pct) lh = Math.round(lh * (1 + pct / 100) * 100) / 100;
      }
      if (type.indexOf('minimum') >= 0) {
        var floor = parseMoney(rule.value) || tariffMinimum;
        if (floor > min) min = floor;
      }
      if (type.indexOf('promotion') >= 0 && rule.value && String(rule.value).toLowerCase().indexOf('none') < 0) {
        var promo = parsePct(rule.value);
        if (promo) lh = Math.round(lh * (1 + promo / 100) * 100) / 100;
      }
    });
    if (!min && tariffMinimum) min = tariffMinimum;
    return { linehaul: lh, minimum: min };
  }

  function lookupTariffRate(state, tariffId, serviceType, ctx) {
    ctx = ctx || {};
    var origin = ctx.originStation;
    if (!origin) return null;
    var combo = comboId(serviceType, origin);
    var matrix = getEffectiveMatrix(state, tariffId, combo);
    var eff = getEffectiveConfig(state, tariffId);
    var cell = getOriginCell(state, tariffId, origin, serviceType);

    if (matrix && matrix.rows && matrix.rows.length) {
      var row = serviceType === 'b2b'
        ? matchB2bRow(matrix.rows, ctx.zoneKey, ctx.deliveryZip)
        : matchHdRow(matrix.rows, ctx.poi, ctx.bppc);
      var base = rateFromRow(row, ctx.weightGroup, serviceType);
      if (base && (base.ratePerLb > 0 || base.ratePerCube > 0)) {
        var adj = applyOriginAdjustments(base, cell);
        return {
          ratePerLb: adj.ratePerLb,
          ratePerCube: adj.ratePerCube,
          minimum: adj.minimum,
          density: adj.density,
          source: 'matrix',
          comboId: combo,
          tariffId: tariffId
        };
      }
    }

    var ref = state.reference || {};
    var legacy = ref.rateMatrix || {};
    if (serviceType === 'b2b') {
      var rows = legacy.b2b || [];
      var hit = rows.find(function (r) {
        return r.origin === origin && r.zoneKey === ctx.zoneKey && r.weightGroup === ctx.weightGroup;
      }) || rows.find(function (r) {
        return r.origin === origin && r.zoneKey === ctx.zoneKey;
      });
      if (hit) {
        var lb = applyOriginAdjustments({ ratePerLb: hit.ratePerLb, ratePerCube: 0, minimum: hit.minimum }, cell);
        return Object.assign(lb, { source: 'reference', tariffId: tariffId });
      }
    } else {
      var hdRows = legacy[serviceType] || [];
      var hdHit = hdRows.find(function (r) {
        return r.origin === origin && (r.poi === ctx.poi || r.bppc === ctx.bppc);
      });
      if (hdHit) {
        var hd = applyOriginAdjustments({
          ratePerLb: hdHit.ratePerLb,
          ratePerCube: hdHit.ratePerCube,
          minimum: hdHit.minimum
        }, cell);
        return Object.assign(hd, { source: 'reference', tariffId: tariffId });
      }
    }
    return null;
  }

  function resolveAutoTariff(state, customerId, serviceType) {
    var fallbackId = DEFAULT_BASE[serviceType] || DEFAULT_BASE.b2b;
    var customer = customerId
      ? (state.customers || []).find(function (c) { return c.id === customerId; })
      : null;

    if (customer && customer.tariffIds && customer.tariffIds.length) {
      for (var i = 0; i < customer.tariffIds.length; i++) {
        var assigned = getTariff(state, customer.tariffIds[i]);
        if (
          assigned &&
          assigned.type === 'Base' &&
          (assigned.status === 'active' || assigned.status === 'draft') &&
          tariffMatchesService(assigned, serviceType)
        ) {
          return assigned;
        }
      }
    }

    var defaultBase = getTariff(state, fallbackId);
    if (defaultBase && (defaultBase.status === 'active' || defaultBase.status === 'draft')) {
      return defaultBase;
    }

    var bases = (state.tariffs || []).filter(function (t) {
      return t.type === 'Base' && t.status === 'active' && tariffMatchesService(t, serviceType);
    });
    if (bases.length) return bases[0];
    return getTariff(state, fallbackId);
  }

  function buildSeedRateMatrices(state) {
    if (!state.rateMatrices) state.rateMatrices = {};
    var ref = state.reference || {};
    var b2b = (ref.rateMatrix && ref.rateMatrix.b2b) || [];
    var byOriginZone = {};
    b2b.forEach(function (r) {
      var key = r.origin + '::' + r.zoneKey;
      if (!byOriginZone[key]) byOriginZone[key] = { zoneKey: r.zoneKey, origin: r.origin, rates: [], minimum: r.minimum };
      byOriginZone[key].rates[r.weightGroup - 1] = r.ratePerLb;
    });
    Object.keys(byOriginZone).forEach(function (key) {
      var parts = key.split('::');
      var origin = parts[0];
      var bundle = byOriginZone[key];
      var combo = comboId('b2b', origin);
      var storeKey = 'TAR-B2B-BASE::' + combo;
      if (state.rateMatrices[storeKey]) return;
      state.rateMatrices[storeKey] = {
        tariffId: 'TAR-B2B-BASE',
        comboId: combo,
        rows: [{
          zone: bundle.zoneKey.split(':')[1] ? bundle.zoneKey.split(':')[1].split(',')[0] : '293',
          zoneKey: bundle.zoneKey,
          description: bundle.zoneKey,
          rates: bundle.rates,
          minimum: bundle.minimum
        }],
        savedAt: state.meta && state.meta.seededAt
      };
    });

    ['threshold', 'wgni', 'wgi'].forEach(function (svc) {
      var rows = (ref.rateMatrix && ref.rateMatrix[svc]) || [];
      var tariffId = DEFAULT_BASE[svc];
      rows.forEach(function (r) {
        var combo = comboId(svc, r.origin);
        var storeKey = tariffId + '::' + combo;
        if (state.rateMatrices[storeKey]) return;
        var existing = state.rateMatrices[storeKey];
        if (!existing) {
          state.rateMatrices[storeKey] = { tariffId: tariffId, comboId: combo, rows: [], savedAt: state.meta && state.meta.seededAt };
          existing = state.rateMatrices[storeKey];
        }
        existing.rows.push({
          zone: r.bppc || r.poi,
          description: r.poi,
          poi: r.poi,
          bppc: r.bppc,
          rates: [r.ratePerLb, r.ratePerCube || 0],
          minimum: r.minimum,
          ratePerLb: r.ratePerLb,
          ratePerCube: r.ratePerCube
        });
      });
    });

  }

  function ensureTariffOriginGrid(state) {
    (state.tariffs || []).forEach(function (t) {
      if (!t.config) t.config = {};
      if (!t.config.originGrid || !Object.keys(t.config.originGrid).length) {
        t.config.originGrid = defaultOriginGrid();
      }
    });
  }

  global.AwestTariffEngine = {
    AW_ORIGINS: AW_ORIGINS,
    SERVICE_TYPES: SERVICE_TYPES,
    SERVICE_PREFIX: SERVICE_PREFIX,
    defaultOriginGrid: defaultOriginGrid,
    defaultOriginCell: defaultOriginCell,
    comboId: comboId,
    serviceTypeFromTariff: serviceTypeFromTariff,
    getTariffChain: getTariffChain,
    getEffectiveConfig: getEffectiveConfig,
    getOriginCell: getOriginCell,
    getEffectiveMatrix: getEffectiveMatrix,
    lookupTariffRate: lookupTariffRate,
    resolveAutoTariff: resolveAutoTariff,
    applyBaselineRules: applyBaselineRules,
    applyOriginAdjustments: applyOriginAdjustments,
    buildSeedRateMatrices: buildSeedRateMatrices,
    ensureTariffOriginGrid: ensureTariffOriginGrid,
    parsePct: parsePct
  };
})(typeof window !== 'undefined' ? window : global);
