/**
 * Fictional tariff constants for the demo mockup only — not real AW pricing.
 */
(function (global) {
  'use strict';

  var B2B_RATES_PER_LB = [0.44, 0.42, 0.4, 0.38, 0.36, 0.33];

  function b2bMatrixRows(origin, zoneKey) {
    return B2B_RATES_PER_LB.map(function (ratePerLb, i) {
      return {
        origin: origin,
        zoneKey: zoneKey,
        weightGroup: i + 1,
        ratePerLb: ratePerLb,
        minimum: 88
      };
    });
  }

  function hdRow(origin, poi, bppc, tier) {
    var t = tier === 2 ? global.AwestDummyTariff.hd.tier2 : global.AwestDummyTariff.hd.tier1;
    return {
      origin: origin,
      poi: poi,
      bppc: bppc,
      ratePerLb: t.ratePerLb,
      minimum: t.minimum,
      ratePerCube: t.ratePerCube
    };
  }

  global.AwestDummyTariff = {
    disclaimer: 'Tariff rates in this demo are fictional sample data — not real pricing.',

    baseRateCwt: 77.77,
    priorBaseRateCwt: 75,
    minimumChargeTariff: 111,
    minimumChargeLane: 88,
    spotBaseCwtDefault: 77,
    mctcLevel: 'DEMO-9001',

    b2bRatesPerLb: B2B_RATES_PER_LB,
    b2bMinimum: 88,

    hd: {
      tier1: { ratePerLb: 0.55, minimum: 150, ratePerCube: 5.5 },
      tier2: { ratePerLb: 0.58, minimum: 160, ratePerCube: 5.75 }
    },
    wgni: {
      tier1: { ratePerLb: 0.6, minimum: 170, ratePerCube: 6 },
      tier2: { ratePerLb: 0.63, minimum: 180, ratePerCube: 6.25 }
    },
    wgi: {
      tier1: { ratePerLb: 0.65, minimum: 190, ratePerCube: 6.5 },
      tier2: { ratePerLb: 0.68, minimum: 200, ratePerCube: 6.75 }
    },

    tms: {
      b2bRateCode: 'XX1',
      b2bMinCode: 'XX2',
      hdRateCode: 'YY1',
      hdMinCode: 'YY2',
      levelCode: 'DEMO-9001',
      exportCsvLine: 'XX1,42.00,BW,125,250,500,1000,2000,88.00'
    },

    rateMatrixUi: {
      b2b: { rateBase: 44, rateStep: 1.1 },
      threshold: { rateBase: 7.7, rateStep: 0.11 },
      wgni: { rateBase: 48, rateStep: 1.1 },
      wgi: { rateBase: 52, rateStep: 1.1 }
    },

    overviewPresets: {
      b2b: { amount: 44, lane: 'National B2B Matrix', margin: 15, density: 8.5 },
      threshold: { amount: 40, lane: 'Home Delivery Threshold Matrix', margin: 12, density: 7.0 },
      'wg-no-insp': { amount: 48, lane: 'White Glove — No Inspection', margin: 15, density: 8.5 },
      'wg-insp': { amount: 52, lane: 'National B2B Matrix', margin: 15, density: 8.5 }
    },

    tariffDisplay: function () {
      return {
        baseRateCwt: this.baseRateCwt,
        priorBaseRateCwt: this.priorBaseRateCwt,
        laneOverrideCwt: 0,
        minimumCharge: this.minimumChargeLane,
        mctcLevel: this.mctcLevel
      };
    },

    b2bTariffConfig: function () {
      var self = this;
      return {
        baseRateCwt: self.baseRateCwt,
        priorBaseRateCwt: self.priorBaseRateCwt,
        minimumCharge: self.minimumChargeTariff,
        marginFloorPct: 15,
        density: 8.5,
        rateTableLabel: 'National B2B Matrix',
        description: 'National business-to-business rate program (per-pound v35 breaks). Separate from White Glove Inspection — see TAR-WGI-BASE for WGI.',
        effectiveEnd: '2026-12-31',
        baselineRules: [
          { type: 'Commodity', scope: 'Upholstery', value: '+8%', effect: '+8% on base rate' },
          { type: 'Minimum charge', scope: 'All lanes', value: '$' + self.minimumChargeLane, effect: 'Floor after rate × weight' },
          { type: 'Promotion', scope: '—', value: 'None active', effect: '—' }
        ],
        originGrid: null
      };
    },

    referenceRateMatrix: function () {
      var self = this;
      return {
        b2b: b2bMatrixRows('TMV', 'SC:293,296,297'),
        threshold: [
          hdRow('TMV', 'Greenville Tier 1', '29601', 1),
          Object.assign(hdRow('TMV', 'Greenville Tier 2', '29605', 2), { poi: 'Greenville Tier 2', bppc: '29605' })
        ],
        wgni: [
          {
            origin: 'TMV', poi: 'Greenville Tier 1', bppc: '29601',
            ratePerLb: self.wgni.tier1.ratePerLb, minimum: self.wgni.tier1.minimum, ratePerCube: self.wgni.tier1.ratePerCube
          },
          {
            origin: 'TMV', poi: 'Greenville Tier 2', bppc: '29605',
            ratePerLb: self.wgni.tier2.ratePerLb, minimum: self.wgni.tier2.minimum, ratePerCube: self.wgni.tier2.ratePerCube
          }
        ],
        wgi: [
          {
            origin: 'TMV', poi: 'Greenville Tier 1', bppc: '29601',
            ratePerLb: self.wgi.tier1.ratePerLb, minimum: self.wgi.tier1.minimum, ratePerCube: self.wgi.tier1.ratePerCube
          },
          {
            origin: 'TMV', poi: 'Greenville Tier 2', bppc: '29605',
            ratePerLb: self.wgi.tier2.ratePerLb, minimum: self.wgi.tier2.minimum, ratePerCube: self.wgi.tier2.ratePerCube
          }
        ]
      };
    },

    referenceHdTiers: function () {
      var self = this;
      return [
        {
          id: 'hd-29621', zip: '29621', poi: 'Greenville Tier 1', tier: '1', tierMiles: '0–50 mi from metro',
          bppc: '29601', ratePerLb: self.hd.tier1.ratePerLb, minimum: self.hd.tier1.minimum, origin: 'TMV', service: 'Threshold'
        },
        {
          id: 'hd-29601', zip: '29601', poi: 'Greenville Tier 1', tier: '1', tierMiles: '0–50 mi from metro',
          bppc: '29601', ratePerLb: self.hd.tier1.ratePerLb, minimum: self.hd.tier1.minimum, origin: 'TMV', service: 'Threshold'
        },
        {
          id: 'hd-29605', zip: '29605', poi: 'Greenville Tier 2', tier: '2', tierMiles: '50–100 mi from metro',
          bppc: '29605', ratePerLb: self.hd.tier2.ratePerLb, minimum: self.hd.tier2.minimum, origin: 'TMV', service: 'Threshold'
        },
        {
          id: 'hd-59801', zip: '59801', poi: 'Missoula rural', tier: null, tierMiles: null,
          bppc: null, ratePerLb: null, minimum: null, origin: null, service: 'Threshold'
        }
      ];
    },

    referenceTmsMapping: function () {
      var self = this;
      var level = self.mctcLevel;
      return {
        b2b: [{
          id: 'tms-b2b-tmv', label: 'B2B · TMV', tmsType: 'BW',
          tariffCode: self.tms.b2bRateCode, minTariffCode: self.tms.b2bMinCode,
          levelCode: level, discountLevel: level, fuelIndex: 'EIA National', exportSheet: 'b2b_tmv_export'
        }],
        threshold: [{
          id: 'tms-thr-tmv', label: 'Threshold · TMV', tmsType: 'BX',
          tariffCode: self.tms.hdRateCode, minTariffCode: self.tms.hdMinCode,
          levelCode: level, discountLevel: level, fuelIndex: 'EIA National', exportSheet: 'thr_tmv_export', bppc: '29601'
        }],
        wgi: [{
          id: 'tms-wgi-tmv', label: 'White Glove · TMV (primary BY)', tmsType: 'BY',
          tariffCode: self.tms.hdRateCode, minTariffCode: self.tms.hdMinCode,
          levelCode: level, discountLevel: level, fuelIndex: 'EIA National', exportSheet: 'wgi_tmv_export'
        }],
        mr2: [
          { id: 'mr2-29621', zip: '29621', bppc: '29601', poi: 'Greenville Tier 1', exportTemplate: 'mr2_export' },
          { id: 'mr2-00501', zip: '00501', bppc: '012401', poi: 'New York City Tier 1', exportTemplate: 'mr2_export' }
        ]
      };
    },

    defaults: function () {
      return this;
    }
  };
})(typeof window !== 'undefined' ? window : this);
