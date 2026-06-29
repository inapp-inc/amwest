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

  function lookupB2bRate(origin, zoneKey, wg) {
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

  function lookupHdRate(service, origin, poi, bppc) {
    var ref = getRef();
    var rows = (ref.rateMatrix && ref.rateMatrix[service]) || [];
    return rows.find(function (r) {
      return r.origin === origin && (r.poi === poi || r.bppc === bppc);
    });
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
    return hit && hit.density ? parseFloat(hit.density) : DEFAULT_DENSITY;
  }

  function computeMargin(netLinehaul, fuel, access, total, quoteDiscPct) {
    var revenue = total;
    if (revenue <= 0) return 0;
    var costBase = netLinehaul / (1 + (quoteDiscPct || 0) / 200);
    var cost = costBase * 0.72 + fuel * 0.85 + access * 0.9;
    return Math.round(((revenue - cost) / revenue) * 1000) / 10;
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

  function enginePricing(q, serviceType) {
    serviceType = serviceType || q.primaryService || 'b2b';
    var store = getStore();
    var customer = store && q.customerId ? store.getCustomer(q.customerId) : null;
    var pickupZip = q.pickupZip || '27260';
    var deliveryZip = q.deliveryZip || '29621';
    var weight = Number(q.weight) || 4200;
    var cube = Number(q.cube) || 494;
    var acc = accessorialRates();
    var ins = computeInsurance(q.declaredValue, customer);
    var fuelPct = customer && customer.fixedFuelPct != null ? customer.fixedFuelPct : latestFuelPct();
    var custDiscPct = q.customerDiscPct != null ? q.customerDiscPct : serviceDiscountPct(customer, serviceType);
    var quoteDiscPct = q.quoteDiscPct || 0;
    var laneOverride = q.laneOverride || 0;
    var originStation = q.originStation || resolveOriginStation(pickupZip);

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
      var row = lookupB2bRate(originStation, zone.zoneKey, wg);
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
      return buildPricingResult({
        serviceType: 'b2b', linehaul: linehaul, minimum: row.minimum, minimumApplied: minApplied,
        ratePerLb: row.ratePerLb, weight: weight, cube: cube, weightGroup: wg,
        weightGroupLabel: weightGroupLabel(wg), originStation: originStation, zoneKey: zone.zoneKey,
        custDiscPct: custDiscPct, quoteDiscPct: quoteDiscPct, laneOverride: laneOverride,
        fuelPct: fuelPct, insurance: ins, lift: acc.lift, residential: acc.residential,
        laneLabel: originStation + ' → ' + zone.zoneKey + ' · v35 grp ' + wg
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
    var hdRow = lookupHdRate(serviceType, originStation, hd.poi, hd.bppc);
    if (!hdRow) {
      return buildPricingResult({
        serviceType: serviceType, cfq: true, weight: weight, cube: cube,
        custDiscPct: custDiscPct, quoteDiscPct: quoteDiscPct, laneOverride: laneOverride,
        fuelPct: fuelPct, insurance: ins, lift: acc.lift, residential: acc.residential,
        originStation: originStation, poi: hd.poi, bppc: hd.bppc,
        laneLabel: 'No HD rate — CFQ'
      });
    }
    var density = customerDensity(customer, serviceType);
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
    return buildPricingResult({
      serviceType: serviceType, linehaul: hdLinehaul, minimum: hdRow.minimum, minimumApplied: hdMinApplied,
      ratePerLb: hdRow.ratePerLb, ratePerCube: hdRow.ratePerCube, weight: weight, cube: cube,
      originStation: originStation, poi: hd.poi || hdRow.poi, bppc: hd.bppc || hdRow.bppc,
      custDiscPct: custDiscPct, quoteDiscPct: quoteDiscPct, laneOverride: laneOverride,
      fuelPct: fuelPct, insurance: ins, lift: acc.lift, residential: acc.residential,
      laneLabel: originStation + ' · ' + (hd.poi || hdRow.poi) + ' (BPPC ' + (hd.bppc || hdRow.bppc) + ')'
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
    var p = quotePricing(q);
    return { weight: q.weight || p.weight, ratePerLb: p.ratePerLb, cube: q.cube || p.cube };
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

  function bindNumericInput(el, handler) {
    if (!el) return;
    var run = function () { handler(parseNumericInput(el)); };
    el.addEventListener('change', run);
    el.addEventListener('input', run);
  }

  var LIFECYCLE = ['draft', 'pending', 'approved', 'sent', 'accepted', 'converted'];
  var LIFECYCLE_LABELS = {
    draft: 'Draft', pending: 'Pending', approved: 'Approved',
    sent: 'Sent', accepted: 'Accepted', converted: 'Booked', lost: 'Lost'
  };

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

  function quotePricing(q, serviceType) {
    if (!q) return basePreset(0);
    if (q.pricingMode === 'override' && q.pricingOverride) {
      var po = q.pricingOverride;
      return {
        linehaul: 0, custDiscPct: q.customerDiscPct, custDiscAmt: 0,
        quoteDiscPct: q.quoteDiscPct || 0, quoteDiscAmt: 0,
        lane: q.laneOverride || 0, fuel: 0, fuelPct: latestFuelPct(),
        insurance: 0, lift: 0, residential: 0,
        total: po.total, margin: po.margin,
        stack: { linehaul: po.total * 0.6, fuel: po.total * 0.25, access: po.total * 0.15, disc: 0 },
        personalized: (q.quoteDiscPct || 0) > 0
      };
    }
    if (q.pricing && q.pricing.total != null && !serviceType) return q.pricing;
    if (q.quoteAdjustments && q.quoteAdjustments.length) {
      return pricingWithLayers(q, serviceType || q.primaryService || 'b2b', q.quoteAdjustments);
    }
    if (q.adjustmentLayers && q.adjustmentLayers.length) {
      return pricingWithLayers(q, serviceType || q.primaryService || 'b2b', q.adjustmentLayers);
    }
    return enginePricing(q, serviceType || q.primaryService || 'b2b');
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
    var tariff = (s.tariffs || []).find(function (t) { return t.id === quote.tariffId; });
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
      tariffId: quote.tariffId,
      tariffLabel: tariff ? tariff.name : quote.tariffId,
      fuelPct: fuelRow ? fuelRow.pct : (s.settings.demoLane && s.settings.demoLane.fuelPct) || 28.4,
      fuelSource: fuelRow ? fuelRow.source : 'National index',
      insuranceRule: '1% DV · $25 min',
      density: sd ? sd.density : null,
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
    return p;
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
    return p;
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
    return p;
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

  function resolveBuilderService(family, hdTier) {
    if (family === 'home') {
      var hd = HD_TARIFFS[hdTier || 'threshold'] || HD_TARIFFS.threshold;
      return { primaryService: hd.service, tariffId: hd.tariffId, tariffLabel: hd.tariffLabel, displayLabel: 'Home Transport · ' + SERVICE_LABELS[hd.service] };
    }
    return { primaryService: 'b2b', tariffId: SERVICE_FAMILIES.b2b.tariffId, tariffLabel: SERVICE_FAMILIES.b2b.tariffLabel, displayLabel: 'B2B' };
  }

  function renderLifecycleStrip(status) {
    var lost = status === 'lost';
    var steps = lost ? ['draft', 'pending', 'lost'] : LIFECYCLE.slice(0, 5);
    var idx = steps.indexOf(status);
    if (status === 'converted') idx = 5;
    var html = '<div class="quote-lifecycle-strip">';
    steps.forEach(function (st, i) {
      var cls = 'quote-lifecycle-step';
      if (i < idx || (status === 'accepted' && st === 'accepted')) cls += ' done';
      if (st === status || (status === 'accepted' && st === 'accepted')) cls += ' active';
      html += '<span class="' + cls + '">' + LIFECYCLE_LABELS[st] + '</span>';
    });
    html += '</div>';
    return html;
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
    if (margin < MARGIN_FLOOR) return { type: 'margin', msg: 'Custom discount reduced margin to ' + margin + '% (floor ' + MARGIN_FLOOR + '%).' };
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

      function refresh(quoteDiscOverride) {
        var qd = quoteDiscOverride != null ? quoteDiscOverride : (q.quoteDiscPct || 0);
        if (quoteDiscOverride != null && getStore()) {
          getStore().updateQuote(id, { quoteDiscPct: qd });
          q = quoteFromStore(id);
          qd = q.quoteDiscPct || 0;
        }
        var p = (q.pricing && q.pricing.total != null) ? q.pricing : quotePricing(q);
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
        row.setAttribute('data-amount', String(p.total || 0));
        var marginCell = row.querySelector('[data-quote-margin]');
        if (marginCell) marginCell.textContent = p.margin + '%';
        var statusCell = row.querySelector('td .badge');
        if (statusCell && q.status) {
          var statusLabels = {
            draft: 'Draft', pending: 'Pending Approval', approved: 'Approved',
            sent: 'Sent', accepted: 'Accepted', lost: 'Lost', converted: 'Booked'
          };
          statusCell.outerHTML = '<span class="badge badge-' + (q.status === 'pending' ? 'pending' : q.status) + '">' +
            (statusLabels[q.status] || q.status) + '</span>';
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
      if (discInput) bindNumericInput(discInput, function (val) { refresh(val); });
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
    var editId = new URLSearchParams(location.search).get('id');
    if (editId) {
      var eq = store.getQuote(editId);
      if (eq && eq.customerId) return eq.customerId;
    }
    var prefill = store.getAssistantPrefill();
    if (prefill && prefill.customerId) return prefill.customerId;
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
      var svc = resolveBuilderService(selectedFamily, selectedHdTier);
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
      var svc = resolveBuilderService(selectedFamily, selectedHdTier);
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

    function builderQuote() {
      var svc = resolveBuilderService(selectedFamily, selectedHdTier);
      var qPreview = {
        customerId: builderCustomerId,
        primaryService: svc.primaryService,
        tariffId: svc.tariffId
      };
      var applied = previewAppliedTerms(qPreview);
      var fields = extractQuoteFieldsFromAdjustments(quoteAdjustments, applied);
      return {
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
        appliedTerms: storedAppliedTerms,
        quoteAdjustments: quoteAdjustments
      };
    }

    function refreshPriceDrivers(primary, svc) {
      if (cubeNote) {
        cubeNote.textContent = (primary.cube || 494) + ' cu ft · ' + svc.displayLabel +
          (primary.weightGroupLabel ? ' · v35 ' + primary.weightGroupLabel : '');
      }
      if (spotFuelInput && !spotFuelInput._wired) {
        spotFuelInput.value = primary.fuelPct + '%';
        spotFuelInput._wired = true;
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
      var svc = resolveBuilderService(selectedFamily, selectedHdTier);
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
          var store = getStore();
          if (store) {
            var snapshotTerms = editQuoteId && storedAppliedTerms
              ? storedAppliedTerms
              : buildAppliedTerms(q, storeAdapter());
            var payload = Object.assign({
              quoteDiscPct: fields.quoteDiscPct,
              laneOverride: q.laneOverride,
              customerDiscPct: fields.custDiscPct,
              status: gov ? 'pending' : 'approved',
              primaryService: svc.primaryService,
              tariffId: svc.tariffId,
              serviceFamily: selectedFamily,
              appliedTerms: JSON.parse(JSON.stringify(snapshotTerms)),
              quoteAdjustments: JSON.parse(JSON.stringify(quoteAdjustments))
            }, store.getAssistantPrefill() || {}, q);
            if (editQuoteId) {
              store.updateQuote(editQuoteId, payload);
              window.location.href = (gov ? 'quote-detail-pending.html' : 'quote-detail.html') + '?id=' + encodeURIComponent(editQuoteId);
            } else {
              var nq = store.createQuote(payload);
              store.clearAssistantPrefill();
              window.location.href = (gov ? 'quote-detail-pending.html' : 'quote-detail.html') + '?id=' + encodeURIComponent(nq.id);
            }
          }
        };
      }
      var fill = document.querySelector('.margin-gauge-fill');
      if (fill) {
        fill.className = 'margin-gauge-fill ' + (primary.margin < 15 ? 'red' : primary.margin < 18 ? 'amber' : 'green');
        fill.style.width = Math.min(primary.margin * 3, 100) + '%';
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
          selectedHdTier = initSrc.primaryService;
        } else if (initSrc.serviceFamily === 'home') {
          selectedFamily = 'home';
          selectedHdTier = initSrc.primaryService || 'threshold';
        }
        var famRadio = document.querySelector('[data-service-family][value="' + selectedFamily + '"]');
        if (famRadio) famRadio.checked = true;
        var tierRadio = document.querySelector('[data-hd-tier][value="' + selectedHdTier + '"]');
        if (tierRadio) tierRadio.checked = true;
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
    refresh();
  }

  function initDashboardQuickApprove() {
    document.querySelectorAll('[data-dashboard-approve]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var qid = btn.getAttribute('data-dashboard-approve');
        if (window.confirm('Approve ' + qid + '?')) { getStore().approveQuote(qid); location.reload(); }
      });
    });
    document.querySelectorAll('[data-dashboard-reject]').forEach(function (btn) {
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
      btn.addEventListener('click', function () {
        if (window.confirm('Approve this quote?')) {
          getStore().approveQuote(qid);
          location.href = 'quote-detail.html?id=' + encodeURIComponent(qid);
        }
      });
    });
    panel.querySelectorAll('[data-detail-reject]').forEach(function (btn) {
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
      var p = q ? quotePricing(q) : basePreset(parseFloat(mount.getAttribute('data-quote-disc') || '0') || 0);
      mount.innerHTML = renderPricingBreakdown(p, false, q ? pricingMetaFromQuote(q) : {});
    });
  }

  function initQuoteAssistant() {
    var root = document.getElementById('quote-assistant-root');
    if (!root) return;
    var thread = root.querySelector('.assistant-thread');
    var preview = root.querySelector('[data-assistant-preview]');
    var input = root.querySelector('[data-assistant-input]');
    var sendBtn = root.querySelector('[data-assistant-send]');
    var step = 0;

    function addMsg(text, who) {
      var div = document.createElement('div');
      div.className = 'assistant-msg ' + who;
      div.innerHTML = text;
      thread.appendChild(div);
      thread.scrollTop = thread.scrollHeight;
    }

    function addChips(labels, handler) {
      var wrap = document.createElement('div');
      wrap.className = 'assistant-chips';
      labels.forEach(function (label) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'assistant-chip';
        b.textContent = label;
        b.addEventListener('click', function () { handler(label); });
        wrap.appendChild(b);
      });
      thread.appendChild(wrap);
      thread.scrollTop = thread.scrollHeight;
    }

    function finishAssistantPrefill(family, tierLabel) {
      var tierMap = { 'Threshold': 'threshold', 'WG No Inspection': 'wgni', 'White Glove Inspection': 'wgi' };
      var hdTier = tierMap[tierLabel] || 'threshold';
      var svc = resolveBuilderService(family, hdTier);
      addMsg('TMV → Anderson SC, 4,200 lbs. Base rate from <strong>' + svc.tariffId + '</strong>, then cost layers stack up.', 'bot');
      var store = getStore();
      if (store) {
        store.setAssistantPrefill({
          customerId: 'PACI-1200',
          pickupZip: '27260',
          deliveryZip: '29621',
          origin: 'High Point, NC',
          destination: 'Anderson, SC',
          originStation: 'TMV',
          tariffId: svc.tariffId,
          primaryService: svc.primaryService,
          serviceFamily: family,
          weight: 4200,
          cube: 494
        });
      }
      showPreview();
    }

    function showPreview() {
      if (preview) {
        var p = basePreset(0);
        preview.innerHTML = renderPricingBreakdown(p, false) +
          '<p style="margin-top:12px"><a href="quote-builder.html?assistant=1" class="btn btn-primary">Open in Quote Builder</a></p>';
      }
    }

    addMsg('<strong>How can I help?</strong> Start a quote or pick a task below.', 'bot');
    addChips(['Create a new quote', 'Open an existing quote', 'Explain pricing for a lane', 'Check pending approvals'], function (label) {
      addMsg(label, 'user');
      if (label.indexOf('Create') === 0) {
        addMsg('Which service type?', 'bot');
        addChips(['B2B', 'Home Transport'], function (svcType) {
          addMsg(svcType, 'user');
          if (svcType === 'Home Transport') {
            addMsg('Which Home Transport level?', 'bot');
            addChips(['Threshold', 'WG No Inspection', 'White Glove Inspection'], function (tier) {
              addMsg(tier, 'user');
              finishAssistantPrefill('home', tier);
            });
          } else {
            finishAssistantPrefill('b2b', null);
          }
        });
      } else if (label.indexOf('Open') === 0) {
        addMsg('Enter a quote number (e.g. Q-2026-0823):', 'bot');
        step = 1;
      } else if (label.indexOf('Explain') === 0) {
        addMsg('TMV → SC zone resolves v35 weight group 6 (4,200 lbs @ 27.9¢/lb). Minimum $73 enforced when applicable. Fuel on net linehaul; insurance 1% DV ($25 min).', 'bot');
        if (preview) preview.innerHTML = renderPricingBreakdown(basePreset(0), true);
      } else {
        addMsg('3 quotes pending approval. <a href="dashboard.html">Open dashboard queue</a>.', 'bot');
      }
    });

    function handleInput() {
      var val = (input && input.value.trim()) || '';
      if (!val) return;
      addMsg(val, 'user');
      input.value = '';
      if (step === 1) {
        addMsg('Opening <a href="quote-detail.html?id=' + encodeURIComponent(val) + '">' + val + '</a>…', 'bot');
        step = 0;
      } else {
        addMsg('Use the chips above or say "create quote" to start.', 'bot');
      }
    }

    if (sendBtn) sendBtn.addEventListener('click', handleInput);
    if (input) input.addEventListener('keydown', function (e) { if (e.key === 'Enter') handleInput(); });
  }

  window.AwestPricingMock = {
    getPricingConfig: getPricingConfig,
    computeInsurance: computeInsurance,
    computePortalTier: computePortalTier,
    formatAccessorialRate: formatAccessorialRate,
    pricingMetaFromQuote: pricingMetaFromQuote,
    weightGroup: weightGroup,
    resolveOriginStation: resolveOriginStation,
    resolveB2bZone: resolveB2bZone,
    resolveHdPoi: resolveHdPoi,
    enginePricing: enginePricing,
    renderCostLayers: renderCostLayers,
    renderAdjustmentLayerEditor: renderAdjustmentLayerEditor,
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
    renderPricingBreakdown: renderPricingBreakdown,
    renderStackedBar: renderStackedBar,
    renderLifecycleStrip: renderLifecycleStrip,
    initQuotesListEnhanced: initQuotesListEnhanced,
    initQuoteBuilderPricing: initQuoteBuilderPricing,
    initDashboardQuickApprove: initDashboardQuickApprove,
    initQuoteDetailApproval: initQuoteDetailApproval,
    initQuoteDetailBreakdown: initQuoteDetailBreakdown,
    initQuoteAssistant: initQuoteAssistant
  };
})();
