/**
 * Shared pricing engine & UI — store-driven lane lookup, four-service quotes
 */
(function () {
  'use strict';

  var DISCOUNT_STEPS = [15, 10, 5, 0, -5, -10, -15];
  var LANE_OVERRIDE_PRESETS = [0, 45, 85, 120];
  var REP_MAX_DISCOUNT = 10;
  var MARGIN_FLOOR = 15;
  var SERVICE_TYPES = ['b2b', 'threshold', 'wgni', 'wgi'];
  var SERVICE_LABELS = { b2b: 'B2B', threshold: 'Threshold', wgni: 'WG No Inspection', wgi: 'White Glove Inspection' };
  var SERVICE_FAMILIES = {
    b2b: { label: 'B2B', desc: 'Business freight', primaryService: 'b2b', tariffId: 'TAR-B2B-BASE', tariffLabel: 'National B2B v35' },
    home: { label: 'Home Transport', desc: 'Residential delivery', primaryService: 'threshold', tariffId: 'TAR-HD-TH-002', tariffLabel: 'Threshold HD' }
  };

  function dummyTariff() {
    var root = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});
    return root.AwestDummyTariff || { minimumChargeTariff: 111, spotBaseCwtDefault: 77, b2bMinimum: 88 };
  }
  var HD_TARIFFS = {
    threshold: { tariffId: 'TAR-HD-TH-002', tariffLabel: 'Threshold HD', service: 'threshold' },
    wgni: { tariffId: 'TAR-WGNI-BASE', tariffLabel: 'WG No Inspection', service: 'wgni' },
    wgi: { tariffId: 'TAR-WGI-BASE', tariffLabel: 'White Glove Inspection', service: 'wgi' }
  };
  var CUBIC_DIVISOR = 1728;
  var DEFAULT_DENSITY = 8.5;

  function getStore() {
    return window.AwestStore;
  }

  function getRef() {
    var store = getStore();
    return store ? store.getState().reference : {};
  }

  function latestFuelPct() {
    var store = getStore();
    if (!store) return 28.4;
    var s = store.getState();
    if (!s.reference.fuel.length) return s.settings.demoLane.fuelPct || 28.4;
    return s.reference.fuel[s.reference.fuel.length - 1].pct;
  }

  function accessorialRates() {
    var ref = getRef();
    var lift = 85;
    var residential = 120;
    (ref.accessorials || []).forEach(function (a) {
      if (a.id === 'acc-lift') lift = a.rate;
      if (a.id === 'acc-res') residential = a.rate;
    });
    return { lift: lift, residential: residential };
  }

  function computeInsurance(declaredValue, customer) {
    var dv = Number(declaredValue) || 0;
    if (dv <= 0) return 0;
    var pct = 0.01;
    if (customer && customer.tariffNotes && customer.tariffNotes.indexOf('Insurance') >= 0) {
      pct = 0.01;
    }
    return Math.max(Math.round(dv * pct * 100) / 100, 25);
  }

  function weightGroup(weight) {
    var w = Number(weight) || 0;
    if (w <= 0) return 1;
    if (w <= 125) return 1;
    if (w <= 250) return 2;
    if (w <= 500) return 3;
    if (w <= 1000) return 4;
    if (w <= 2000) return 5;
    if (w <= 5000) return 6;
    return 7;
  }

  function weightGroupLabel(g) {
    var labels = ['1–125', '126–250', '251–500', '501–1000', '1001–2000', '2001–5000', '5000+ CFQ'];
    return labels[g - 1] || 'CFQ';
  }

  function zip3(zip) {
    var z = String(zip || '').replace(/\D/g, '');
    return z.length >= 3 ? z.slice(0, 3) : z;
  }

  function resolveOriginStation(pickupZip) {
    var ref = getRef();
    var z = String(pickupZip || '').replace(/\D/g, '');
    var hit = (ref.originZips || []).find(function (r) { return r.zip === z; });
    if (hit) return hit.originStation;
    if (z.slice(0, 3) === '272' || z.slice(0, 3) === '273') return 'TMV';
    return null;
  }

  function resolveB2bZone(deliveryZip) {
    var ref = getRef();
    var z = String(deliveryZip || '').replace(/\D/g, '');
    var exc = (ref.b2bZipExceptions || []).find(function (e) { return e.zip === z; });
    if (exc) return { zoneKey: exc.zoneKey, cfq: false };
    var lane = (ref.b2bLanes || []).find(function (l) {
      return !l.cfq && z.indexOf(l.baseZip) === 0;
    });
    if (lane) return { zoneKey: lane.zoneKey, cfq: false };
    var cfqLane = (ref.b2bLanes || []).find(function (l) { return l.cfq; });
    if (cfqLane && z.slice(0, 3) === cfqLane.baseZip) return { zoneKey: null, cfq: true };
    return { zoneKey: null, cfq: true };
  }

  function resolveHdPoi(deliveryZip) {
    var ref = getRef();
    var z = String(deliveryZip || '').replace(/\D/g, '');
    var mr2 = (ref.mr2ZipMap || []).find(function (m) { return m.zip === z; });
    if (mr2) {
      var tier = (ref.hdTiers || []).find(function (t) { return t.bppc === mr2.bppc; });
      return tier || { poi: mr2.poi, bppc: mr2.bppc, cfq: false };
    }
    var direct = (ref.hdTiers || []).find(function (t) { return t.zip === z; });
    if (direct) return direct;
    return { poi: null, bppc: null, cfq: true };
  }

  function getTariffEngine() {
    return window.AwestTariffEngine;
  }

  function resolveTariffId(q, serviceType) {
    if (q.tariffId) return q.tariffId;
    var store = getStore();
    var TE = getTariffEngine();
    if (store && TE) {
      var t = TE.resolveAutoTariff(store.getState(), q.customerId, serviceType);
      if (t) return t.id;
    }
    if (serviceType === 'b2b') return SERVICE_FAMILIES.b2b.tariffId;
    var hd = HD_TARIFFS[serviceType];
    return hd ? hd.tariffId : SERVICE_FAMILIES.b2b.tariffId;
  }

  function lookupB2bRate(origin, zoneKey, wg, tariffId, deliveryZip) {
    var store = getStore();
    var TE = getTariffEngine();
    if (store && TE && tariffId) {
      var hit = TE.lookupTariffRate(store.getState(), tariffId, 'b2b', {
        originStation: origin,
        zoneKey: zoneKey,
        weightGroup: wg,
        deliveryZip: deliveryZip
      });
      if (hit && hit.ratePerLb > 0) {
        return { ratePerLb: hit.ratePerLb, minimum: hit.minimum, source: hit.source };
      }
    }
    var ref = getRef();
    var rows = (ref.rateMatrix && ref.rateMatrix.b2b) || [];
    var row = rows.find(function (r) {
      return r.origin === origin && r.zoneKey === zoneKey && r.weightGroup === wg;
    });
    if (!row) {
      row = rows.find(function (r) {
        return r.origin === origin && r.zoneKey === zoneKey;
      });
    }
    return row;
  }

  function lookupHdRate(service, origin, poi, bppc, tariffId) {
    var store = getStore();
    var TE = getTariffEngine();
    if (store && TE && tariffId) {
      var hit = TE.lookupTariffRate(store.getState(), tariffId, service, {
        originStation: origin,
        poi: poi,
        bppc: bppc,
        weightGroup: 1
      });
      if (hit && (hit.ratePerLb > 0 || hit.ratePerCube > 0)) {
        return {
          ratePerLb: hit.ratePerLb,
          ratePerCube: hit.ratePerCube,
          minimum: hit.minimum,
          poi: poi,
          bppc: bppc,
          source: hit.source
        };
      }
    }
    var ref = getRef();
    var rows = (ref.rateMatrix && ref.rateMatrix[service]) || [];
    return rows.find(function (r) {
      return r.origin === origin && (r.poi === poi || r.bppc === bppc);
    });
  }

  function applyTariffBaseline(linehaul, minimum, tariffId, commodity) {
    var store = getStore();
    var TE = getTariffEngine();
    if (!store || !TE || !tariffId) return { linehaul: linehaul, minimum: minimum };
    var eff = TE.getEffectiveConfig(store.getState(), tariffId);
    return TE.applyBaselineRules(
      linehaul,
      minimum,
      eff.config.baselineRules,
      commodity,
      eff.config.minimumCharge
    );
  }

  function serviceDiscountPct(customer, serviceType) {
    if (!customer || !customer.serviceDiscounts) return customer ? customer.overallDiscPct || 0 : 0;
    var label = SERVICE_LABELS[serviceType];
    var hit = customer.serviceDiscounts.find(function (d) {
      return d.service === label || d.service.toLowerCase().replace(/\s/g, '') === serviceType;
    });
    return hit ? hit.pct : (customer.overallDiscPct || 0);
  }

  function customerDensity(customer, serviceType) {
    if (!customer || !customer.serviceDiscounts) return DEFAULT_DENSITY;
    var label = SERVICE_LABELS[serviceType];
    var hit = customer.serviceDiscounts.find(function (d) { return d.service === label; });
    if (!hit || hit.density == null || hit.density === '') return DEFAULT_DENSITY;
    var NF = typeof global !== 'undefined' ? global.AwestNumericFields : null;
    var n = NF ? NF.parseDensity(hit.density, DEFAULT_DENSITY) : parseFloat(hit.density);
    return isNaN(n) ? DEFAULT_DENSITY : n;
  }

  function computeMargin(netLinehaul, fuel, access, total, quoteDiscPct) {
    var revenue = total;
    if (revenue <= 0) return 0;
    var costBase = netLinehaul / (1 + (quoteDiscPct || 0) / 200);
    var cost = costBase * 0.72 + fuel * 0.85 + access * 0.9;
    return Math.round(((revenue - cost) / revenue) * 1000) / 10;
  }

  function recomputePricingMargin(p) {
    if (!p || p.cfq) return p;
    var netLh = p.stack && p.stack.linehaul != null ? p.stack.linehaul : p.linehaul;
    var access = p.stack && p.stack.access != null
      ? p.stack.access
      : (p.insurance || 0) + (p.lift || 0) + (p.residential || 0);
    p.margin = computeMargin(netLh, p.fuel || 0, access, p.total || 0, p.quoteDiscPct || 0);
    return p;
  }

  function marginFloorFromStore() {
    var store = getStore();
    if (store) return store.getState().settings.marginFloor || MARGIN_FLOOR;
    return MARGIN_FLOOR;
  }

  function buildPricingResult(opts) {
    opts = opts || {};
    var linehaul = opts.linehaul || 0;
    var minimum = opts.minimum || 0;
    var minimumApplied = opts.minimumApplied || false;
    var ratePerLb = opts.ratePerLb || 0;
    var ratePerCube = opts.ratePerCube || 0;
    var weight = opts.weight || 0;
    var cube = opts.cube || 0;
    var custDiscPct = opts.custDiscPct || 0;
    var quoteDiscPct = opts.quoteDiscPct || 0;
    var lane = opts.laneOverride || 0;
    var fuelPct = opts.fuelPct != null ? opts.fuelPct : latestFuelPct();
    var custDisc = Math.round(linehaul * (custDiscPct / 100) * 100) / 100;
    var quoteDiscAmt = quoteDiscPct > 0
      ? Math.round((linehaul - custDisc) * (quoteDiscPct / 100) * 100) / 100
      : 0;
    var netLinehaul = linehaul - custDisc - quoteDiscAmt + lane;
    var fuel = Math.round(netLinehaul * (fuelPct / 100) * 100) / 100;
    var insurance = opts.insurance != null ? opts.insurance : 0;
    var lift = opts.lift != null ? opts.lift : accessorialRates().lift;
    var residential = opts.residential != null ? opts.residential : accessorialRates().residential;
    var total = Math.round((netLinehaul + fuel + insurance + lift + residential) * 100) / 100;
    var margin = computeMargin(netLinehaul, fuel, insurance + lift + residential, total, quoteDiscPct);
    return {
      serviceType: opts.serviceType || 'b2b',
      cfq: !!opts.cfq,
      linehaul: linehaul,
      minimum: minimum,
      minimumApplied: minimumApplied,
      ratePerLb: ratePerLb,
      ratePerCube: ratePerCube,
      weight: weight,
      cube: cube,
      weightGroup: opts.weightGroup,
      weightGroupLabel: opts.weightGroupLabel,
      originStation: opts.originStation,
      zoneKey: opts.zoneKey,
      poi: opts.poi,
      bppc: opts.bppc,
      laneLabel: opts.laneLabel,
      custDiscPct: custDiscPct,
      custDiscAmt: custDisc,
      quoteDiscPct: quoteDiscPct,
      quoteDiscAmt: quoteDiscAmt,
      lane: lane,
      fuel: fuel,
      fuelPct: fuelPct,
      insurance: insurance,
      lift: lift,
      residential: residential,
      total: total,
      margin: margin,
      stack: {
        linehaul: netLinehaul,
        fuel: fuel,
        access: insurance + lift + residential,
        disc: custDisc + quoteDiscAmt
      },
      personalized: quoteDiscPct > 0 || custDiscPct !== 5
    };
  }

  function manualRateEnginePricing(q, serviceType, baseCwt, fuelPctOverride) {
    serviceType = serviceType || q.primaryService || 'b2b';
    var store = getStore();
    var customer = store && q.customerId ? store.getCustomer(q.customerId) : null;
    var weight = Number(q.weight) || 4200;
    var cube = Number(q.cube) || 494;
    var base = Number(baseCwt) || 0;
    if (base <= 0) {
      return buildPricingResult({
        serviceType: serviceType, cfq: true, weight: weight, cube: cube,
        custDiscPct: q.customerDiscPct || 0, quoteDiscPct: q.quoteDiscPct || 0,
        laneOverride: q.laneOverride || 0,
        fuelPct: fuelPctOverride != null ? fuelPctOverride : latestFuelPct(),
        insurance: computeInsurance(q.declaredValue, customer),
        lift: accessorialRates().lift, residential: accessorialRates().residential,
        laneLabel: 'Manual rate — enter base $/CWT'
      });
    }
    var tariffId = resolveTariffId(q, serviceType);
    var eff = store && getTariffEngine() ? getTariffEngine().getEffectiveConfig(store.getState(), tariffId) : null;
    var minimum = eff && eff.config && eff.config.minimumCharge != null ? eff.config.minimumCharge : dummyTariff().minimumChargeTariff;
    var rawLinehaul = Math.round((weight / 100) * base * 100) / 100;
    var minApplied = rawLinehaul < minimum;
    var linehaul = minApplied ? minimum : rawLinehaul;
    var fuelPct = fuelPctOverride != null ? Number(fuelPctOverride) : latestFuelPct();
    if (customer && customer.fixedFuelPct != null) fuelPct = customer.fixedFuelPct;
    var acc = accessorialRates();
    var ins = computeInsurance(q.declaredValue, customer);
    var custDiscPct = q.customerDiscPct != null ? q.customerDiscPct : serviceDiscountPct(customer, serviceType);
    return buildPricingResult({
      serviceType: serviceType, linehaul: linehaul, minimum: minimum, minimumApplied: minApplied,
      ratePerLb: Math.round((base / 100) * 10000) / 10000,
      weight: weight, cube: cube,
      custDiscPct: custDiscPct, quoteDiscPct: q.quoteDiscPct || 0, laneOverride: q.laneOverride || 0,
      fuelPct: fuelPct, insurance: ins, lift: acc.lift, residential: acc.residential,
      laneLabel: (q.pricingMode === 'spot' ? 'Spot' : 'CFQ manual') + ' · $' + base + '/CWT'
    });
  }

  function enginePricing(q, serviceType) {
    serviceType = serviceType || q.primaryService || 'b2b';
    if (q.pricingMode === 'spot') {
      return manualRateEnginePricing(q, serviceType, q.spotBaseCwt, q.spotFuelPct);
    }
    if (q.pricingMode === 'cfq-manual') {
      return manualRateEnginePricing(q, serviceType, q.cfqManualBase, q.cfqManualFuel);
    }
    var store = getStore();
    var customer = store && q.customerId ? store.getCustomer(q.customerId) : null;
    var tariffId = resolveTariffId(q, serviceType);
    var pickupZip = q.pickupZip || '27260';
    var deliveryZip = q.deliveryZip || '29621';
    var weight = Number(q.weight) || 4200;
    var cube = Number(q.cube) || 494;
    var commodity = q.commodity || 'FAK';
    var acc = accessorialRates();
    var ins = computeInsurance(q.declaredValue, customer);
    var fuelPct = customer && customer.fixedFuelPct != null ? customer.fixedFuelPct : latestFuelPct();
    var custDiscPct = q.customerDiscPct != null ? q.customerDiscPct : serviceDiscountPct(customer, serviceType);
    var quoteDiscPct = q.quoteDiscPct || 0;
    var laneOverride = q.laneOverride || 0;
    var originStation = q.originStation || resolveOriginStation(pickupZip);
    var TE = getTariffEngine();
    var originCell = store && TE ? TE.getOriginCell(store.getState(), tariffId, originStation, serviceType) : null;

    if (serviceType === 'b2b') {
      var zone = resolveB2bZone(deliveryZip);
      if (zone.cfq || !originStation) {
        return buildPricingResult({
          serviceType: 'b2b', cfq: true, weight: weight, cube: cube,
          custDiscPct: custDiscPct, quoteDiscPct: quoteDiscPct, laneOverride: laneOverride,
          fuelPct: fuelPct, insurance: ins, lift: acc.lift, residential: acc.residential,
          originStation: originStation, laneLabel: 'CFQ — manual rating required'
        });
      }
      var wg = weightGroup(weight);
      if (wg >= 7) {
        return buildPricingResult({
          serviceType: 'b2b', cfq: true, weight: weight, cube: cube, weightGroup: wg,
          weightGroupLabel: weightGroupLabel(wg), originStation: originStation, zoneKey: zone.zoneKey,
          custDiscPct: custDiscPct, quoteDiscPct: quoteDiscPct, laneOverride: laneOverride,
          fuelPct: fuelPct, insurance: ins, lift: acc.lift, residential: acc.residential,
          laneLabel: zone.zoneKey + ' · CFQ weight'
        });
      }
      var row = lookupB2bRate(originStation, zone.zoneKey, wg, tariffId, deliveryZip);
      if (!row) {
        return buildPricingResult({
          serviceType: 'b2b', cfq: true, weight: weight, cube: cube,
          originStation: originStation, zoneKey: zone.zoneKey,
          custDiscPct: custDiscPct, quoteDiscPct: quoteDiscPct, laneOverride: laneOverride,
          fuelPct: fuelPct, insurance: ins, lift: acc.lift, residential: acc.residential,
          laneLabel: 'No rate row — CFQ'
        });
      }
      var rawLinehaul = Math.round(weight * row.ratePerLb * 100) / 100;
      var minApplied = rawLinehaul < row.minimum;
      var linehaul = minApplied ? row.minimum : rawLinehaul;
      var baseline = applyTariffBaseline(linehaul, row.minimum, tariffId, commodity);
      linehaul = baseline.linehaul;
      if (linehaul < baseline.minimum) {
        minApplied = true;
        linehaul = baseline.minimum;
      }
      return buildPricingResult({
        serviceType: 'b2b', linehaul: linehaul, minimum: baseline.minimum, minimumApplied: minApplied,
        ratePerLb: row.ratePerLb, weight: weight, cube: cube, weightGroup: wg,
        weightGroupLabel: weightGroupLabel(wg), originStation: originStation, zoneKey: zone.zoneKey,
        custDiscPct: custDiscPct, quoteDiscPct: quoteDiscPct, laneOverride: laneOverride,
        fuelPct: fuelPct, insurance: ins, lift: acc.lift, residential: acc.residential,
        laneLabel: originStation + ' → ' + zone.zoneKey + ' · ' + tariffId + ' · grp ' + wg
      });
    }

    var hd = resolveHdPoi(deliveryZip);
    if (hd.cfq || !originStation) {
      return buildPricingResult({
        serviceType: serviceType, cfq: true, weight: weight, cube: cube,
        custDiscPct: custDiscPct, quoteDiscPct: quoteDiscPct, laneOverride: laneOverride,
        fuelPct: fuelPct, insurance: ins, lift: acc.lift, residential: acc.residential,
        originStation: originStation, laneLabel: 'CFQ — HD tier unresolved'
      });
    }
    var hdRow = lookupHdRate(serviceType, originStation, hd.poi, hd.bppc, tariffId);
    if (!hdRow) {
      return buildPricingResult({
        serviceType: serviceType, cfq: true, weight: weight, cube: cube,
        custDiscPct: custDiscPct, quoteDiscPct: quoteDiscPct, laneOverride: laneOverride,
        fuelPct: fuelPct, insurance: ins, lift: acc.lift, residential: acc.residential,
        originStation: originStation, poi: hd.poi, bppc: hd.bppc,
        laneLabel: 'No HD rate — CFQ'
      });
    }
    var density = originCell && originCell.density != null
      ? parseFloat(originCell.density)
      : customerDensity(customer, serviceType);
    var billWeight = weight;
    var cubeWeight = cube * density;
    if (cubeWeight > weight) billWeight = cubeWeight;
    var hdRaw = Math.round(billWeight * hdRow.ratePerLb * 100) / 100;
    var hdMinApplied = hdRaw < hdRow.minimum;
    var hdLinehaul = hdMinApplied ? hdRow.minimum : hdRaw;
    if (hdRow.ratePerCube && cube > 0) {
      var cubeLinehaul = Math.round(cube * hdRow.ratePerCube * 100) / 100;
      if (cubeLinehaul > hdLinehaul) {
        hdLinehaul = cubeLinehaul;
        hdMinApplied = false;
      }
    }
    var hdBaseline = applyTariffBaseline(hdLinehaul, hdRow.minimum, tariffId, commodity);
    hdLinehaul = hdBaseline.linehaul;
    if (hdLinehaul < hdBaseline.minimum) {
      hdMinApplied = true;
      hdLinehaul = hdBaseline.minimum;
    }
    return buildPricingResult({
      serviceType: serviceType, linehaul: hdLinehaul, minimum: hdBaseline.minimum, minimumApplied: hdMinApplied,
      ratePerLb: hdRow.ratePerLb, ratePerCube: hdRow.ratePerCube, weight: weight, cube: cube,
      originStation: originStation, poi: hd.poi || hdRow.poi, bppc: hd.bppc || hdRow.bppc,
      custDiscPct: custDiscPct, quoteDiscPct: quoteDiscPct, laneOverride: laneOverride,
      fuelPct: fuelPct, insurance: ins, lift: acc.lift, residential: acc.residential,
      laneLabel: originStation + ' · ' + (hd.poi || hdRow.poi) + ' · ' + tariffId
    });
  }

  function getPricingConfig() {
    var p = enginePricing({ pickupZip: '27260', deliveryZip: '29621', weight: 4200, cube: 494, declaredValue: 45000, customerDiscPct: 5 }, 'b2b');
    return {
      linehaul: p.linehaul,
      ratePerLb: p.ratePerLb,
      weight: p.weight,
      cube: p.cube,
      fuelPct: p.fuelPct,
      lane: 0,
      lift: p.lift,
      residential: p.residential
    };
  }

  function computePortalTier(opts) {
    opts = opts || {};
    var service = opts.service || 'threshold';
    var q = {
      pickupZip: opts.pickupZip || '27260',
      deliveryZip: opts.deliveryZip || '29621',
      weight: opts.weight || 2400,
      cube: opts.cube || 320,
      declaredValue: opts.declaredValue || 18000,
      customerDiscPct: 0,
      quoteDiscPct: 0,
      laneOverride: 0
    };
    var p = enginePricing(q, service);
    return {
      linehaul: p.linehaul,
      fuel: p.fuel,
      fuelPct: p.fuelPct,
      insurance: p.insurance,
      residential: p.residential,
      total: p.total,
      ratePerLb: p.ratePerLb,
      weight: p.weight,
      cfq: p.cfq,
      minimumApplied: p.minimumApplied,
      poi: p.poi
    };
  }

  function formatAccessorialRate(a) {
    if (!a) return '—';
    if (a.rateType === 'flat') return formatMoney(a.rate);
    if (a.rateType === 'hourly') return formatMoney(a.rate) + '/hr';
    return String(a.rate);
  }

  function pricingMetaFromQuote(q) {
    if (!q) return {};
    var p = resolveQuotePricing(q);
    return { weight: q.weight || p.weight, ratePerLb: p.ratePerLb, cube: q.cube || p.cube };
  }

  function hydrateMarginFloorUI(floor) {
    floor = floor != null ? floor : marginFloorFromStore();
    document.querySelectorAll('[data-margin-floor-label]').forEach(function (el) {
      el.textContent = 'Margin vs floor (' + floor + '%)';
    });
    document.querySelectorAll('.margin-gauge-tick').forEach(function (el) {
      el.style.left = Math.min(Math.max(floor * 3, 10), 95) + '%';
    });
  }

  function applyMarginGauge(fillEl, margin, floor) {
    if (!fillEl) return;
    floor = floor != null ? floor : marginFloorFromStore();
    var m = margin || 0;
    fillEl.className = 'margin-gauge-fill ' + (m < floor ? 'red' : m < floor + 3 ? 'amber' : 'green');
    fillEl.style.width = Math.min(m * 3, 100) + '%';
  }

  function formatPct(n) {
    var r = Math.round(n * 100) / 100;
    return r % 1 === 0 ? String(r) : r.toFixed(1);
  }

  function parseNumericInput(el, fallback) {
    if (!el) return fallback != null ? fallback : 0;
    var n = parseFloat(String(el.value).replace(/[,$+%\s]/g, ''));
    return isNaN(n) ? (fallback != null ? fallback : 0) : n;
  }

  function ensurePresetDatalists() {
    if (!document.getElementById('aw-discount-presets')) {
      var dlDisc = document.createElement('datalist');
      dlDisc.id = 'aw-discount-presets';
      DISCOUNT_STEPS.forEach(function (v) {
        var opt = document.createElement('option');
        opt.value = String(v);
        dlDisc.appendChild(opt);
      });
      document.body.appendChild(dlDisc);
    }
    if (!document.getElementById('aw-lane-override-presets')) {
      var dlLane = document.createElement('datalist');
      dlLane.id = 'aw-lane-override-presets';
      LANE_OVERRIDE_PRESETS.forEach(function (v) {
        var opt = document.createElement('option');
        opt.value = String(v);
        dlLane.appendChild(opt);
      });
      document.body.appendChild(dlLane);
    }
  }

  function bindNumericInput(el, handler, opts) {
    if (!el) return;
    opts = opts || {};
    if (opts.commit === 'blur') {
      var preview = function () { handler(parseNumericInput(el), { persist: false }); };
      var commit = function () { handler(parseNumericInput(el), { persist: true }); };
      el.addEventListener('input', preview);
      el.addEventListener('blur', commit);
      el.addEventListener('change', commit);
      return;
    }
    var run = function () { handler(parseNumericInput(el)); };
    el.addEventListener('change', run);
    el.addEventListener('input', run);
  }

  function quoteDiscPreview(q, qd) {
    if (!q) return q;
    var preview = Object.assign({}, q, { quoteDiscPct: qd });
    if (q.quoteAdjustments && q.quoteAdjustments.length) {
      preview.quoteAdjustments = q.quoteAdjustments.map(function (l) {
        if (l.presetId === 'quote-discount') {
          return Object.assign({}, l, { value: qd, enabled: qd > 0 || l.enabled });
        }
        return l;
      });
    }
    return preview;
  }

  function pricingForQuoteDisc(q, qd) {
    var preview = quoteDiscPreview(q, qd);
    if (preview.quoteAdjustments && preview.quoteAdjustments.length) {
      return pricingWithLayers(preview, preview.primaryService || 'b2b', preview.quoteAdjustments);
    }
    if (preview.adjustmentLayers && preview.adjustmentLayers.length) {
      return pricingWithLayers(preview, preview.primaryService || 'b2b', preview.adjustmentLayers);
    }
    return enginePricing(preview, preview.primaryService || 'b2b');
  }

  function quoteLifecycleLabel(status) {
    var G = typeof window !== 'undefined' && window.AwestGovernance;
    return G ? G.quoteStatusLabel(status) : status;
  }

  function renderLifecycleStrip(status) {
    var G = typeof window !== 'undefined' && window.AwestGovernance;
    if (G && G.renderQuoteLifecycleStrip) return G.renderQuoteLifecycleStrip(status);
    return '<div class="quote-lifecycle-strip"><span class="quote-lifecycle-step">' + quoteLifecycleLabel(status) + '</span></div>';
  }

  function formatMoney(n) {
    var neg = n < 0;
    var s = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '−$' : '$') + s;
  }

  function formatRatePerLb(r) {
    return (Math.round(r * 10000) / 100).toFixed(2) + '¢/lb';
  }

  function basePreset(quoteDiscPct, opts) {
    opts = opts || {};
    var q = {
      pickupZip: opts.pickupZip || '27260',
      deliveryZip: opts.deliveryZip || '29621',
      weight: opts.weight || 4200,
      cube: opts.cube || 494,
      declaredValue: opts.declaredValue || 45000,
      customerDiscPct: opts.custDiscPct != null ? opts.custDiscPct : 5,
      quoteDiscPct: quoteDiscPct || 0,
      laneOverride: opts.lane != null ? opts.lane : 0,
      customerId: opts.customerId
    };
    return enginePricing(q, opts.serviceType || 'b2b');
  }

  function quoteFromStore(id) {
    var store = getStore();
    return store ? store.getQuote(id) : null;
  }

  function resolveQuotePricing(q, serviceType) {
    if (!q) return basePreset(0);
    var store = getStore();
    if (!serviceType && store && store.computeQuotePricing) {
      return store.computeQuotePricing(q);
    }
    return quotePricingCompute(q, serviceType);
  }

  function computeEngineForQuote(q, serviceType) {
    serviceType = serviceType || q.primaryService || 'b2b';
    if (q.quoteAdjustments && q.quoteAdjustments.length) {
      return pricingWithLayers(q, serviceType, q.quoteAdjustments);
    }
    if (q.adjustmentLayers && q.adjustmentLayers.length) {
      return pricingWithLayers(q, serviceType, q.adjustmentLayers);
    }
    return enginePricing(q, serviceType);
  }

  function applyManualOverrideDisplay(engine, po) {
    var engineTotal = po.engineTotal != null ? po.engineTotal : engine.total;
    var engineMargin = po.engineMargin != null ? po.engineMargin : engine.margin;
    var delta = Math.round((po.total - engineTotal) * 100) / 100;
    var merged = JSON.parse(JSON.stringify(engine));
    merged.total = po.total;
    merged.margin = po.margin;
    merged.manualOverrideDelta = delta;
    merged.engineTotal = engineTotal;
    merged.engineMargin = engineMargin;
    merged.overrideApplied = true;
    return merged;
  }

  function quotePricingCompute(q, serviceType) {
    var engine = computeEngineForQuote(q, serviceType);
    if (q.pricingMode === 'override' && q.pricingOverride) {
      return applyManualOverrideDisplay(engine, q.pricingOverride);
    }
    return engine;
  }

  function quotePricing(q, serviceType) {
    return resolveQuotePricing(q, serviceType);
  }

  function quoteAllServices(q) {
    var out = {};
    SERVICE_TYPES.forEach(function (st) {
      out[st] = enginePricing(q, st);
    });
    return out;
  }

  function renderPricingBreakdown(p, compact, meta) {
    meta = meta || {};
    var ratePerLb = meta.ratePerLb != null ? meta.ratePerLb : (p.ratePerLb != null ? p.ratePerLb : 0);
    var weight = meta.weight != null ? meta.weight : (p.weight != null ? p.weight : 0);
    var html = '<div class="pricing-lines">';
    if (p.cfq) {
      html += '<div class="pricing-line"><span>CFQ — contact for freight quote</span><span class="tabular">—</span></div>';
    } else if (!compact) {
      var formula = formatRatePerLb(ratePerLb) + ' × ' + Number(weight).toLocaleString() + ' lbs';
      if (p.minimumApplied) formula += ' → min ' + formatMoney(p.minimum) + ' applied';
      html += '<div class="pricing-line"><span>Linehaul charge<span class="pricing-line-formula">' + formula + '</span></span><span class="tabular">' + formatMoney(p.linehaul) + '</span></div>';
      if (p.laneLabel) {
        html += '<div class="pricing-line"><span>Lane<span class="pricing-line-formula">' + p.laneLabel + '</span></span><span class="tabular">—</span></div>';
      }
      html += '<div class="pricing-line"><span>Customer discount (−' + p.custDiscPct + '%)' +
        (p.custDiscSource === 'exception'
          ? '<span class="pricing-line-formula">Exception · master was ' + (p.custDiscMaster != null ? p.custDiscMaster : '—') + '%</span>'
          : '<span class="pricing-line-formula">From snapshotted customer master</span>') +
        '</span><span class="tabular">−' + formatMoney(p.custDiscAmt).replace('−', '') + '</span></div>';
      if (p.quoteDiscPct > 0) {
        html += '<div class="pricing-line"><span>Quote discount (−' + formatPct(p.quoteDiscPct) + '%)<span class="pricing-line-formula">Rep adjustment on linehaul</span></span><span class="tabular">−' + formatMoney(p.quoteDiscAmt).replace('−', '') + '</span></div>';
      }
      if (p.lane > 0) {
        html += '<div class="pricing-line"><span>Lane override</span><span class="tabular">+' + formatMoney(p.lane) + '</span></div>';
      }
      html += '<div class="pricing-line"><span>Fuel surcharge (' + p.fuelPct + '%)</span><span class="tabular">' + formatMoney(p.fuel) + '</span></div>';
      html += '<div class="pricing-line"><span>Insurance (1% DV, $25 min) + accessorials</span><span class="tabular">' + formatMoney(p.insurance + p.lift + p.residential) + '</span></div>';
      if (p.overrideApplied && p.manualOverrideDelta != null && Math.abs(p.manualOverrideDelta) >= 0.01) {
        html += '<div class="pricing-line pricing-line--override"><span>Manual price adjustment' +
          '<span class="pricing-line-formula">Rep override · engine total was ' + formatMoney(p.engineTotal) + '</span></span>' +
          '<span class="tabular">' + (p.manualOverrideDelta >= 0 ? '+' : '−') + formatMoney(Math.abs(p.manualOverrideDelta)) + '</span></div>';
      }
    } else {
      html += '<div class="pricing-line"><span>Linehaul (net)</span><span class="tabular">' + formatMoney(p.stack.linehaul) + '</span></div>';
      html += '<div class="pricing-line"><span>Fuel</span><span class="tabular">' + formatMoney(p.fuel) + '</span></div>';
      html += '<div class="pricing-line"><span>Accessorials</span><span class="tabular">' + formatMoney(p.stack.access) + '</span></div>';
    }
    html += '<div class="pricing-line total"><span>Total</span><span class="tabular">' + (p.cfq ? '—' : formatMoney(p.total)) + '</span></div>';
    html += '</div>';
    return html;
  }

  function renderStackedBar(p) {
    if (p.cfq || !p.total) return '';
    var t = p.total || 1;
    var segs = [
      { cls: 'linehaul', w: (p.stack.linehaul / t) * 100 },
      { cls: 'fuel', w: (p.fuel / t) * 100 },
      { cls: 'access', w: (p.stack.access / t) * 100 }
    ];
    if (p.overrideApplied && p.manualOverrideDelta != null && Math.abs(p.manualOverrideDelta) >= 0.01) {
      segs.push({ cls: 'override', w: (Math.abs(p.manualOverrideDelta) / t) * 100 });
    }
    var html = '<div class="quote-stack-bar" role="img" aria-label="Price composition">';
    segs.forEach(function (s) {
      html += '<span class="quote-stack-seg quote-stack-seg--' + s.cls + '" style="width:' + Math.max(s.w, 2) + '%"></span>';
    });
    html += '</div>';
    return html;
  }

  function layerUid() {
    return 'layer-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  }

  function getQuoteLayerTemplates() {
    var store = getStore();
    if (!store) return [];
    var s = store.getState().settings;
    if (s.quoteLayerTemplates && s.quoteLayerTemplates.length) return s.quoteLayerTemplates;
    return s.adjustmentLayerPresets || [];
  }

  function getAdjustmentLayerPresets() {
    return getQuoteLayerTemplates();
  }

  function getCustomLayerTypes() {
    var store = getStore();
    if (!store) return [{ type: 'flat_add', label: 'Flat charge ($)' }];
    return store.getState().settings.customLayerTypes || [];
  }

  function resolveLayerDefaultValue(preset, ctx) {
    ctx = ctx || {};
    if (preset.defaultSource === 'customer') return ctx.customerDiscPct != null ? ctx.customerDiscPct : 5;
    if (preset.defaultSource && preset.defaultSource.indexOf('accessorial:') === 0) {
      var accId = preset.defaultSource.split(':')[1];
      var acc = accessorialRates();
      if (accId === 'acc-lift') return acc.lift;
      if (accId === 'acc-res') return acc.residential;
      if (accId === 'acc-extra') return 95;
    }
    return preset.defaultValue != null ? preset.defaultValue : 0;
  }

  var SERVICE_TO_DISC_LABEL = {
    b2b: 'B2B',
    threshold: 'Threshold',
    wgni: 'White Glove No Inspection',
    wgi: 'White Glove Inspection'
  };

  function resolveCustomerDiscForService(customer, serviceType) {
    if (!customer) return 5;
    var label = SERVICE_TO_DISC_LABEL[serviceType] || 'B2B';
    var row = (customer.serviceDiscounts || []).find(function (d) { return d.service === label; });
    if (row) return row.pct;
    return customer.overallDiscPct != null ? customer.overallDiscPct : 5;
  }

  function buildAppliedTerms(quote, storeAdapter) {
    var s = storeAdapter.getState();
    var customer = storeAdapter.getCustomer(quote.customerId);
    var serviceType = quote.primaryService || 'b2b';
    var custDisc = resolveCustomerDiscForService(customer, serviceType);
    var tariffId = quote.tariffId || resolveTariffId(quote, serviceType);
    var tariff = (s.tariffs || []).find(function (t) { return t.id === tariffId; });
    var fuel = s.reference.fuel || [];
    var fuelRow = fuel.length ? fuel[fuel.length - 1] : null;
    var sd = customer && customer.serviceDiscounts
      ? customer.serviceDiscounts.find(function (d) { return d.service === (SERVICE_TO_DISC_LABEL[serviceType] || 'B2B'); })
      : null;
    return {
      customerId: quote.customerId,
      customerName: customer ? customer.name : quote.customerId,
      serviceType: serviceType,
      serviceLabel: SERVICE_LABELS[serviceType] || serviceType,
      customerDiscPctMaster: custDisc,
      tariffId: tariffId,
      tariffLabel: tariff ? tariff.name : tariffId,
      fuelPct: fuelRow ? fuelRow.pct : (s.settings.demoLane && s.settings.demoLane.fuelPct) || 28.4,
      fuelSource: fuelRow ? fuelRow.source : 'National index',
      insuranceRule: '1% DV · $25 min',
      density: sd && sd.density != null && sd.density !== ''
        ? (function () {
          var NF = typeof global !== 'undefined' ? global.AwestNumericFields : null;
          return NF ? NF.formatDensityLabel(sd.density) : sd.density + ' lbs/cu ft';
        }())
        : null,
      snapshottedAt: quote.createdAt || new Date().toISOString()
    };
  }

  function buildDefaultQuoteAdjustments(ctx) {
    ctx = ctx || {};
    var presets = getQuoteLayerTemplates();
    var home = ctx.serviceFamily === 'home';
    return presets.map(function (preset) {
      var enabled = preset.defaultEnabled;
      var value = preset.defaultValue != null ? preset.defaultValue : resolveLayerDefaultValue(preset, ctx);
      if (preset.presetId === 'quote-discount' && ctx.quoteDiscPct != null) value = ctx.quoteDiscPct;
      if (preset.presetId === 'lane-override' && ctx.laneOverride != null) value = ctx.laneOverride;
      if (preset.presetId === 'customer-disc-override') {
        value = ctx.masterValue != null ? ctx.masterValue : (ctx.customerDiscPct != null ? ctx.customerDiscPct : 0);
        enabled = false;
      }
      if (preset.presetId === 'residential' && home) enabled = true;
      if (preset.presetId === 'lift-gate' && home) enabled = false;
      return {
        id: layerUid(),
        presetId: preset.presetId,
        name: preset.name,
        type: preset.type,
        value: value,
        enabled: enabled,
        custom: false,
        masterValue: preset.presetId === 'customer-disc-override'
          ? (ctx.masterValue != null ? ctx.masterValue : ctx.customerDiscPct)
          : undefined
      };
    });
  }

  function buildDefaultAdjustmentLayers(ctx) {
    return buildDefaultQuoteAdjustments(ctx);
  }

  function isLegacyAdjustmentLayers(layers) {
    return layers && layers.some(function (l) { return l.presetId === 'customer-discount'; });
  }

  function migrateFromAdjustmentLayers(quote, storeAdapter) {
    var layers = quote.adjustmentLayers || [];
    var applied = buildAppliedTerms(quote, storeAdapter);
    var adjustments = buildDefaultQuoteAdjustments({
      quoteDiscPct: quote.quoteDiscPct,
      laneOverride: quote.laneOverride,
      serviceFamily: quote.serviceFamily,
      primaryService: quote.primaryService,
      masterValue: applied.customerDiscPctMaster,
      customerDiscPct: applied.customerDiscPctMaster
    });
    var custLayer = layers.find(function (l) { return l.presetId === 'customer-discount'; });
    if (custLayer && custLayer.enabled && Number(custLayer.value) !== applied.customerDiscPctMaster) {
      var ov = adjustments.find(function (l) { return l.presetId === 'customer-disc-override'; });
      if (ov) {
        ov.enabled = true;
        ov.value = Number(custLayer.value) || 0;
        ov.masterValue = applied.customerDiscPctMaster;
      }
    }
    layers.forEach(function (layer) {
      if (layer.presetId === 'customer-discount') return;
      var adj = adjustments.find(function (a) { return a.presetId === layer.presetId; });
      if (adj) {
        adj.enabled = layer.enabled;
        adj.value = layer.value;
        adj.id = layer.id || adj.id;
      } else if (layer.custom) {
        adjustments.push(JSON.parse(JSON.stringify(layer)));
      }
    });
    return { appliedTerms: applied, quoteAdjustments: adjustments };
  }

  function ensureQuotePricingModel(quote, storeAdapter) {
    if (!quote.tariffId) {
      quote.tariffId = resolveTariffId(quote, quote.primaryService || 'b2b');
    }
    if (!quote.appliedTerms) {
      quote.appliedTerms = buildAppliedTerms(quote, storeAdapter);
    }
    if (!quote.quoteAdjustments || !quote.quoteAdjustments.length) {
      if (quote.adjustmentLayers && quote.adjustmentLayers.length) {
        var migrated = migrateFromAdjustmentLayers(quote, storeAdapter);
        quote.appliedTerms = migrated.appliedTerms;
        quote.quoteAdjustments = migrated.quoteAdjustments;
      } else {
        quote.quoteAdjustments = buildDefaultQuoteAdjustments({
          quoteDiscPct: quote.quoteDiscPct,
          laneOverride: quote.laneOverride,
          serviceFamily: quote.serviceFamily,
          primaryService: quote.primaryService,
          masterValue: quote.appliedTerms.customerDiscPctMaster,
          customerDiscPct: quote.appliedTerms.customerDiscPctMaster
        });
      }
    }
    if (quote.appliedTerms && quote.quoteAdjustments) {
      quote.quoteAdjustments.forEach(function (layer) {
        if (layer.presetId === 'customer-disc-override') {
          layer.masterValue = quote.appliedTerms.customerDiscPctMaster;
        }
      });
    }
    syncQuoteFlatFields(quote);
    return quote;
  }

  function syncQuoteFlatFields(quote) {
    var fields = extractQuoteFieldsFromAdjustments(quote.quoteAdjustments, quote.appliedTerms);
    quote.customerDiscPct = fields.custDiscPct;
    quote.quoteDiscPct = fields.quoteDiscPct;
    quote.laneOverride = fields.laneOverride;
  }

  function getEffectiveCustomerDisc(quote) {
    if (!quote) return 0;
    var master = quote.appliedTerms
      ? quote.appliedTerms.customerDiscPctMaster
      : (quote.customerDiscPct || 0);
    var adj = quote.quoteAdjustments || [];
    var override = adj.find(function (l) { return l.enabled && l.presetId === 'customer-disc-override'; });
    if (override) return Number(override.value) || 0;
    return master;
  }

  function hasCustomerDiscException(quote) {
    if (!quote || !quote.appliedTerms) return false;
    var override = (quote.quoteAdjustments || []).find(function (l) {
      return l.enabled && l.presetId === 'customer-disc-override';
    });
    if (!override) return false;
    return Number(override.value) !== quote.appliedTerms.customerDiscPctMaster;
  }

  function extractQuoteFieldsFromAdjustments(adjustments, appliedTerms) {
    var out = {
      custDiscPct: appliedTerms ? appliedTerms.customerDiscPctMaster : 0,
      quoteDiscPct: 0,
      laneOverride: 0,
      lift: 0,
      residential: 0,
      customLayers: [],
      customerDiscOverride: false
    };
    (adjustments || []).filter(function (l) { return l.enabled; }).forEach(function (l) {
      if (l.presetId === 'customer-disc-override' && l.type === 'pct_linehaul') {
        out.customerDiscOverride = true;
        out.custDiscPct = Number(l.value) || 0;
      } else if (l.presetId === 'quote-discount' && l.type === 'pct_linehaul') out.quoteDiscPct = Number(l.value) || 0;
      else if (l.presetId === 'lane-override' && l.type === 'flat_add') out.laneOverride = Number(l.value) || 0;
      else if (l.presetId === 'lift-gate' && l.type === 'flat_add') out.lift = Number(l.value) || 0;
      else if (l.presetId === 'residential' && l.type === 'flat_add') out.residential = Number(l.value) || 0;
      else if (l.custom) out.customLayers.push(l);
    });
    return out;
  }

  function extractQuoteFieldsFromLayers(layers) {
    var out = {
      custDiscPct: 0,
      quoteDiscPct: 0,
      laneOverride: 0,
      lift: 0,
      residential: 0,
      customLayers: []
    };
    (layers || []).filter(function (l) { return l.enabled; }).forEach(function (l) {
      if (l.presetId === 'customer-discount' && l.type === 'pct_linehaul') out.custDiscPct = Number(l.value) || 0;
      else if (l.presetId === 'quote-discount' && l.type === 'pct_linehaul') out.quoteDiscPct = Number(l.value) || 0;
      else if (l.presetId === 'lane-override' && l.type === 'flat_add') out.laneOverride = Number(l.value) || 0;
      else if (l.presetId === 'lift-gate' && l.type === 'flat_add') out.lift = Number(l.value) || 0;
      else if (l.presetId === 'residential' && l.type === 'flat_add') out.residential = Number(l.value) || 0;
      else if (l.custom) out.customLayers.push(l);
    });
    return out;
  }

  function applyCustomLayersToPricing(p, layers, linehaul) {
    var customLines = [];
    var delta = 0;
    (layers || []).filter(function (l) {
      return l.enabled && (l.custom || l.presetId === 'extra-man');
    }).forEach(function (l) {
      var amt = 0;
      if (l.type === 'flat_add') amt = Number(l.value) || 0;
      else if (l.type === 'flat_sub') amt = -(Number(l.value) || 0);
      else if (l.type === 'pct_linehaul') amt = -Math.round(linehaul * ((Number(l.value) || 0) / 100) * 100) / 100;
      delta += amt;
      customLines.push({ name: l.name, amount: amt, type: l.type });
    });
    if (delta !== 0) {
      p.total = Math.round((p.total + delta) * 100) / 100;
      p.customLayerLines = customLines;
      p.customLayerDelta = delta;
    }
    return recomputePricingMargin(p);
  }

  function pricingWithLegacyLayers(q, serviceType, layers) {
    var fields = extractQuoteFieldsFromLayers(layers);
    var enriched = Object.assign({}, q, {
      customerDiscPct: fields.custDiscPct,
      quoteDiscPct: fields.quoteDiscPct,
      laneOverride: fields.laneOverride
    });
    var p = enginePricing(enriched, serviceType);
    if (p.cfq) return p;
    var prevLift = p.lift;
    var prevRes = p.residential;
    p.lift = fields.lift;
    p.residential = fields.residential;
    var accChange = (fields.lift + fields.residential) - (prevLift + prevRes);
    p.total = Math.round((p.total + accChange) * 100) / 100;
    p.stack.access = p.insurance + p.lift + p.residential;
    p = applyCustomLayersToPricing(p, layers, p.linehaul);
    p.adjustmentLayers = layers;
    return recomputePricingMargin(p);
  }

  function pricingWithQuoteModel(q, serviceType, appliedTerms, quoteAdjustments) {
    var fields = extractQuoteFieldsFromAdjustments(quoteAdjustments, appliedTerms);
    var enriched = Object.assign({}, q, {
      customerDiscPct: fields.custDiscPct,
      quoteDiscPct: fields.quoteDiscPct,
      laneOverride: fields.laneOverride
    });
    var p = enginePricing(enriched, serviceType);
    if (p.cfq) return p;
    p.custDiscMaster = appliedTerms ? appliedTerms.customerDiscPctMaster : fields.custDiscPct;
    p.custDiscSource = fields.customerDiscOverride ? 'exception' : 'applied';
    var prevLift = p.lift;
    var prevRes = p.residential;
    p.lift = fields.lift;
    p.residential = fields.residential;
    var accChange = (fields.lift + fields.residential) - (prevLift + prevRes);
    p.total = Math.round((p.total + accChange) * 100) / 100;
    p.stack.access = p.insurance + p.lift + p.residential;
    p = applyCustomLayersToPricing(p, quoteAdjustments, p.linehaul);
    p.appliedTerms = appliedTerms;
    p.quoteAdjustments = quoteAdjustments;
    return recomputePricingMargin(p);
  }

  function pricingWithLayers(q, serviceType, layersOrAdjustments, appliedTermsOpt) {
    var layers = layersOrAdjustments || q.quoteAdjustments || q.adjustmentLayers || [];
    if (isLegacyAdjustmentLayers(layers)) {
      return pricingWithLegacyLayers(q, serviceType, layers);
    }
    return pricingWithQuoteModel(q, serviceType, appliedTermsOpt || q.appliedTerms, layers);
  }

  function layerValueSuffix(type) {
    if (type === 'pct_linehaul') return '%';
    if (type === 'flat_add' || type === 'flat_sub') return '$';
    return '';
  }

  function renderAppliedTermsPanel(applied, mount) {
    if (!mount || !applied) return;
    mount.innerHTML =
      '<div class="applied-terms-panel">' +
      '<dl class="applied-terms-dl">' +
      '<div class="applied-terms-row"><dt>Customer</dt><dd><a href="customer-detail.html?id=' + encodeURIComponent(applied.customerId) + '">' + applied.customerName + '</a></dd></div>' +
      '<div class="applied-terms-row"><dt>Service</dt><dd>' + applied.serviceLabel + '</dd></div>' +
      '<div class="applied-terms-row"><dt>Customer discount</dt><dd class="tabular">' + applied.customerDiscPctMaster + '% <span class="applied-terms-lock" title="Snapshotted at quote create">locked</span></dd></div>' +
      '<div class="applied-terms-row"><dt>Tariff</dt><dd><a href="tariff-detail.html?id=' + encodeURIComponent(applied.tariffId) + '">' + applied.tariffLabel + '</a></dd></div>' +
      '<div class="applied-terms-row"><dt>Fuel</dt><dd class="tabular">' + applied.fuelPct + '% · ' + applied.fuelSource + '</dd></div>' +
      '<div class="applied-terms-row"><dt>Insurance</dt><dd>' + applied.insuranceRule + '</dd></div>' +
      (applied.density ? '<div class="applied-terms-row"><dt>Density</dt><dd>' + applied.density + '</dd></div>' : '') +
      '</dl>' +
      '<p class="text-muted-sm applied-terms-note">Snapshotted when this quote was created — customer master edits do not change open quotes.</p>' +
      '</div>';
  }

  function renderQuoteAdjustmentsEditor(layers, mount, onChange) {
    renderAdjustmentLayerEditor(layers, mount, onChange);
  }

  function renderAdjustmentLayerEditor(layers, mount, onChange) {
    if (!mount) return;
    var presets = getQuoteLayerTemplates();
    var presetHint = {};
    presets.forEach(function (p) { presetHint[p.presetId] = p.hint || ''; });

    var html = '<table class="adjustment-layers-table"><thead><tr>' +
      '<th scope="col" class="col-on">On</th><th scope="col">Layer</th><th scope="col">Type</th>' +
      '<th scope="col" class="col-val">Value</th><th scope="col" class="col-act"></th></tr></thead><tbody>';
    layers.forEach(function (layer, idx) {
      var typeLabel = layer.type === 'pct_linehaul' ? '% linehaul' : (layer.type === 'flat_sub' ? 'Credit' : 'Flat $');
      var suffix = layerValueSuffix(layer.type);
      var hint = layer.custom ? 'Custom layer' : (presetHint[layer.presetId] || '');
      html += '<tr data-layer-idx="' + idx + '">' +
        '<td class="col-on"><input type="checkbox" data-layer-enabled ' + (layer.enabled ? 'checked' : '') + ' aria-label="Enable ' + layer.name + '"></td>' +
        '<td><span class="adjustment-layer-name">' + layer.name + '</span>' +
        (hint ? '<span class="adjustment-layer-hint">' + hint + '</span>' : '') + '</td>' +
        '<td><span class="badge badge-draft">' + typeLabel + '</span></td>' +
        '<td class="col-val"><div class="adjustment-layer-value-wrap">' +
        '<input type="number" class="tabular" data-layer-value value="' + layer.value + '" step="' + (layer.type === 'pct_linehaul' ? '0.1' : '0.01') + '" min="0" ' + (layer.enabled ? '' : 'disabled') + '>' +
        '<span class="adjustment-layer-suffix">' + suffix + '</span></div></td>' +
        '<td class="col-act">' + (layer.custom ? '<button type="button" class="btn btn-link btn-sm" data-layer-remove>Remove</button>' : '') + '</td></tr>';
    });
    html += '</tbody></table>';
    mount.innerHTML = html;

    mount.querySelectorAll('[data-layer-enabled]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var idx = parseInt(cb.closest('tr').getAttribute('data-layer-idx'), 10);
        layers[idx].enabled = cb.checked;
        var valInput = cb.closest('tr').querySelector('[data-layer-value]');
        if (valInput) valInput.disabled = !cb.checked;
        onChange();
      });
    });
    mount.querySelectorAll('[data-layer-value]').forEach(function (input) {
      input.addEventListener('input', function () {
        var idx = parseInt(input.closest('tr').getAttribute('data-layer-idx'), 10);
        layers[idx].value = parseFloat(input.value) || 0;
        onChange();
      });
      input.addEventListener('change', function () {
        var idx = parseInt(input.closest('tr').getAttribute('data-layer-idx'), 10);
        layers[idx].value = parseFloat(input.value) || 0;
        onChange();
      });
    });
    mount.querySelectorAll('[data-layer-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.closest('tr').getAttribute('data-layer-idx'), 10);
        layers.splice(idx, 1);
        onChange(true);
      });
    });
  }

  function addCustomLayer(layers, type) {
    var types = getCustomLayerTypes();
    var meta = types.find(function (t) { return t.type === type; }) || { label: 'Custom' };
    layers.push({
      id: layerUid(),
      presetId: null,
      name: meta.label.replace(/\s*\(.*\)/, ''),
      type: type,
      value: 0,
      enabled: true,
      custom: true,
      editable: true,
      removable: true
    });
    return layers;
  }

  function renderCostLayers(p, opts) {
    opts = opts || {};
    if (p.cfq) {
      return '<div class="cost-layer cost-layer--cfq"><span class="cost-layer__name">Base rate</span><span class="cost-layer__amt">CFQ</span></div>' +
        '<p class="text-muted-sm" style="margin-top:8px">Manual rating required for this lane.</p>';
    }
    var rateNote = p.minimumApplied
      ? formatRatePerLb(p.ratePerLb) + ' × ' + Number(p.weight).toLocaleString() + ' lbs → min ' + formatMoney(p.minimum)
      : formatRatePerLb(p.ratePerLb) + ' × ' + Number(p.weight).toLocaleString() + ' lbs';
    var custDiscName = p.custDiscSource === 'exception' ? 'Customer discount (exception)' : 'Customer discount';
    var custDiscDetail = p.custDiscSource === 'exception'
      ? '−' + p.custDiscPct + '% on linehaul · master was ' + (p.custDiscMaster != null ? p.custDiscMaster : '—') + '%'
      : '−' + p.custDiscPct + '% on linehaul · from customer master';
    var appliedStack = [
      { num: 1, name: 'Base rate', detail: rateNote + (p.laneLabel ? ' · ' + p.laneLabel : ''), amt: p.linehaul, cls: 'base' },
      { num: 2, name: custDiscName, detail: custDiscDetail, amt: -p.custDiscAmt, cls: p.custDiscSource === 'exception' ? 'exception' : 'disc', hide: !p.custDiscAmt && !p.custDiscPct },
      { num: 3, name: 'Fuel surcharge', detail: p.fuelPct + '% on net linehaul', amt: p.fuel, cls: 'fuel' },
      { num: 4, name: 'Insurance', detail: '1% DV · $25 min', amt: p.insurance, cls: 'access' }
    ];
    var adjStack = [];
    var num = 5;
    if (p.quoteDiscAmt) {
      adjStack.push({ num: num++, name: 'Quote discount', detail: '−' + formatPct(p.quoteDiscPct) + '% rep adjustment', amt: -p.quoteDiscAmt, cls: 'disc' });
    }
    if (p.lane > 0) adjStack.push({ num: num++, name: 'Lane override', detail: 'Flat add-on', amt: p.lane, cls: 'adj' });
    if (p.lift > 0) adjStack.push({ num: num++, name: 'Lift gate', detail: 'Accessorial layer', amt: p.lift, cls: 'access' });
    if (p.residential > 0) adjStack.push({ num: num++, name: 'Residential delivery', detail: 'Accessorial layer', amt: p.residential, cls: 'access' });
    (p.customLayerLines || []).forEach(function (cl) {
      if (!cl.amount) return;
      adjStack.push({ num: num++, name: cl.name, detail: cl.type === 'pct_linehaul' ? '% of linehaul' : 'Custom adjustment', amt: cl.amount, cls: 'adj' });
    });

    function renderStack(stack) {
      var out = '';
      stack.forEach(function (L) {
        if (L.hide) return;
        var amtStr = L.amt < 0 ? '−' + formatMoney(Math.abs(L.amt)).replace('−', '') : formatMoney(L.amt);
        out += '<div class="cost-layer cost-layer--' + L.cls + '">' +
          '<div class="cost-layer__head"><span class="cost-layer__num">' + L.num + '</span>' +
          '<span class="cost-layer__name">' + L.name + '</span>' +
          '<span class="cost-layer__amt tabular">' + amtStr + '</span></div>' +
          (L.detail ? '<p class="cost-layer__detail">' + L.detail + '</p>' : '') +
          '</div>';
      });
      return out;
    }

    var html = '<div class="cost-layer-stack-inner">';
    html += '<div class="cost-layer-group"><p class="cost-layer-group__label">From customer &amp; tariff</p>' + renderStack(appliedStack) + '</div>';
    if (adjStack.length) {
      html += '<div class="cost-layer-group"><p class="cost-layer-group__label">Your adjustments</p>' + renderStack(adjStack) + '</div>';
    }
    html += '<div class="cost-layer cost-layer--total">' +
      '<span class="cost-layer__name">Total</span>' +
      '<span class="cost-layer__amt tabular">' + formatMoney(p.total) + '</span></div>';
    html += '</div>';
    return html;
  }

  function resolveBuilderService(family, hdTier, customerId) {
    var serviceType = family === 'home' ? (hdTier || 'threshold') : 'b2b';
    var store = getStore();
    var TE = getTariffEngine();
    if (store && TE) {
      var t = TE.resolveAutoTariff(store.getState(), customerId, serviceType);
      if (t) {
        var label = family === 'home'
          ? 'Home Transport · ' + SERVICE_LABELS[serviceType]
          : SERVICE_LABELS[serviceType];
        return {
          primaryService: serviceType,
          tariffId: t.id,
          tariffLabel: t.name,
          displayLabel: label
        };
      }
    }
    if (family === 'home') {
      var hd = HD_TARIFFS[hdTier || 'threshold'] || HD_TARIFFS.threshold;
      return { primaryService: hd.service, tariffId: hd.tariffId, tariffLabel: hd.tariffLabel, displayLabel: 'Home Transport · ' + SERVICE_LABELS[hd.service] };
    }
    return { primaryService: 'b2b', tariffId: SERVICE_FAMILIES.b2b.tariffId, tariffLabel: SERVICE_FAMILIES.b2b.tariffLabel, displayLabel: 'B2B' };
  }


  function needsApproval(custDisc, quoteDisc, margin, quoteObj) {
    var store = getStore();
    if (quoteObj && store && window.AwestGovernance) {
      return window.AwestGovernance.needsApproval(store.getState(), quoteObj);
    }
    if (store && window.AwestGovernance) {
      var q = { customerDiscPct: custDisc, quoteDiscPct: quoteDisc, pricing: { margin: margin } };
      return window.AwestGovernance.needsApproval(store.getState(), q);
    }
    var totalDisc = custDisc + quoteDisc;
    if (totalDisc > REP_MAX_DISCOUNT) return { type: 'discount', msg: 'Combined discount of ' + totalDisc + '% exceeds rep authority (max ' + REP_MAX_DISCOUNT + '%).' };
    if (margin < marginFloorFromStore()) return { type: 'margin', msg: 'Custom discount reduced margin to ' + margin + '% (floor ' + marginFloorFromStore() + '%).' };
    return null;
  }

  function initQuotePricingDrawer(table) {
    var veil = document.getElementById('quote-pricing-drawer-veil');
    if (!veil || !table) return null;
    var titleEl = document.getElementById('quote-pricing-drawer-title');
    var metaEl = veil.querySelector('[data-pricing-drawer-meta]');
    var mount = veil.querySelector('[data-pricing-drawer-mount]');
    var drawer = veil.querySelector('.quote-pricing-drawer');
    var closeBtn = veil.querySelector('[data-pricing-drawer-close]');
    var activeId = null;
    var closeTimer = null;
    var HOVER_GRACE = 280;

    function custNameFromQuote(q) {
      var store = getStore();
      if (!store || !q.customerId) return '';
      var c = store.getCustomer(q.customerId);
      return c ? c.name : '';
    }

    function laneLabel(q) {
      return (q.origin || '') + ' → ' + (q.destination || '');
    }

    function renderDrawerContent(q) {
      var p = quotePricing(q);
      var meta = pricingMetaFromQuote(q);
      if (titleEl) titleEl.textContent = q.id;
      if (metaEl) {
        var svc = q.primaryService ? ' · ' + (SERVICE_LABELS[q.primaryService] || q.primaryService) : '';
        metaEl.textContent = [custNameFromQuote(q), laneLabel(q), p.margin + '% margin' + svc].filter(Boolean).join(' · ');
      }
      if (mount) mount.innerHTML = renderStackedBar(p) + renderPricingBreakdown(p, false, meta);
    }

    function openForQuote(q) {
      if (!q) return;
      clearTimeout(closeTimer);
      activeId = q.id;
      renderDrawerContent(q);
      veil.classList.add('is-open');
      veil.setAttribute('aria-hidden', 'false');
    }

    function close() {
      clearTimeout(closeTimer);
      activeId = null;
      veil.classList.remove('is-open');
      veil.setAttribute('aria-hidden', 'true');
    }

    function scheduleClose() {
      clearTimeout(closeTimer);
      closeTimer = setTimeout(close, HOVER_GRACE);
    }

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (drawer) {
      drawer.addEventListener('mouseenter', function () { clearTimeout(closeTimer); });
      drawer.addEventListener('mouseleave', scheduleClose);
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && veil.classList.contains('is-open')) close();
    });

    return {
      openForQuote: openForQuote,
      close: close,
      scheduleClose: scheduleClose,
      refreshIfOpen: function (q) {
        if (q && activeId === q.id && veil.classList.contains('is-open')) renderDrawerContent(q);
      }
    };
  }

  function initQuotesListEnhanced() {
    var table = document.getElementById('quotes-table');
    if (!table || !table.classList.contains('quotes-table-enhanced')) return;
    ensurePresetDatalists();
    var drawerCtl = initQuotePricingDrawer(table);

    table.querySelectorAll('tr[data-quote-id]').forEach(function (row) {
      var id = row.getAttribute('data-quote-id');
      var q = quoteFromStore(id);
      if (!q) return;

      function refresh(quoteDiscOverride, opts) {
        opts = opts || {};
        var qd = quoteDiscOverride != null ? quoteDiscOverride : (q.quoteDiscPct || 0);
        if (quoteDiscOverride != null && opts.persist && getStore()) {
          getStore().updateQuote(id, { quoteDiscPct: qd });
          q = quoteFromStore(id);
          qd = q.quoteDiscPct || 0;
        }
        var p;
        if (quoteDiscOverride != null && !opts.persist) {
          p = pricingForQuoteDisc(q, qd);
        } else {
          var store = getStore();
          p = store && store.computeQuotePricing ? store.computeQuotePricing(q) : resolveQuotePricing(q);
        }
        p.personalized = qd > 0 || hasCustomerDiscException(q);
        var amountCell = row.querySelector('.quote-amount-cell');
        if (amountCell) {
          amountCell.querySelector('.quote-total-amt').textContent = p.cfq ? 'CFQ' : formatMoney(p.total);
          amountCell.setAttribute('title', q.primaryService ? SERVICE_LABELS[q.primaryService] || '' : '');
          var stackEl = amountCell.querySelector('.quote-stack-mount');
          if (stackEl) stackEl.innerHTML = renderStackedBar(p);
        }
        if (drawerCtl) drawerCtl.refreshIfOpen(q);
        var discCell = row.querySelector('.quote-disc-mount');
        if (discCell) {
          var appliedMaster = q.appliedTerms ? q.appliedTerms.customerDiscPctMaster : q.customerDiscPct;
          var effectiveCust = getEffectiveCustomerDisc(q);
          var badges = '<div class="quote-discount-badges">' +
            '<span class="quote-disc-badge" title="Snapshotted customer master">' + appliedMaster + '% applied</span>';
          if (hasCustomerDiscException(q)) {
            badges += '<span class="quote-disc-badge exception" title="Override of customer terms">' + effectiveCust + '% exception</span>';
          }
          if (qd > 0) badges += '<span class="quote-disc-badge quote">+' + formatPct(qd) + '% quote</span>';
          badges += '</div>';
          if (p.personalized || hasCustomerDiscException(q) || qd > 0) {
            badges += '<span class="quote-personalized-tag">Custom pricing</span>';
          }
          discCell.innerHTML = badges;
        }
        var detailRow = table.querySelector('tr[data-quote-detail="' + id + '"]');
        if (detailRow) {
          var mount = detailRow.querySelector('[data-breakdown-mount]');
          if (mount) mount.innerHTML = renderPricingBreakdown(p, false);
        }
        var discInput = detailRow ? detailRow.querySelector('[data-quote-disc-input]') : null;
        if (discInput && quoteDiscOverride == null) discInput.value = formatPct(qd);
        else if (discInput && quoteDiscOverride != null && !opts.persist) {
          /* keep user typing — do not reset input value */
        } else if (discInput && opts.persist) discInput.value = formatPct(qd);
        row.setAttribute('data-amount', String(p.total || 0));
        var marginCell = row.querySelector('[data-quote-margin]');
        if (marginCell) marginCell.textContent = p.margin + '%';
        var statusCell = row.querySelector('td .badge');
        if (statusCell && q.status) {
          statusCell.outerHTML = '<span class="badge badge-' + (q.status === 'pending' ? 'pending' : q.status) + '">' +
            quoteLifecycleLabel(q.status) + '</span>';
        }
        row.setAttribute('data-status', q.status);
      }

      refresh();
      var amountCell = row.querySelector('.quote-amount-cell');
      if (amountCell && drawerCtl) {
        amountCell.addEventListener('mouseenter', function () { drawerCtl.openForQuote(quoteFromStore(id)); });
        amountCell.addEventListener('mouseleave', drawerCtl.scheduleClose);
        amountCell.addEventListener('focus', function () { drawerCtl.openForQuote(quoteFromStore(id)); });
        amountCell.addEventListener('blur', function (e) {
          var drawerEl = document.querySelector('#quote-pricing-drawer-veil .quote-pricing-drawer');
          if (!drawerEl || !drawerEl.contains(e.relatedTarget)) drawerCtl.scheduleClose();
        });
      }
      var detailRow = table.querySelector('tr[data-quote-detail="' + id + '"]');
      var discInput = detailRow ? detailRow.querySelector('[data-quote-disc-input]') : null;
      if (discInput) {
        bindNumericInput(discInput, function (val, opts) { refresh(val, opts); }, { commit: 'blur' });
      }
      var toggle = row.querySelector('[data-calc-toggle]');
      if (toggle && detailRow) {
        if (!detailRow.classList.contains('is-collapsed')) detailRow.classList.add('is-collapsed');
        function syncCalcToggle() {
          var collapsed = detailRow.classList.contains('is-collapsed');
          toggle.textContent = collapsed ? 'Show calculation' : 'Hide calculation';
          toggle.classList.toggle('action-pill--active', !collapsed);
        }
        syncCalcToggle();
        toggle.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          detailRow.classList.toggle('is-collapsed');
          if (!detailRow.classList.contains('is-collapsed')) detailRow.hidden = false;
          syncCalcToggle();
        });
      }
      row.querySelectorAll('[data-inline-approve]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          if (window.confirm('Approve ' + id + '?')) { getStore().approveQuote(id); location.reload(); }
        });
      });
      row.querySelectorAll('[data-inline-reject]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          if (window.confirm('Reject ' + id + '?')) { getStore().rejectQuote(id); location.reload(); }
        });
      });
    });
  }

  function resolveBuilderCustomerId() {
    var store = getStore();
    if (!store) return 'PACI-1200';
    var params = new URLSearchParams(location.search);
    var editId = params.get('id');
    if (editId) {
      var eq = store.getQuote(editId);
      if (eq && eq.customerId) return eq.customerId;
    }
    var prefill = store.getAssistantPrefill();
    if (prefill && prefill.customerId) return prefill.customerId;
    var queryCid = params.get('customer') || params.get('customerId');
    if (queryCid && store.getCustomer(queryCid)) return queryCid;
    return 'PACI-1200';
  }

  function resolveBuilderCustDisc(customerId, serviceType) {
    var store = getStore();
    if (!store) return 5;
    var editId = new URLSearchParams(location.search).get('id');
    if (editId) {
      var eq = store.getQuote(editId);
      if (eq && eq.appliedTerms) return eq.appliedTerms.customerDiscPctMaster;
      if (eq) {
        return resolveCustomerDiscForService(store.getCustomer(eq.customerId), eq.primaryService || serviceType || 'b2b');
      }
    }
    var cid = customerId || resolveBuilderCustomerId();
    var c = store.getCustomer(cid);
    return resolveCustomerDiscForService(c, serviceType || 'b2b');
  }

  function resolveHdTierFromQuote(q) {
    if (!q) return 'threshold';
    if (q.preferredService === 'threshold' || q.preferredService === 'wgni' || q.preferredService === 'wgi') {
      return q.preferredService;
    }
    var ps = q.primaryService || 'threshold';
    if (ps === 'wg-insp' || ps === 'wgi') return 'wgi';
    if (ps === 'wg-no-insp' || ps === 'wgni') return 'wgni';
    if (ps === 'threshold') return 'threshold';
    return 'wgi';
  }

  function initQuoteBuilderPricing() {
    var root = document.querySelector('[data-quote-builder-pricing]');
    if (!root) return;
    ensurePresetDatalists();

    var govBanner = document.querySelector('[data-governance-banner]');
    var submitBtn = document.querySelector('[data-quote-submit-btn]');
    var breakdownMount = document.querySelector('[data-builder-breakdown]');
    var marginEl = document.querySelector('[data-builder-margin]');
    var adjustPanel = document.querySelector('[data-adjust-pricing]');
    var costLayersMount = document.querySelector('[data-cost-layers]');
    var layersEditorMount = document.querySelector('[data-adjustment-layers-editor]');
    var addLayerBtn = document.querySelector('[data-add-layer-btn]');
    var addLayerType = document.querySelector('[data-add-layer-type]');
    var totalHero = document.querySelector('[data-builder-total]');
    var serviceLabelEl = document.querySelector('[data-builder-service-label]');
    var marginInline = document.querySelector('[data-builder-margin-inline]');
    var resolvedTariffEl = document.querySelector('[data-resolved-tariff]');
    var hdTierPicker = document.querySelector('[data-hd-tier-picker]');
    var laneNote = document.querySelector('[data-lane-resolve-note]');
    var calcToggle = document.querySelector('[data-builder-calc-toggle]');
    var calcDetail = document.querySelector('[data-builder-calc-detail]');

    var selectedFamily = 'b2b';
    var selectedHdTier = 'threshold';
    var quoteAdjustments = [];
    var storedAppliedTerms = null;
    var editQuoteId = new URLSearchParams(location.search).get('id');
    var builderCustomerId = resolveBuilderCustomerId();
    var appliedTermsMount = document.querySelector('[data-applied-terms-panel]');
    var adjustmentsEditorMount = document.querySelector('[data-quote-adjustments-editor]') || layersEditorMount;

    function storeAdapter() {
      var store = getStore();
      return {
        getState: function () { return store.getState(); },
        getCustomer: function (id) { return store.getCustomer(id); }
      };
    }

    function layerContext() {
      var svc = resolveBuilderService(selectedFamily, selectedHdTier, builderCustomerId);
      var master = storedAppliedTerms
        ? storedAppliedTerms.customerDiscPctMaster
        : resolveBuilderCustDisc(builderCustomerId, svc.primaryService);
      return {
        customerDiscPct: master,
        masterValue: master,
        serviceFamily: selectedFamily,
        primaryService: svc.primaryService,
        quoteDiscPct: 0,
        laneOverride: 0
      };
    }

    function initQuoteAdjustments(fromQuote) {
      if (fromQuote && fromQuote.quoteAdjustments && fromQuote.quoteAdjustments.length) {
        quoteAdjustments = JSON.parse(JSON.stringify(fromQuote.quoteAdjustments));
        storedAppliedTerms = fromQuote.appliedTerms
          ? JSON.parse(JSON.stringify(fromQuote.appliedTerms))
          : null;
        return;
      }
      if (fromQuote && fromQuote.adjustmentLayers && fromQuote.adjustmentLayers.length) {
        var migrated = migrateFromAdjustmentLayers(fromQuote, storeAdapter());
        quoteAdjustments = migrated.quoteAdjustments;
        storedAppliedTerms = migrated.appliedTerms;
        return;
      }
      quoteAdjustments = buildDefaultQuoteAdjustments(layerContext());
      storedAppliedTerms = null;
    }

    function previewAppliedTerms(q) {
      if (storedAppliedTerms && editQuoteId) return storedAppliedTerms;
      return buildAppliedTerms(q, storeAdapter());
    }

    function onAdjustmentsChange(reRenderEditor) {
      if (reRenderEditor) renderQuoteAdjustmentsEditor(quoteAdjustments, adjustmentsEditorMount, onAdjustmentsChange);
      refresh();
    }

    function readHdTier() {
      var checked = document.querySelector('[data-hd-tier]:checked');
      return checked ? checked.value : 'threshold';
    }

    function readFamily() {
      var checked = document.querySelector('[data-service-family]:checked');
      return checked ? checked.value : 'b2b';
    }

    function syncServiceUI() {
      selectedFamily = readFamily();
      selectedHdTier = readHdTier();
      if (hdTierPicker) hdTierPicker.hidden = selectedFamily !== 'home';
      var svc = resolveBuilderService(selectedFamily, selectedHdTier, builderCustomerId);
      if (resolvedTariffEl) {
        resolvedTariffEl.innerHTML = 'Base tariff: <strong><a href="tariff-detail.html?id=' + encodeURIComponent(svc.tariffId) + '">' + svc.tariffId + '</a></strong> · ' + svc.tariffLabel;
      }
      if (serviceLabelEl) serviceLabelEl.textContent = svc.displayLabel;
      if (laneNote) {
        laneNote.textContent = selectedFamily === 'b2b'
          ? 'B2B lane: 3-digit ZIP zone (+ 5-digit exceptions). TMV pickup → SC zone for demo.'
          : 'Home Transport: 5-digit ZIP → metro tier (Greenville Tier 1 for Anderson SC).';
      }
    }

    document.querySelectorAll('[data-service-family]').forEach(function (el) {
      el.addEventListener('change', function () {
        syncServiceUI();
        var prevCustom = quoteAdjustments.filter(function (l) { return l.custom; });
        quoteAdjustments = buildDefaultQuoteAdjustments(layerContext());
        quoteAdjustments = quoteAdjustments.concat(prevCustom);
        if (!editQuoteId) storedAppliedTerms = null;
        onAdjustmentsChange(true);
      });
    });
    document.querySelectorAll('[data-hd-tier]').forEach(function (el) {
      el.addEventListener('change', function () {
        syncServiceUI();
        var prevCustom = quoteAdjustments.filter(function (l) { return l.custom; });
        quoteAdjustments = buildDefaultQuoteAdjustments(layerContext());
        quoteAdjustments = quoteAdjustments.concat(prevCustom);
        if (!editQuoteId) storedAppliedTerms = null;
        onAdjustmentsChange(true);
      });
    });

    if (addLayerBtn) {
      addLayerBtn.addEventListener('click', function () {
        var type = addLayerType ? addLayerType.value : 'flat_add';
        addCustomLayer(quoteAdjustments, type);
        onAdjustmentsChange(true);
      });
    }

    if (new URLSearchParams(location.search).get('personalize') === '1' && adjustPanel) adjustPanel.open = true;
    if (new URLSearchParams(location.search).get('cfq') === '1') {
      var cfqPanel = document.querySelector('[data-cfq-panel]');
      if (cfqPanel) cfqPanel.hidden = false;
    }

    var weightInput = document.querySelector('[data-shipment-weight]');
    var cubeInput = document.querySelector('[data-shipment-cube]');
    var pickupZipInput = document.querySelector('[data-pickup-zip]');
    var deliveryZipInput = document.querySelector('[data-delivery-zip]');
    var declaredInput = document.querySelector('[data-declared-value]');
    var competitorInput = document.querySelector('[data-competitor-rate]');
    var competitorDelta = document.querySelector('[data-competitor-delta]');
    var cubeNote = document.querySelector('[data-builder-cube-note]');
    var spotFuelInput = document.querySelector('[data-spot-fuel]');
    var spotBaseInput = document.querySelector('[data-spot-base]');
    var cfqBaseInput = document.querySelector('[data-cfq-base]');
    var cfqFuelInput = document.querySelector('[data-cfq-fuel]');
    var competitorNameInput = document.querySelector('[data-competitor-name]');
    var draftBtn = document.querySelector('[data-quote-draft]');
    var densityDisplay = document.querySelector('[data-builder-density]');

    function isSpotMode() {
      var spot = document.querySelector('[data-quote-type-toggle] input[value="spot"]:checked');
      return !!spot;
    }

    function isCfqManualMode() {
      var cfqPanel = document.querySelector('[data-cfq-panel]');
      if (!cfqPanel || cfqPanel.hidden) return false;
      return parseNumericInput(cfqBaseInput, 0) > 0;
    }

    function readPricingMode() {
      if (isSpotMode()) return 'spot';
      if (isCfqManualMode()) return 'cfq-manual';
      return 'engine';
    }

    function builderQuote() {
      var svc = resolveBuilderService(selectedFamily, selectedHdTier, builderCustomerId);
      var mode = readPricingMode();
      var qPreview = {
        customerId: builderCustomerId,
        primaryService: svc.primaryService,
        tariffId: svc.tariffId,
        pricingMode: mode
      };
      var applied = previewAppliedTerms(qPreview);
      var fields = extractQuoteFieldsFromAdjustments(quoteAdjustments, applied);
      var payload = {
        pickupZip: String(parseNumericInput(pickupZipInput, 27260)),
        deliveryZip: String(parseNumericInput(deliveryZipInput, 29621)),
        weight: parseNumericInput(weightInput, 4200),
        cube: parseNumericInput(cubeInput, 494),
        declaredValue: parseNumericInput(declaredInput, 45000),
        customerDiscPct: fields.custDiscPct,
        quoteDiscPct: fields.quoteDiscPct,
        laneOverride: fields.laneOverride,
        customerId: builderCustomerId,
        originStation: resolveOriginStation(String(parseNumericInput(pickupZipInput, 27260))),
        primaryService: svc.primaryService,
        tariffId: svc.tariffId,
        serviceFamily: selectedFamily,
        pricingMode: mode,
        appliedTerms: storedAppliedTerms,
        quoteAdjustments: quoteAdjustments
      };
      if (mode === 'spot') {
        payload.spotBaseCwt = parseNumericInput(spotBaseInput, dummyTariff().spotBaseCwtDefault);
        payload.spotFuelPct = spotFuelInput && spotFuelInput.value.trim()
          ? parseNumericInput(spotFuelInput, latestFuelPct())
          : latestFuelPct();
      }
      if (mode === 'cfq-manual') {
        payload.cfqManualBase = parseNumericInput(cfqBaseInput, 0);
        payload.cfqManualFuel = cfqFuelInput && cfqFuelInput.value.trim()
          ? parseNumericInput(cfqFuelInput, latestFuelPct())
          : latestFuelPct();
      }
      if (competitorNameInput && competitorNameInput.value.trim()) {
        payload.competitorName = competitorNameInput.value.trim();
      }
      if (competitorInput && parseNumericInput(competitorInput, 0) > 0) {
        payload.competitorRate = parseNumericInput(competitorInput, 0);
      }
      var editId = new URLSearchParams(location.search).get('id') || editQuoteId;
      if (editId) {
        var storeForQuote = getStore();
        var existing = storeForQuote ? storeForQuote.getQuote(editId) : null;
        if (existing) {
          if (existing.origin) payload.origin = existing.origin;
          if (existing.destination) payload.destination = existing.destination;
          if (existing.commodity) payload.commodity = existing.commodity;
          if (existing.channel) payload.channel = existing.channel;
          if (existing.portalSubmittedAt) payload.portalSubmittedAt = existing.portalSubmittedAt;
          if (existing.preferredService) payload.preferredService = existing.preferredService;
        }
      }
      return payload;
    }

    function refreshPriceDrivers(primary, svc) {
      if (cubeNote) {
        cubeNote.textContent = (primary.cube || 494) + ' cu ft · ' + svc.displayLabel +
          (primary.weightGroupLabel ? ' · v35 ' + primary.weightGroupLabel : '');
      }
      if (densityDisplay) {
        var store = getStore();
        var cust = store ? store.getCustomer(builderCustomerId) : null;
        densityDisplay.value = String(customerDensity(cust, svc.primaryService));
      }
      if (spotFuelInput) {
        if (!spotFuelInput.value && primary.fuelPct != null) {
          spotFuelInput.value = String(primary.fuelPct);
        }
      }
    }

    function refreshCompetitorDelta(total) {
      if (!competitorInput || !competitorDelta) return;
      var comp = parseNumericInput(competitorInput, 0);
      if (!comp) { competitorDelta.textContent = 'Enter competitor rate to compare'; return; }
      var delta = total - comp;
      var pct = comp ? Math.round((delta / comp) * 1000) / 10 : 0;
      competitorDelta.className = (delta >= 0 ? 'delta-negative' : 'delta-positive') + ' tabular';
      competitorDelta.textContent = (delta >= 0 ? '+' : '−') + formatMoney(Math.abs(delta)).replace('$', '$') + ' (' + Math.abs(pct) + '%)';
    }

    function refresh() {
      syncServiceUI();
      var q = builderQuote();
      var svc = resolveBuilderService(selectedFamily, selectedHdTier, builderCustomerId);
      var applied = previewAppliedTerms(q);
      renderAppliedTermsPanel(applied, appliedTermsMount);
      var fields = extractQuoteFieldsFromAdjustments(quoteAdjustments, applied);
      var primary = pricingWithQuoteModel(q, svc.primaryService, applied, quoteAdjustments);
      if (costLayersMount) costLayersMount.innerHTML = renderCostLayers(primary);
      if (totalHero) totalHero.textContent = primary.cfq ? 'CFQ' : formatMoney(primary.total);
      if (marginInline) marginInline.textContent = primary.cfq ? 'Manual quote' : primary.margin + '% margin';
      if (breakdownMount) breakdownMount.innerHTML = renderPricingBreakdown(primary, false, { weight: q.weight, ratePerLb: primary.ratePerLb });
      if (marginEl) marginEl.textContent = primary.margin + '%';
      refreshPriceDrivers(primary, svc);
      refreshCompetitorDelta(primary.total || 0);
      var govQuote = Object.assign({}, q, {
        appliedTerms: applied,
        quoteAdjustments: quoteAdjustments,
        customerDiscPct: fields.custDiscPct,
        quoteDiscPct: fields.quoteDiscPct,
        pricing: { margin: primary.margin }
      });
      var gov = needsApproval(fields.custDiscPct, fields.quoteDiscPct, primary.margin, govQuote);
      if (govBanner) {
        if (gov) {
          govBanner.hidden = false;
          govBanner.className = 'governance-banner amber';
          govBanner.innerHTML = '<strong>Approval required:</strong> ' + gov.msg;
        } else govBanner.hidden = true;
      }
      if (submitBtn) {
        submitBtn.textContent = gov ? 'Submit for Approval' : 'Generate Quote';
        submitBtn.className = gov ? 'btn btn-burgundy' : 'btn btn-primary';
        submitBtn.onclick = function () {
          saveBuilderQuote(gov ? 'pending' : 'approved');
        };
      }
      applyMarginGauge(document.querySelector('.margin-gauge-fill'), primary.margin);
      hydrateMarginFloorUI();
    }

    function saveBuilderQuote(status) {
      var store = getStore();
      if (!store) return;
      var quoteId = new URLSearchParams(location.search).get('id') || editQuoteId;
      var existing = quoteId ? store.getQuote(quoteId) : null;
      var q = builderQuote();
      var svc = resolveBuilderService(selectedFamily, selectedHdTier, builderCustomerId);
      var fields = extractQuoteFieldsFromAdjustments(quoteAdjustments, previewAppliedTerms(q));
      var snapshotTerms = quoteId && storedAppliedTerms
        ? storedAppliedTerms
        : buildAppliedTerms(q, storeAdapter());
      var payload = {
        quoteDiscPct: fields.quoteDiscPct,
        laneOverride: q.laneOverride,
        customerDiscPct: fields.custDiscPct,
        status: status,
        primaryService: svc.primaryService,
        tariffId: svc.tariffId,
        serviceFamily: selectedFamily,
        appliedTerms: JSON.parse(JSON.stringify(snapshotTerms)),
        quoteAdjustments: JSON.parse(JSON.stringify(quoteAdjustments)),
        pickupZip: q.pickupZip,
        deliveryZip: q.deliveryZip,
        weight: q.weight,
        cube: q.cube,
        declaredValue: q.declaredValue,
        customerId: q.customerId,
        originStation: q.originStation,
        pricingMode: q.pricingMode,
        origin: q.origin,
        destination: q.destination,
        commodity: q.commodity,
        channel: q.channel,
        portalSubmittedAt: q.portalSubmittedAt,
        preferredService: q.preferredService
      };
      if (q.spotBaseCwt != null) payload.spotBaseCwt = q.spotBaseCwt;
      if (q.spotFuelPct != null) payload.spotFuelPct = q.spotFuelPct;
      if (q.cfqManualBase != null) payload.cfqManualBase = q.cfqManualBase;
      if (q.cfqManualFuel != null) payload.cfqManualFuel = q.cfqManualFuel;
      if (q.competitorName) payload.competitorName = q.competitorName;
      if (q.competitorRate != null) payload.competitorRate = q.competitorRate;
      if (quoteId) {
        if (existing && existing.channel === 'portal') {
          payload.channel = 'portal';
          payload.portalSubmittedAt = existing.portalSubmittedAt;
          payload.preferredService = existing.preferredService || payload.preferredService;
        }
        store.updateQuote(quoteId, payload);
        store.clearAssistantPrefill();
        if (status === 'draft') {
          window.location.href = 'quotes.html';
        } else {
          window.location.href = (status === 'pending' ? 'quote-detail-pending.html' : 'quote-detail.html') + '?id=' + encodeURIComponent(quoteId);
        }
      } else {
        var prefill = store.getAssistantPrefill();
        if (prefill) Object.assign(payload, prefill);
        delete payload.id;
        var nq = store.createQuote(payload);
        store.clearAssistantPrefill();
        if (status === 'draft') {
          window.location.href = 'quotes.html';
        } else {
          window.location.href = (status === 'pending' ? 'quote-detail-pending.html' : 'quote-detail.html') + '?id=' + encodeURIComponent(nq.id);
        }
      }
    }

    if (calcToggle && calcDetail) {
      calcToggle.addEventListener('click', function () {
        calcDetail.hidden = !calcDetail.hidden;
        calcToggle.textContent = calcDetail.hidden ? 'Show line-item detail' : 'Hide line-item detail';
      });
    }

    syncServiceUI();

    var initStore = getStore();
    var initSrc = null;
    if (initStore) {
      initSrc = editQuoteId ? initStore.getQuote(editQuoteId) : initStore.getAssistantPrefill();
      if (initSrc && initSrc.customerId) builderCustomerId = initSrc.customerId;
      initQuoteAdjustments(initSrc);
      if (initSrc) {
        if (initSrc.primaryService && initSrc.primaryService !== 'b2b') {
          selectedFamily = 'home';
          selectedHdTier = resolveHdTierFromQuote(initSrc);
        } else if (initSrc.serviceFamily === 'home' || initSrc.serviceFamily === 'hd') {
          selectedFamily = 'home';
          selectedHdTier = resolveHdTierFromQuote(initSrc);
        }
        var famRadio = document.querySelector('[data-service-family][value="' + selectedFamily + '"]');
        if (famRadio) famRadio.checked = true;
        var tierRadio = document.querySelector('[data-hd-tier][value="' + selectedHdTier + '"]');
        if (tierRadio) tierRadio.checked = true;
        if (initSrc.pickupZip && pickupZipInput) pickupZipInput.value = String(initSrc.pickupZip);
        if (initSrc.deliveryZip && deliveryZipInput) deliveryZipInput.value = String(initSrc.deliveryZip);
        if (initSrc.weight != null && weightInput) weightInput.value = String(initSrc.weight);
        if (initSrc.cube != null && cubeInput) cubeInput.value = String(initSrc.cube);
        if (initSrc.declaredValue != null && declaredInput) declaredInput.value = String(initSrc.declaredValue);
        if (initSrc.pricingMode === 'spot') {
          var spotRadio = document.querySelector('[data-quote-type-toggle] input[value="spot"]');
          if (spotRadio) spotRadio.checked = true;
          if (initSrc.spotBaseCwt != null && spotBaseInput) spotBaseInput.value = String(initSrc.spotBaseCwt);
          if (initSrc.spotFuelPct != null && spotFuelInput) spotFuelInput.value = String(initSrc.spotFuelPct);
        }
        if (initSrc.competitorName && competitorNameInput) competitorNameInput.value = initSrc.competitorName;
        if (initSrc.competitorRate != null && competitorInput) competitorInput.value = String(initSrc.competitorRate);
        syncServiceUI();
      }
    } else {
      initQuoteAdjustments(null);
    }

    renderQuoteAdjustmentsEditor(quoteAdjustments, adjustmentsEditorMount, onAdjustmentsChange);

    bindNumericInput(weightInput, refresh);
    if (cubeInput) bindNumericInput(cubeInput, refresh);
    if (pickupZipInput) bindNumericInput(pickupZipInput, refresh);
    if (deliveryZipInput) bindNumericInput(deliveryZipInput, refresh);
    if (declaredInput) bindNumericInput(declaredInput, refresh);
    if (competitorInput) bindNumericInput(competitorInput, refresh);
    bindNumericInput(spotFuelInput, refresh);
    if (spotBaseInput) bindNumericInput(spotBaseInput, refresh);
    if (cfqBaseInput) bindNumericInput(cfqBaseInput, refresh);
    if (cfqFuelInput) bindNumericInput(cfqFuelInput, refresh);

    document.addEventListener('awest:quote-type-change', refresh);

    if (draftBtn && !draftBtn._draftWired) {
      draftBtn._draftWired = true;
      draftBtn.addEventListener('click', function (e) {
        e.preventDefault();
        saveBuilderQuote('draft');
      });
    }

    if (competitorNameInput && !competitorNameInput._wired) {
      competitorNameInput._wired = true;
      competitorNameInput.addEventListener('input', refresh);
      competitorNameInput.addEventListener('change', refresh);
    }

    refresh();
  }

  function initDashboardQuickApprove() {
    document.querySelectorAll('[data-dashboard-approve]').forEach(function (btn) {
      if (btn._crudWired) return;
      btn._crudWired = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var qid = btn.getAttribute('data-dashboard-approve');
        if (window.confirm('Approve ' + qid + '?')) { getStore().approveQuote(qid); location.reload(); }
      });
    });
    document.querySelectorAll('[data-dashboard-reject]').forEach(function (btn) {
      if (btn._crudWired) return;
      btn._crudWired = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var qid = btn.getAttribute('data-dashboard-reject');
        if (window.confirm('Reject ' + qid + '?')) { getStore().rejectQuote(qid); location.reload(); }
      });
    });
  }

  function initQuoteDetailApproval() {
    var panel = document.querySelector('[data-quote-detail-approval]');
    if (!panel) return;
    var qid = new URLSearchParams(location.search).get('id') || 'Q-2026-0847';
    panel.querySelectorAll('[data-detail-approve]').forEach(function (btn) {
      if (btn._crudWired) return;
      btn._crudWired = true;
      btn.addEventListener('click', function () {
        if (window.confirm('Approve this quote?')) {
          getStore().approveQuote(qid);
          location.href = 'quote-detail.html?id=' + encodeURIComponent(qid);
        }
      });
    });
    panel.querySelectorAll('[data-detail-reject]').forEach(function (btn) {
      if (btn._crudWired) return;
      btn._crudWired = true;
      btn.addEventListener('click', function () {
        var reason = window.prompt('Rejection reason:');
        if (reason != null) { getStore().rejectQuote(qid, reason); location.href = 'quote-builder.html'; }
      });
    });
  }

  function initQuoteDetailBreakdown() {
    document.querySelectorAll('[data-detail-breakdown]').forEach(function (mount) {
      var qid = mount.getAttribute('data-quote-id') || new URLSearchParams(location.search).get('id');
      var q = qid ? quoteFromStore(qid) : null;
      var p = q ? resolveQuotePricing(q) : basePreset(parseFloat(mount.getAttribute('data-quote-disc') || '0') || 0);
      mount.innerHTML = renderPricingBreakdown(p, false, q ? pricingMetaFromQuote(q) : {});
    });
    initTariffDetailDrawer();
  }

  var TARIFF_DRAWER_HOVER_GRACE = 280;

  function ensureTariffDetailDrawerVeil() {
    if (document.getElementById('tariff-detail-drawer-veil')) return;
    var veil = document.createElement('div');
    veil.id = 'tariff-detail-drawer-veil';
    veil.className = 'quote-pricing-drawer-veil';
    veil.setAttribute('aria-hidden', 'true');
    veil.innerHTML =
      '<aside class="quote-pricing-drawer" role="dialog" aria-labelledby="tariff-detail-drawer-title">' +
      '<div class="quote-pricing-drawer-head">' +
      '<div class="quote-pricing-drawer-head-text">' +
      '<h2 class="quote-pricing-drawer-title" id="tariff-detail-drawer-title">Tariff</h2>' +
      '<p class="quote-pricing-drawer-sub" data-tariff-drawer-meta></p>' +
      '</div>' +
      '<button type="button" class="quote-pricing-drawer-close" data-tariff-drawer-close aria-label="Close">✕</button>' +
      '</div>' +
      '<div class="quote-pricing-drawer-body" data-tariff-drawer-mount></div>' +
      '</aside>';
    document.body.appendChild(veil);
  }

  function renderTariffDrawerContent(tariffId) {
    var store = getStore();
    var t = store && tariffId ? store.getTariff(tariffId) : null;
    if (!t) {
      return '<p class="text-muted-sm">Tariff not found in session store.</p>';
    }
    var cfg = t.config || {};
    var uom = (t.uom || 'CWT').toUpperCase();
    var baseRateDisplay = cfg.baseRateCwt != null ? formatMoney(cfg.baseRateCwt) + ' / ' + uom : '—';
    var minChargeDisplay = cfg.minimumCharge != null ? formatMoney(cfg.minimumCharge) : '—';
    var marginFloor = cfg.marginFloorPct != null ? cfg.marginFloorPct : '—';
    var density = cfg.density != null ? cfg.density : null;
    var rules = cfg.baselineRules || [];
    var statusCls = t.status === 'active' ? 'active' : (t.status === 'draft' ? 'draft' : t.status);
    var rulesHtml = rules.length
      ? '<ul class="tariff-drawer-rules">' + rules.slice(0, 4).map(function (r) {
        return '<li><span class="badge badge-draft">' + r.type + '</span> ' +
          (r.scope || '—') + ' · ' + (r.value || '—') + '</li>';
      }).join('') + (rules.length > 4 ? '<li class="text-muted-sm">+' + (rules.length - 4) + ' more…</li>' : '') + '</ul>'
      : '<p class="text-muted-sm">No baseline rules on this tariff.</p>';

    return '<div class="tariff-drawer-summary">' +
      '<dl class="applied-terms-dl">' +
      '<div class="applied-terms-row"><dt>Status</dt><dd><span class="badge badge-' + statusCls + '">' + t.status + '</span></dd></div>' +
      '<div class="applied-terms-row"><dt>Type</dt><dd>' + (t.type || 'Base') + ' · ' + (t.service || '—') + '</dd></div>' +
      '<div class="applied-terms-row"><dt>Unit of measure</dt><dd class="tabular">' + uom + '</dd></div>' +
      '<div class="applied-terms-row"><dt>Base rate</dt><dd class="tabular">' + baseRateDisplay + '</dd></div>' +
      '<div class="applied-terms-row"><dt>Minimum charge</dt><dd class="tabular">' + minChargeDisplay + '</dd></div>' +
      '<div class="applied-terms-row"><dt>Margin floor</dt><dd class="tabular">' + marginFloor + '%</dd></div>' +
      (density != null ? '<div class="applied-terms-row"><dt>Density</dt><dd class="tabular">' + density + ' lbs/cu ft</dd></div>' : '') +
      (cfg.rateTableLabel ? '<div class="applied-terms-row"><dt>Rate table</dt><dd>' + cfg.rateTableLabel + '</dd></div>' : '') +
      '</dl>' +
      '<h4 class="tariff-drawer-section-title">Baseline rules</h4>' +
      rulesHtml +
      '<p class="text-muted-sm tariff-drawer-effective">Effective ' + (t.effectiveDate || '—') +
      (cfg.effectiveEnd ? ' – ' + cfg.effectiveEnd : '') + ' · v' + (t.version || 1) + '</p>' +
      '<a href="tariff-detail.html?id=' + encodeURIComponent(t.id) + '" class="btn btn-link btn-sm tariff-drawer-open-full">Open full tariff →</a>' +
      '</div>';
  }

  function initTariffDetailDrawer() {
    var page = (location.pathname.split('/').pop() || '').replace('.html', '');
    if (page !== 'quote-detail' && page !== 'quote-detail-pending') return;

    ensureTariffDetailDrawerVeil();
    var veil = document.getElementById('tariff-detail-drawer-veil');
    if (!veil || veil._tariffDrawerCtl) {
      if (veil && veil._tariffDrawerCtl) veil._tariffDrawerCtl.wireTriggers();
      return;
    }

    var titleEl = document.getElementById('tariff-detail-drawer-title');
    var metaEl = veil.querySelector('[data-tariff-drawer-meta]');
    var mount = veil.querySelector('[data-tariff-drawer-mount]');
    var drawer = veil.querySelector('.quote-pricing-drawer');
    var closeBtn = veil.querySelector('[data-tariff-drawer-close]');
    var activeId = null;
    var closeTimer = null;

    function renderDrawer(tariffId) {
      var store = getStore();
      var t = store ? store.getTariff(tariffId) : null;
      if (titleEl) titleEl.textContent = t ? t.id : tariffId;
      if (metaEl) {
        metaEl.textContent = t
          ? [t.name, t.service, 'v' + (t.version || 1)].filter(Boolean).join(' · ')
          : '';
      }
      if (mount) mount.innerHTML = renderTariffDrawerContent(tariffId);
    }

    function open(tariffId) {
      if (!tariffId) return;
      clearTimeout(closeTimer);
      activeId = tariffId;
      renderDrawer(tariffId);
      veil.classList.add('is-open');
      veil.setAttribute('aria-hidden', 'false');
    }

    function close() {
      clearTimeout(closeTimer);
      activeId = null;
      veil.classList.remove('is-open');
      veil.setAttribute('aria-hidden', 'true');
    }

    function scheduleClose() {
      clearTimeout(closeTimer);
      closeTimer = setTimeout(close, TARIFF_DRAWER_HOVER_GRACE);
    }

    function wireTriggers() {
      document.querySelectorAll('.quote-calc-detail [data-tariff-drawer-trigger]').forEach(function (link) {
        if (link._tariffDrawerWired) return;
        link._tariffDrawerWired = true;
        var tariffId = link.getAttribute('data-tariff-id') ||
          (function () {
            try { return new URL(link.href, location.href).searchParams.get('id'); } catch (e) { return null; }
          }());
        if (!tariffId) return;
        link.addEventListener('mouseenter', function () { open(tariffId); });
        link.addEventListener('mouseleave', scheduleClose);
        link.addEventListener('focus', function () { open(tariffId); });
        link.addEventListener('blur', function (e) {
          if (!drawer || !drawer.contains(e.relatedTarget)) scheduleClose();
        });
      });
    }

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (drawer) {
      drawer.addEventListener('mouseenter', function () { clearTimeout(closeTimer); });
      drawer.addEventListener('mouseleave', scheduleClose);
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && veil.classList.contains('is-open')) close();
    });

    veil._tariffDrawerCtl = { open: open, close: close, scheduleClose: scheduleClose, wireTriggers: wireTriggers };
    wireTriggers();
  }

  function initQuoteAssistant() {
    var root = document.getElementById('quote-assistant-root');
    if (!root) return;
    if (root._assistantWired) return;
    root._assistantWired = true;

    var thread = root.querySelector('.assistant-thread');
    var preview = root.querySelector('[data-assistant-preview]');
    var input = root.querySelector('[data-assistant-input]');
    var sendBtn = root.querySelector('[data-assistant-send]');

    var draft = null;
    var flow = null;
    var step = null;
    var openQuoteStep = false;

    var HD_TIER_CHIPS = [
      { label: 'Threshold', primaryService: 'threshold' },
      { label: 'WG No Inspection', primaryService: 'wgni' },
      { label: 'White Glove Inspection', primaryService: 'wgi' }
    ];

    function defaultDraft() {
      var store = getStore();
      var lane = store ? store.getState().settings.demoLane || {} : {};
      return {
        customerId: null,
        customerName: null,
        customerCode: null,
        serviceFamily: 'b2b',
        primaryService: 'b2b',
        tariffId: null,
        pickupZip: lane.pickupZip || '27260',
        deliveryZip: lane.deliveryZip || '29621',
        origin: 'High Point, NC',
        destination: 'Anderson, SC',
        originStation: lane.originStation || 'TMV',
        weight: lane.weight || 4200,
        cube: lane.cube || 494,
        declaredValue: 45000,
        commodity: 'FAK',
        quoteDiscPct: 0,
        laneOverride: 0,
        customerDiscOverride: null,
        liftGate: false,
        residential: false,
        extraMan: false,
        manualOverrideTotal: null
      };
    }

    function storeAdapter() {
      var store = getStore();
      return {
        getState: function () { return store.getState(); },
        getCustomer: function (id) { return store.getCustomer(id); }
      };
    }

    function scrollThread() {
      thread.scrollTop = thread.scrollHeight;
    }

    function addMsg(text, who) {
      var div = document.createElement('div');
      div.className = 'assistant-msg ' + who;
      div.innerHTML = text;
      thread.appendChild(div);
      scrollThread();
    }

    function addChoiceChips(choices, handler, opts) {
      opts = opts || {};
      var wrap = document.createElement('div');
      wrap.className = 'assistant-chips';
      choices.forEach(function (choice) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'assistant-chip' + (opts.recommended === choice.id ? ' assistant-chip--recommended' : '');
        b.textContent = choice.label;
        b.setAttribute('data-choice-id', choice.id);
        b.addEventListener('click', function () {
          wrap.querySelectorAll('.assistant-chip').forEach(function (c) { c.disabled = true; });
          handler(choice);
        });
        wrap.appendChild(b);
      });
      thread.appendChild(wrap);
      scrollThread();
    }

    function resolveDraftCustomer() {
      var store = getStore();
      if (store && draft && draft.customerId) {
        var c = store.getCustomer(draft.customerId);
        if (c) return c;
      }
      if (draft && draft.customerName) {
        return {
          id: draft.customerId,
          name: draft.customerName,
          code: draft.customerCode || draft.customerId
        };
      }
      return null;
    }

    function selectCustomer(customer) {
      draft.customerId = customer.id;
      draft.customerName = customer.name;
      draft.customerCode = customer.code || customer.id;
      if (customer.pickupLocation) {
        draft.origin = customer.pickupLocation.split(',')[0] || draft.origin;
        var zipMatch = customer.pickupLocation.match(/\b(\d{5})\b/);
        if (zipMatch) {
          draft.pickupZip = zipMatch[1];
          draft.originStation = resolveOriginStation(zipMatch[1]);
        }
      }
      advance('service', customer.name);
    }

    function addChips(labels, handler, opts) {
      opts = opts || {};
      var wrap = document.createElement('div');
      wrap.className = 'assistant-chips';
      labels.forEach(function (label) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'assistant-chip' + (opts.recommended === label ? ' assistant-chip--recommended' : '');
        b.textContent = label;
        b.addEventListener('click', function () {
          wrap.querySelectorAll('.assistant-chip').forEach(function (c) { c.disabled = true; });
          handler(label);
        });
        wrap.appendChild(b);
      });
      thread.appendChild(wrap);
      scrollThread();
    }

    function promptNumber(question, fallback, onSubmit) {
      addMsg(question, 'bot');
      var wrap = document.createElement('div');
      wrap.className = 'assistant-inline-form';
      var inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'tabular';
      inp.value = String(fallback != null ? fallback : '');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary btn-sm';
      btn.textContent = 'Continue';
      btn.addEventListener('click', function () {
        var v = parseFloat(inp.value);
        if (isNaN(v)) return;
        wrap.remove();
        addMsg(String(v), 'user');
        onSubmit(v);
      });
      wrap.appendChild(inp);
      wrap.appendChild(btn);
      thread.appendChild(wrap);
      scrollThread();
      inp.focus();
    }

    function promptText(question, fallback, onSubmit) {
      addMsg(question, 'bot');
      var wrap = document.createElement('div');
      wrap.className = 'assistant-inline-form';
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'tabular';
      inp.value = fallback || '';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary btn-sm';
      btn.textContent = 'Continue';
      btn.addEventListener('click', function () {
        var v = inp.value.trim();
        if (!v) return;
        wrap.remove();
        addMsg(v, 'user');
        onSubmit(v);
      });
      wrap.appendChild(inp);
      wrap.appendChild(btn);
      thread.appendChild(wrap);
      scrollThread();
      inp.focus();
    }

    function tariffMatchesService(tariff, primaryService) {
      var map = { b2b: 'B2B', threshold: 'Threshold', wgni: 'WGNI', wgi: 'WGI' };
      var want = map[primaryService] || 'B2B';
      return String(tariff.service || '').toUpperCase() === want.toUpperCase();
    }

    function tariffsForDraft() {
      var store = getStore();
      if (!store || !draft) return { options: [], suggestedId: null };
      var state = store.getState();
      var TE = getTariffEngine();
      var auto = TE
        ? TE.resolveAutoTariff(state, draft.customerId, draft.primaryService)
        : null;
      var suggestedId = auto ? auto.id : 'TAR-B2B-BASE';
      var base = (state.tariffs || []).filter(function (t) {
        return t.type === 'Base' && tariffMatchesService(t, draft.primaryService);
      });
      var customer = store.getCustomer(draft.customerId);
      var assigned = (customer && customer.tariffIds) ? customer.tariffIds : [];
      base.sort(function (a, b) {
        var aPref = assigned.indexOf(a.id) >= 0 ? 0 : 1;
        var bPref = assigned.indexOf(b.id) >= 0 ? 0 : 1;
        if (aPref !== bPref) return aPref - bPref;
        if (a.id === suggestedId) return -1;
        if (b.id === suggestedId) return 1;
        return String(a.name || a.id).localeCompare(String(b.name || b.id));
      });
      return { options: base, suggestedId: suggestedId };
    }

    function buildAdjustments() {
      var store = getStore();
      var customer = store ? store.getCustomer(draft.customerId) : null;
      var master = resolveCustomerDiscForService(customer, draft.primaryService);
      var ctx = {
        quoteDiscPct: draft.quoteDiscPct,
        laneOverride: draft.laneOverride,
        serviceFamily: draft.serviceFamily,
        primaryService: draft.primaryService,
        masterValue: master,
        customerDiscPct: draft.customerDiscOverride != null ? draft.customerDiscOverride : master
      };
      var adj = buildDefaultQuoteAdjustments(ctx);
      adj.forEach(function (layer) {
        if (layer.presetId === 'customer-disc-override' && draft.customerDiscOverride != null) {
          layer.enabled = Number(layer.value) !== master;
          layer.value = draft.customerDiscOverride;
          layer.masterValue = master;
        }
        if (layer.presetId === 'quote-discount') {
          layer.enabled = draft.quoteDiscPct > 0;
          layer.value = draft.quoteDiscPct;
        }
        if (layer.presetId === 'lane-override') {
          layer.enabled = draft.laneOverride > 0;
          layer.value = draft.laneOverride;
        }
        if (layer.presetId === 'lift-gate') layer.enabled = draft.liftGate;
        if (layer.presetId === 'residential') layer.enabled = draft.residential;
        if (layer.presetId === 'extra-man') layer.enabled = draft.extraMan;
      });
      return adj;
    }

    function buildDraftQuotePayload() {
      var q = {
        customerId: draft.customerId,
        primaryService: draft.primaryService,
        serviceFamily: draft.serviceFamily,
        tariffId: draft.tariffId,
        pickupZip: draft.pickupZip,
        deliveryZip: draft.deliveryZip,
        origin: draft.origin,
        destination: draft.destination,
        originStation: draft.originStation,
        weight: draft.weight,
        cube: draft.cube,
        declaredValue: draft.declaredValue,
        commodity: draft.commodity,
        quoteDiscPct: draft.quoteDiscPct,
        laneOverride: draft.laneOverride
      };
      var applied = buildAppliedTerms(q, storeAdapter());
      var draftCustomer = resolveDraftCustomer();
      if (draftCustomer) {
        applied.customerId = draftCustomer.id;
        applied.customerName = draftCustomer.name;
      }
      if (draft.tariffId) {
        var store = getStore();
        var t = store ? store.getTariff(draft.tariffId) : null;
        applied.tariffId = draft.tariffId;
        applied.tariffLabel = t ? t.name : draft.tariffId;
      }
      var adjustments = buildAdjustments();
      var pricing = pricingWithQuoteModel(q, draft.primaryService, applied, adjustments);
      var fields = extractQuoteFieldsFromAdjustments(adjustments, applied);
      return { q: q, applied: applied, adjustments: adjustments, pricing: pricing, fields: fields };
    }

    function refreshPreview() {
      if (!preview) return;
      if (!draft || !draft.customerId) {
        preview.innerHTML = '<p style="font-size:13px;color:var(--neutral-600)">Select a customer to begin.</p>';
        return;
      }
      var cust = resolveDraftCustomer();
      if (!draft.tariffId) {
        preview.innerHTML =
          '<div class="assistant-preview-meta">' +
          '<p><strong>' + (cust ? cust.name : draft.customerName || draft.customerId) + '</strong>' +
          (draft.customerCode ? ' · <span class="tabular">' + draft.customerCode + '</span>' : '') +
          '</p>' +
          '<p class="text-muted-sm">Select a base tariff to see live pricing.</p>' +
          '</div>';
        return;
      }
      var data = buildDraftQuotePayload();
      var p = data.pricing;
      if (draft.manualOverrideTotal != null && draft.manualOverrideTotal > 0) {
        p = applyManualOverrideDisplay(p, {
          total: draft.manualOverrideTotal,
          margin: marginFromManualTotal(p, draft.manualOverrideTotal),
          engineTotal: data.pricing.total,
          engineMargin: data.pricing.margin
        });
      }
      var store = getStore();
      var govQuote = Object.assign({}, data.q, {
        appliedTerms: data.applied,
        quoteAdjustments: data.adjustments,
        customerDiscPct: data.fields.custDiscPct,
        quoteDiscPct: data.fields.quoteDiscPct,
        pricing: { margin: p.margin }
      });
      var gov = needsApproval(data.fields.custDiscPct, data.fields.quoteDiscPct, p.margin, govQuote);
      var cust = resolveDraftCustomer();
      var tariff = store ? store.getTariff(draft.tariffId) : null;
      var marginNote = '<p style="font-size:13px;margin-top:var(--space-sm)"><strong>Margin:</strong> <span class="tabular">' + p.margin + '%</span>';
      if (p.overrideApplied) {
        marginNote += ' <span class="text-muted-sm">(engine ' + p.engineMargin + '%)</span>';
      }
      marginNote += '</p>';
      preview.innerHTML =
        '<div class="assistant-preview-meta">' +
        '<p><strong>' + (cust ? cust.name : draft.customerName || draft.customerId) + '</strong> · ' +
        (SERVICE_LABELS[draft.primaryService] || draft.primaryService) + '</p>' +
        '<p class="text-muted-sm">' + draft.tariffId + (tariff ? ' · ' + tariff.name : '') + '</p>' +
        (p.overrideApplied ? '<p class="inline-notice info" style="margin-top:var(--space-sm)"><strong>Manual override active</strong> — engine total ' + formatMoney(p.engineTotal) + ' → ' + formatMoney(p.total) + '</p>' : '') +
        '</div>' +
        renderStackedBar(p) +
        renderPricingBreakdown(p, false, { weight: draft.weight, ratePerLb: p.ratePerLb }) +
        marginNote +
        (gov ? '<p class="inline-notice amber" style="margin-top:var(--space-sm)"><strong>Approval required</strong> — ' + gov.msg + '</p>' : '');
    }

    function marginFromManualTotal(pricing, manualTotal) {
      if (!pricing || !(manualTotal > 0)) return 0;
      var netLh = pricing.stack && pricing.stack.linehaul != null ? pricing.stack.linehaul : pricing.linehaul;
      var access = (pricing.insurance || 0) + (pricing.lift || 0) + (pricing.residential || 0);
      return computeMargin(netLh, pricing.fuel || 0, access, manualTotal, pricing.quoteDiscPct || 0);
    }

    function finishAssistantSave(result, options) {
      options = options || {};
      if (!result) return false;
      flow = null;
      step = 'done';
      var detailPage = result.gov ? 'quote-detail-pending.html' : 'quote-detail.html';
      var msg =
        'Quote <strong><a href="' + detailPage + '?id=' + encodeURIComponent(result.quote.id) + '">' + result.quote.id + '</a></strong> saved';
      if (options.overrideTotal != null) {
        var ovMargin = result.quote.pricingOverride ? result.quote.pricingOverride.margin : result.quote.pricing.margin;
        msg += ' with manual total <strong class="tabular">' + formatMoney(options.overrideTotal) + '</strong>';
        msg += ' @ <strong class="tabular">' + ovMargin + '%</strong> margin';
        if (options.engineMargin != null) {
          msg += ' (adjusted from ' + options.engineMargin + '%)';
        }
      }
      msg += result.gov ? ' — submitted for manager approval.' : ' — approved and ready to send.';
      addMsg(msg, 'bot');
      addChips(['View quote', 'Create another quote'], function (label) {
        addMsg(label, 'user');
        if (label.indexOf('View') === 0) {
          location.href = detailPage + '?id=' + encodeURIComponent(result.quote.id);
        } else {
          draft = defaultDraft();
          flow = 'create';
          advance('customer');
        }
      });
      return true;
    }

    function saveDraftQuote(overrideTotal) {
      var store = getStore();
      if (!store || !draft.customerId || !draft.tariffId) return null;
      var data = buildDraftQuotePayload();
      var engineMargin = data.pricing.margin;
      var govQuote = Object.assign({}, data.q, {
        appliedTerms: data.applied,
        quoteAdjustments: data.adjustments,
        customerDiscPct: data.fields.custDiscPct,
        quoteDiscPct: data.fields.quoteDiscPct,
        pricing: { margin: data.pricing.margin }
      });
      var payload = Object.assign({}, data.q, {
        tariffId: draft.tariffId,
        appliedTerms: JSON.parse(JSON.stringify(data.applied)),
        quoteAdjustments: JSON.parse(JSON.stringify(data.adjustments)),
        customerDiscPct: data.fields.custDiscPct,
        quoteDiscPct: data.fields.quoteDiscPct,
        laneOverride: data.fields.laneOverride,
        status: 'draft'
      });
      if (overrideTotal != null && overrideTotal > 0) {
        var adjustedMargin = marginFromManualTotal(data.pricing, overrideTotal);
        payload.pricingMode = 'override';
        payload.pricingOverride = {
          total: overrideTotal,
          margin: adjustedMargin,
          engineTotal: data.pricing.total,
          engineMargin: engineMargin
        };
        govQuote.pricing = { margin: adjustedMargin };
      }
      var gov = needsApproval(data.fields.custDiscPct, data.fields.quoteDiscPct, govQuote.pricing.margin, govQuote);
      payload.status = gov ? 'pending' : 'approved';
      var quote = store.createQuote(payload);
      return { quote: quote, gov: gov, engineMargin: engineMargin };
    }

    function advance(nextStep, userText) {
      if (userText) addMsg(userText, 'user');
      step = nextStep;
      window.setTimeout(runStep, 0);
    }

    function runStep() {
      if (!draft || !step || flow !== 'create') return;
      try {
        refreshPreview();

      if (step === 'customer') {
        var store = getStore();
        var customers = store ? store.getState().customers.filter(function (c) { return c.status === 'active'; }) : [];
        if (!customers.length) {
          addMsg('No active customers in the demo store.', 'bot');
          return;
        }
        addMsg('Which customer is this quote for?', 'bot');
        addChoiceChips(customers.map(function (c) {
          return {
            id: c.id,
            label: c.name + ' · ' + c.code,
            customer: c
          };
        }), function (choice) {
          selectCustomer(choice.customer);
        });
        return;
      }

      if (step === 'service') {
        if (draft.customerName) {
          addMsg('Quoting for <strong>' + draft.customerName + '</strong>' +
            (draft.customerCode ? ' (<span class="tabular">' + draft.customerCode + '</span>)' : '') + '.', 'bot');
        }
        addMsg('What service type are you quoting?', 'bot');
        addChips(['B2B', 'Home Transport'], function (svc) {
          if (svc === 'Home Transport') {
            draft.serviceFamily = 'home';
            advance('hd-tier', svc);
          } else {
            draft.serviceFamily = 'b2b';
            draft.primaryService = 'b2b';
            advance('tariff', svc);
          }
        });
        return;
      }

      if (step === 'hd-tier') {
        addMsg('Which Home Transport level?', 'bot');
        addChips(HD_TIER_CHIPS.map(function (t) { return t.label; }), function (tierLabel) {
          var tier = HD_TIER_CHIPS.find(function (t) { return t.label === tierLabel; }) || HD_TIER_CHIPS[0];
          draft.primaryService = tier.primaryService;
          advance('tariff', tierLabel);
        });
        return;
      }

      if (step === 'tariff') {
        var tariffInfo = tariffsForDraft();
        if (!tariffInfo.options.length) {
          addMsg('No base tariffs found for this service — using auto-resolved default.', 'bot');
          draft.tariffId = tariffInfo.suggestedId || 'TAR-B2B-BASE';
          advance('lane');
          return;
        }
        addMsg('Select the <strong>base tariff</strong> for this quote. Assigned tariffs are listed first.', 'bot');
        var labels = tariffInfo.options.map(function (t) {
          var tag = t.id === tariffInfo.suggestedId ? ' ★ suggested' : '';
          return t.id + tag;
        });
        addChips(labels, function (label) {
          var id = label.replace(/\s★ suggested$/, '');
          draft.tariffId = id;
          advance('lane', id);
        }, { recommended: (tariffInfo.suggestedId ? tariffInfo.suggestedId + ' ★ suggested' : null) });
        return;
      }

      if (step === 'lane') {
        addMsg('Confirm the lane (pickup → delivery ZIP).', 'bot');
        addChips(['TMV → Anderson SC (27260 → 29621)', 'Enter custom ZIPs'], function (choice) {
          if (choice.indexOf('custom') >= 0) {
            advance('lane-custom', choice);
          } else {
            draft.pickupZip = '27260';
            draft.deliveryZip = '29621';
            draft.origin = 'High Point, NC';
            draft.destination = 'Anderson, SC';
            draft.originStation = 'TMV';
            advance('weight', choice);
          }
        });
        return;
      }

      if (step === 'lane-custom') {
        promptText('Pickup ZIP:', draft.pickupZip, function (pickup) {
          draft.pickupZip = pickup;
          draft.originStation = resolveOriginStation(pickup);
          promptText('Delivery ZIP:', draft.deliveryZip, function (delivery) {
            draft.deliveryZip = delivery;
            advance('weight');
          });
        });
        return;
      }

      if (step === 'weight') {
        addMsg('Shipment weight (lbs)?', 'bot');
        addChips(['2,800', '4,200', 'Custom weight'], function (choice) {
          if (choice.indexOf('Custom') >= 0) {
            promptNumber('Enter weight in lbs:', draft.weight, function (w) {
              draft.weight = w;
              advance('cube');
            });
          } else {
            draft.weight = parseInt(choice.replace(/,/g, ''), 10);
            advance('cube', choice);
          }
        });
        return;
      }

      if (step === 'cube') {
        addMsg('Shipment cube (cu ft)?', 'bot');
        addChips(['320', '494', 'Custom cube'], function (choice) {
          if (choice.indexOf('Custom') >= 0) {
            promptNumber('Enter cube in cu ft:', draft.cube, function (c) {
              draft.cube = c;
              advance('declared');
            });
          } else {
            draft.cube = parseInt(choice, 10);
            advance('declared', choice);
          }
        });
        return;
      }

      if (step === 'declared') {
        addMsg('Declared value ($)?', 'bot');
        addChips(['25,000', '45,000', 'Custom value'], function (choice) {
          if (choice.indexOf('Custom') >= 0) {
            promptNumber('Enter declared value ($):', draft.declaredValue, function (dv) {
              draft.declaredValue = dv;
              advance('commodity');
            });
          } else {
            draft.declaredValue = parseInt(choice.replace(/,/g, ''), 10);
            advance('commodity', choice);
          }
        });
        return;
      }

      if (step === 'commodity') {
        addMsg('Commodity type?', 'bot');
        addChips(['FAK', 'Case Goods', 'Upholstery'], function (commodity) {
          draft.commodity = commodity === 'Case Goods' ? 'CAS' : (commodity === 'Upholstery' ? 'UPH' : 'FAK');
          advance('quote-disc', commodity);
        });
        return;
      }

      if (step === 'quote-disc') {
        addMsg('Any <strong>quote-level discount</strong> (% off linehaul, after customer discount)?', 'bot');
        addChips(['None (0%)', '3%', '5%', '7%', 'Custom %'], function (choice) {
          if (choice.indexOf('Custom') >= 0) {
            promptNumber('Quote discount %:', 0, function (pct) {
              draft.quoteDiscPct = pct;
              advance('lane-override');
            });
          } else if (choice.indexOf('None') >= 0) {
            draft.quoteDiscPct = 0;
            advance('lane-override', choice);
          } else {
            draft.quoteDiscPct = parseFloat(choice);
            advance('lane-override', choice);
          }
        });
        return;
      }

      if (step === 'lane-override') {
        addMsg('Any <strong>lane override</strong> (flat $ added to net linehaul)?', 'bot');
        addChips(['None ($0)', '$45', 'Custom $'], function (choice) {
          if (choice.indexOf('Custom') >= 0) {
            promptNumber('Lane override ($):', 0, function (amt) {
              draft.laneOverride = amt;
              advance('customer-disc');
            });
          } else if (choice.indexOf('None') >= 0) {
            draft.laneOverride = 0;
            advance('customer-disc', choice);
          } else {
            draft.laneOverride = parseFloat(choice.replace(/[$,]/g, ''));
            advance('customer-disc', choice);
          }
        });
        return;
      }

      if (step === 'customer-disc') {
        var storeDisc = getStore();
        var customer = storeDisc ? storeDisc.getCustomer(draft.customerId) : null;
        var master = resolveCustomerDiscForService(customer, draft.primaryService);
        addMsg('Customer discount: use master (<strong>' + master + '%</strong>) or override for this quote only? Overrides route for approval.', 'bot');
        addChips(['Use customer master (' + master + '%)', 'Override discount'], function (choice) {
          if (choice.indexOf('Override') >= 0) {
            promptNumber('Override customer discount %:', master, function (pct) {
              draft.customerDiscOverride = pct;
              advance('lift-gate');
            });
          } else {
            draft.customerDiscOverride = null;
            advance('lift-gate', choice);
          }
        });
        return;
      }

      if (step === 'lift-gate') {
        addMsg('Add <strong>lift gate</strong> accessorial?', 'bot');
        addChips(['No', 'Yes'], function (choice) {
          draft.liftGate = choice === 'Yes';
          advance('residential', choice);
        });
        return;
      }

      if (step === 'residential') {
        addMsg('Add <strong>residential delivery</strong> surcharge?', 'bot');
        addChips(['No', 'Yes'], function (choice) {
          draft.residential = choice === 'Yes';
          advance('extra-man', choice);
        });
        return;
      }

      if (step === 'extra-man') {
        addMsg('Add <strong>extra man</strong> accessorial?', 'bot');
        addChips(['No', 'Yes'], function (choice) {
          draft.extraMan = choice === 'Yes';
          advance('review', choice);
        });
        return;
      }

      if (step === 'review') {
        var data = buildDraftQuotePayload();
        var storeReview = getStore();
        var cust = resolveDraftCustomer();
        var tariff = storeReview ? storeReview.getTariff(draft.tariffId) : null;
        addMsg(
          '<strong>Review</strong><br>' +
          (cust ? cust.name : draft.customerName || draft.customerId) +
          (draft.customerCode ? ' (<span class="tabular">' + draft.customerCode + '</span>)' : '') +
          ' · ' + (SERVICE_LABELS[draft.primaryService] || draft.primaryService) + '<br>' +
          'Tariff: ' + draft.tariffId + (tariff ? ' (' + tariff.name + ')' : '') + '<br>' +
          draft.pickupZip + ' → ' + draft.deliveryZip + ' · ' + draft.weight.toLocaleString() + ' lbs · ' + draft.cube + ' cf<br>' +
          'Declared value: ' + formatMoney(draft.declaredValue) + ' · Commodity: ' + draft.commodity + '<br>' +
          'Quote disc: ' + draft.quoteDiscPct + '% · Lane override: ' + formatMoney(draft.laneOverride) +
          (draft.customerDiscOverride != null ? '<br>Customer disc override: ' + draft.customerDiscOverride + '%' : '') +
          (draft.liftGate || draft.residential || draft.extraMan
            ? '<br>Accessorials: ' + [draft.liftGate ? 'Lift gate' : '', draft.residential ? 'Residential' : '', draft.extraMan ? 'Extra man' : ''].filter(Boolean).join(', ')
            : '') +
          '<br><strong>Total: ' + formatMoney(data.pricing.total) + '</strong> · Margin ' + data.pricing.margin + '%',
          'bot'
        );
        var wrap = document.createElement('div');
        wrap.className = 'assistant-chips assistant-action-row';
        var genBtn = document.createElement('button');
        genBtn.type = 'button';
        genBtn.className = 'btn btn-primary';
        genBtn.textContent = 'Generate & save quote';
        genBtn.addEventListener('click', function () {
          genBtn.disabled = true;
          draft.manualOverrideTotal = null;
          if (wrap.querySelector('[data-assistant-override-form]')) {
            wrap.querySelector('[data-assistant-override-form]').remove();
          }
          refreshPreview();
          var result = saveDraftQuote();
          if (!finishAssistantSave(result)) {
            addMsg('Could not save — check customer and tariff.', 'bot');
            genBtn.disabled = false;
          }
        });
        var overrideBtn = document.createElement('button');
        overrideBtn.type = 'button';
        overrideBtn.className = 'btn btn-secondary';
        overrideBtn.textContent = 'Manual override';
        overrideBtn.addEventListener('click', function () {
          if (thread.querySelector('[data-assistant-override-form]')) return;
          genBtn.disabled = true;
          overrideBtn.disabled = true;
          var engineData = buildDraftQuotePayload();
          var engineTotal = engineData.pricing.total;
          var engineMargin = engineData.pricing.margin;
          var formWrap = document.createElement('div');
          formWrap.className = 'assistant-inline-form assistant-override-form';
          formWrap.setAttribute('data-assistant-override-form', '');
          var label = document.createElement('label');
          label.textContent = 'Target quote total ($)';
          var inp = document.createElement('input');
          inp.type = 'number';
          inp.className = 'tabular';
          inp.min = '0';
          inp.step = '0.01';
          inp.value = String(Math.round(engineTotal * 100) / 100);
          var marginHint = document.createElement('p');
          marginHint.className = 'text-muted-sm';
          marginHint.style.margin = '0';
          function syncMarginHint() {
            var t = parseFloat(inp.value);
            if (isNaN(t) || t <= 0) {
              marginHint.textContent = 'Enter a valid total.';
              draft.manualOverrideTotal = null;
              refreshPreview();
              return;
            }
            draft.manualOverrideTotal = t;
            refreshPreview();
            var adj = marginFromManualTotal(engineData.pricing, t);
            var delta = Math.round((t - engineTotal) * 100) / 100;
            marginHint.innerHTML =
              'Engine: <span class="tabular">' + formatMoney(engineTotal) + '</span> @ ' + engineMargin + '% margin → ' +
              'Override: <strong class="tabular">' + formatMoney(t) + '</strong> @ <strong class="tabular">' + adj + '%</strong> margin' +
              (delta !== 0 ? ' (' + (delta > 0 ? '+' : '−') + formatMoney(Math.abs(delta)) + ')' : '');
          }
          inp.addEventListener('input', syncMarginHint);
          draft.manualOverrideTotal = parseFloat(inp.value);
          syncMarginHint();
          var actions = document.createElement('div');
          actions.className = 'assistant-override-actions';
          var saveBtn = document.createElement('button');
          saveBtn.type = 'button';
          saveBtn.className = 'btn btn-primary btn-sm';
          saveBtn.textContent = 'Save with override';
          saveBtn.addEventListener('click', function () {
            var t = parseFloat(inp.value);
            if (isNaN(t) || t <= 0) return;
            saveBtn.disabled = true;
            var result = saveDraftQuote(t);
            if (!finishAssistantSave(result, { overrideTotal: t, engineMargin: engineMargin })) {
              addMsg('Could not save — check customer and tariff.', 'bot');
              saveBtn.disabled = false;
              return;
            }
            formWrap.remove();
          });
          var cancelBtn = document.createElement('button');
          cancelBtn.type = 'button';
          cancelBtn.className = 'btn btn-secondary btn-sm';
          cancelBtn.textContent = 'Cancel';
          cancelBtn.addEventListener('click', function () {
            formWrap.remove();
            draft.manualOverrideTotal = null;
            refreshPreview();
            genBtn.disabled = false;
            overrideBtn.disabled = false;
          });
          actions.appendChild(saveBtn);
          actions.appendChild(cancelBtn);
          formWrap.appendChild(label);
          formWrap.appendChild(inp);
          formWrap.appendChild(marginHint);
          formWrap.appendChild(actions);
          thread.appendChild(formWrap);
          scrollThread();
          inp.focus();
          inp.select();
        });
        wrap.appendChild(genBtn);
        wrap.appendChild(overrideBtn);
        thread.appendChild(wrap);
        scrollThread();
        return;
      }
      } catch (err) {
        console.error('Assistant step error:', step, err);
        addMsg('Something went wrong on this step — try refreshing or use <a href="quote-builder.html">Quote Builder</a>.', 'bot');
      }
    }

    function startCreateFlow() {
      draft = defaultDraft();
      flow = 'create';
      step = 'customer';
      runStep();
    }

    function handleInput() {
      var val = (input && input.value.trim()) || '';
      if (!val) return;
      addMsg(val, 'user');
      input.value = '';

      if (openQuoteStep) {
        var qid = val.match(/Q-\d{4}-\d+/);
        var id = qid ? qid[0] : val;
        var store = getStore();
        var q = store ? store.getQuote(id) : null;
        if (q) {
          var page = q.status === 'pending' ? 'quote-detail-pending.html' : 'quote-detail.html';
          addMsg('Opening <a href="' + page + '?id=' + encodeURIComponent(id) + '">' + id + '</a>…', 'bot');
        } else {
          addMsg('Quote not found — try Q-2026-0823 or pick from the list.', 'bot');
        }
        openQuoteStep = false;
        return;
      }

      if (/^create/i.test(val)) {
        startCreateFlow();
        return;
      }

      addMsg('Use the quick replies above, or say "create quote" to start a new quote.', 'bot');
    }

    addMsg('<strong>How can I help?</strong> I can walk you through full quote creation — customer, base tariff, shipment, and rep adjustments — then save the quote.', 'bot');
    addChips(['Create a new quote', 'Open an existing quote', 'Explain pricing for a lane', 'Check pending approvals'], function (label) {
      addMsg(label, 'user');
      if (label.indexOf('Create') === 0) {
        startCreateFlow();
      } else if (label.indexOf('Open') === 0) {
        openQuoteStep = true;
        addMsg('Enter a quote number (e.g. Q-2026-0823):', 'bot');
      } else if (label.indexOf('Explain') === 0) {
        if (preview) preview.innerHTML = renderPricingBreakdown(basePreset(0), false);
        addMsg('Demo lane uses fictional v35 weight breaks (TMV → SC). Minimum charge enforced when linehaul is below the floor. Fuel on net linehaul; insurance 1% DV ($25 min).', 'bot');
      } else {
        var store = getStore();
        var pending = store ? store.getState().quotes.filter(function (q) { return q.status === 'pending'; }).length : 0;
        addMsg(pending + ' quote' + (pending === 1 ? '' : 's') + ' pending approval. <a href="dashboard.html">Open dashboard queue</a>.', 'bot');
      }
    });

    if (sendBtn) sendBtn.addEventListener('click', handleInput);
    if (input) input.addEventListener('keydown', function (e) { if (e.key === 'Enter') handleInput(); });
  }

  window.AwestPricingMock = {
    getPricingConfig: getPricingConfig,
    computeInsurance: computeInsurance,
    computePortalTier: computePortalTier,
    formatAccessorialRate: formatAccessorialRate,
    resolveQuotePricing: resolveQuotePricing,
    hydrateMarginFloorUI: hydrateMarginFloorUI,
    applyMarginGauge: applyMarginGauge,
    marginFloorFromStore: marginFloorFromStore,
    recomputePricingMargin: recomputePricingMargin,
    weightGroup: weightGroup,
    resolveOriginStation: resolveOriginStation,
    resolveB2bZone: resolveB2bZone,
    resolveHdPoi: resolveHdPoi,
    enginePricing: enginePricing,
    renderCostLayers: renderCostLayers,
    renderAdjustmentLayerEditor: renderAdjustmentLayerEditor,
    resolveTariffId: resolveTariffId,
    resolveAutoTariff: function (state, customerId, serviceType) {
      var TE = getTariffEngine();
      return TE ? TE.resolveAutoTariff(state, customerId, serviceType) : null;
    },
    resolveBuilderService: resolveBuilderService,
    buildDefaultAdjustmentLayers: buildDefaultAdjustmentLayers,
    buildDefaultQuoteAdjustments: buildDefaultQuoteAdjustments,
    buildAppliedTerms: buildAppliedTerms,
    ensureQuotePricingModel: ensureQuotePricingModel,
    syncQuoteFlatFields: syncQuoteFlatFields,
    extractQuoteFieldsFromAdjustments: extractQuoteFieldsFromAdjustments,
    extractQuoteFieldsFromLayers: extractQuoteFieldsFromLayers,
    getEffectiveCustomerDisc: getEffectiveCustomerDisc,
    hasCustomerDiscException: hasCustomerDiscException,
    resolveCustomerDiscForService: resolveCustomerDiscForService,
    pricingWithQuoteModel: pricingWithQuoteModel,
    renderAppliedTermsPanel: renderAppliedTermsPanel,
    renderQuoteAdjustmentsEditor: renderQuoteAdjustmentsEditor,
    pricingWithLayers: pricingWithLayers,
    addCustomLayer: addCustomLayer,
    getAdjustmentLayerPresets: getAdjustmentLayerPresets,
    quoteAllServices: quoteAllServices,
    SERVICE_TYPES: SERVICE_TYPES,
    SERVICE_LABELS: SERVICE_LABELS,
    SERVICE_FAMILIES: SERVICE_FAMILIES,
    HD_TARIFFS: HD_TARIFFS,
    STANDARD_LANE_TOTAL: basePreset(0).total,
    formatMoney: formatMoney,
    formatPct: formatPct,
    parseNumericInput: parseNumericInput,
    ensurePresetDatalists: ensurePresetDatalists,
    bindNumericInput: bindNumericInput,
    basePreset: basePreset,
    quotePricing: quotePricing,
    quotePricingCompute: quotePricingCompute,
    applyManualOverrideDisplay: applyManualOverrideDisplay,
    pricingMetaFromQuote: pricingMetaFromQuote,
    renderPricingBreakdown: renderPricingBreakdown,
    renderStackedBar: renderStackedBar,
    renderLifecycleStrip: renderLifecycleStrip,
    initQuotesListEnhanced: initQuotesListEnhanced,
    initQuoteBuilderPricing: initQuoteBuilderPricing,
    initDashboardQuickApprove: initDashboardQuickApprove,
    initQuoteDetailApproval: initQuoteDetailApproval,
    initQuoteDetailBreakdown: initQuoteDetailBreakdown,
    initTariffDetailDrawer: initTariffDetailDrawer,
    initQuoteAssistant: initQuoteAssistant
  };
})();
