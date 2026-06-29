/**
 * Canonical demo seed — aligned with AW operations (TMV, v35 breaks, AlphaTruck codes)
 */
(function (global) {
  'use strict';

  var AW_ORIGINS = ['LAX', 'DFW', 'TMV', 'PHX', 'SFO', 'ATL', 'EWR'];

  function iso(d) {
    return d.toISOString();
  }

  var now = new Date('2026-06-22T12:00:00Z');

  function emptyArtifacts() {
    return {
      pdf: { generatedAt: null },
      esign: { status: 'none', sentAt: null, signedAt: null },
      tmsExport: { status: 'none', exportedAt: null, error: null }
    };
  }

  function quoteBase(overrides) {
    var o = {
      customerId: 'PACI-1200',
      repId: 'user-jordan',
      channel: 'internal',
      pickupZip: '27260',
      deliveryZip: '29621',
      origin: 'High Point, NC',
      destination: 'Anderson, SC',
      originStation: 'TMV',
      laneCode: 'SC:293,296,297',
      hdPoi: 'Greenville Tier 1',
      tariffId: 'TAR-B2B-BASE',
      primaryService: 'b2b',
      weight: 4200,
      cube: 494,
      commodity: 'FAK',
      declaredValue: 45000,
      customerDiscPct: 5,
      quoteDiscPct: 0,
      laneOverride: 0,
      pricingMode: 'engine',
      appliedTerms: null,
      quoteAdjustments: null,
      adjustmentLayers: null,
      lineItems: [],
      competitor: null,
      artifacts: emptyArtifacts(),
      rejectionReason: null,
      pricing: null
    };
    Object.keys(overrides || {}).forEach(function (k) { o[k] = overrides[k]; });
    return o;
  }

  function buildSeed() {
    return {
      meta: {
        version: 3,
        seededAt: iso(now),
        currentUserId: 'user-jordan',
        lastLoginAt: iso(now)
      },
      settings: {
        repMaxDiscount: 10,
        marginFloor: 15,
        cubicDivisor: 1728,
        cubeThreshold: 1500,
        demoLane: {
          pickupZip: '27260',
          deliveryZip: '29621',
          originStation: 'TMV',
          weight: 4200,
          cube: 494,
          fuelPct: 28.4
        },
        portalQuote: {
          weight: 2400,
          cube: 320,
          declaredValue: 18000,
          pickupZip: '27260',
          deliveryZip: '29621',
          origin: 'High Point, NC 27260',
          destination: 'Anderson, SC 29621',
          selectedTier: 'wgi',
          tiers: [
            { id: 'threshold', name: 'Threshold', service: 'threshold' },
            { id: 'wgni', name: 'White Glove No Inspection', service: 'wgni' },
            { id: 'wgi', name: 'White Glove Inspection', service: 'wgi' }
          ]
        },
        tariffDisplay: {
          baseRateCwt: 58.2,
          priorBaseRateCwt: 56.55,
          laneOverrideCwt: 0,
          minimumCharge: 73,
          mctcLevel: '4558'
        },
        agreementTemplate: 'Standard AW quote cover sheet — tier language v3',
        emailRouting: 'quotes@americanwest.com',
        computedLayerLabels: ['Base rate', 'Customer discount', 'Fuel surcharge', 'Insurance'],
        quoteLayerTemplates: [
          { presetId: 'customer-disc-override', name: 'Customer discount override', type: 'pct_linehaul', scope: 'quote', defaultEnabled: false, defaultValue: 0, requiresApprovalWhenChanged: true, hint: 'One-off % on this quote — routes for approval when different from customer master' },
          { presetId: 'quote-discount', name: 'Quote discount', type: 'pct_linehaul', scope: 'quote', defaultEnabled: true, defaultValue: 0, hint: 'Rep-negotiated % off linehaul (after customer disc)' },
          { presetId: 'lane-override', name: 'Lane override', type: 'flat_add', scope: 'quote', defaultEnabled: true, defaultValue: 0, hint: 'Flat $ added to net linehaul' },
          { presetId: 'lift-gate', name: 'Lift gate', type: 'flat_add', scope: 'quote', defaultSource: 'accessorial:acc-lift', defaultEnabled: false, hint: 'Delivery — no dock' },
          { presetId: 'residential', name: 'Residential delivery', type: 'flat_add', scope: 'quote', defaultSource: 'accessorial:acc-res', defaultEnabled: false, hint: 'Residential address surcharge' },
          { presetId: 'extra-man', name: 'Extra man', type: 'flat_add', scope: 'quote', defaultSource: 'accessorial:acc-extra', defaultEnabled: false, hint: 'Manual flag · hourly rate as flat for demo' }
        ],
        adjustmentLayerPresets: [],
        customLayerTypes: [
          { type: 'flat_add', label: 'Flat charge ($)' },
          { type: 'flat_sub', label: 'Flat credit ($)' },
          { type: 'pct_linehaul', label: 'Discount (% of linehaul)' }
        ]
      },
      validationLists: {
        origins: AW_ORIGINS.slice(),
        commodities: ['FAK', 'CAS', 'UPH', 'Carton', 'Blanketwrap'],
        uoms: ['CWT', 'Cube', 'Flat'],
        discountSteps: [15, 10, 5, 0, -5, -10, -15]
      },
      users: [
        { id: 'user-jordan', name: 'Jordan Ellis', email: 'jordan.ellis@americanwest.com', role: 'Sales Rep', status: 'active', quoteCount: 12 },
        { id: 'user-morgan', name: 'Morgan Reyes', email: 'morgan.reyes@americanwest.com', role: 'Sales Manager', status: 'active', quoteCount: 0 },
        { id: 'user-admin', name: 'Admin User', email: 'admin@americanwest.com', role: 'Admin', status: 'active', quoteCount: 0 }
      ],
      customers: [
        {
          id: 'PACI-1200', code: 'PACI-1200', name: 'Pacific Home Furnishings', repId: 'user-jordan',
          status: 'active', overallDiscPct: 5,
          pickupLocation: '1200 Industrial Way, High Point NC 27260',
          tariffNotes: 'Insurance at 1% declared value (standard). Fuel: AW weekly index — no fixed cap.',
          fixedFuelPct: null,
          serviceDiscounts: [
            { service: 'B2B', pct: 5, density: '8.5 lbs/cf' },
            { service: 'Threshold', pct: 3, density: '8.5 lbs/cf' },
            { service: 'White Glove No Inspection', pct: 5, density: '8.5 lbs/cf' },
            { service: 'White Glove Inspection', pct: 4, density: '7.0 lbs/cf' }
          ],
          laneDiscounts: [], tariffIds: ['TAR-B2B-BASE', 'TAR-HD-TH-002', 'TAR-PACI-B2B']
        },
        {
          id: 'SARI-1211', code: 'SARI-1211', name: 'Syriza Furniture', repId: 'user-jordan',
          status: 'active', overallDiscPct: 0,
          pickupLocation: '1211 Commerce Dr, Thomasville NC 27360',
          tariffNotes: 'TMV-only tariff v35 per-pound. B2B −25% rate & minimum; HD services −20%. Insurance 1% DV.',
          fixedFuelPct: null,
          serviceDiscounts: [
            { service: 'B2B', pct: 25, density: '5.0 lbs/cf' },
            { service: 'Threshold', pct: 20, density: '5.0 lbs/cf' },
            { service: 'White Glove No Inspection', pct: 20, density: '5.0 lbs/cf' },
            { service: 'White Glove Inspection', pct: 20, density: '5.0 lbs/cf' }
          ],
          laneDiscounts: [], tariffIds: ['TAR-SARI-V35']
        },
        {
          id: 'CASA-1102', code: 'CASA-1102', name: 'Cascade Furniture Co.', repId: 'user-jordan',
          status: 'active', overallDiscPct: 3, serviceDiscounts: [], laneDiscounts: [], tariffIds: [],
          tariffNotes: '', fixedFuelPct: null, pickupLocation: '1102 Warehouse Blvd, Atlanta GA'
        },
        {
          id: 'NORT-3301', code: 'NORT-3301', name: 'Northwest Retail Group', repId: 'user-jordan',
          status: 'active', overallDiscPct: 3, serviceDiscounts: [], laneDiscounts: [], tariffIds: [],
          tariffNotes: '', fixedFuelPct: null, pickupLocation: '3301 Distribution Pkwy, Charlotte NC'
        }
      ],
      tariffs: [
        { id: 'TAR-B2B-BASE', name: 'National B2B — CWT v35', type: 'Base', service: 'B2B', uom: 'CWT', customerId: null, status: 'active', effectiveDate: '2026-05-06', version: 35, parentTariffId: null, mctcLevel: '4558' },
        { id: 'TAR-WGI-BASE', name: 'National White Glove Inspection — CWT v35', type: 'Base', service: 'WGI', uom: 'CWT', customerId: null, status: 'active', effectiveDate: '2026-05-06', version: 35, parentTariffId: null, mctcLevel: '4558' },
        { id: 'TAR-WGNI-BASE', name: 'National WG No Inspection — CWT v35', type: 'Base', service: 'WGNI', uom: 'CWT', customerId: null, status: 'active', effectiveDate: '2026-05-06', version: 35, parentTariffId: null, mctcLevel: '4558' },
        { id: 'TAR-HD-TH-002', name: 'Threshold Home Delivery', type: 'Derived', service: 'Threshold', uom: 'Cube', customerId: 'PACI-1200', status: 'active', effectiveDate: '2026-04-15', version: 1, parentTariffId: 'TAR-B2B-BASE', mctcLevel: '4558' },
        { id: 'TAR-PACI-B2B', name: 'PACI Negotiated B2B', type: 'Customer-specific', service: 'B2B', uom: 'CWT', customerId: 'PACI-1200', status: 'active', effectiveDate: '2026-03-01', version: 2, parentTariffId: 'TAR-B2B-BASE', mctcLevel: '4558' },
        { id: 'TAR-SARI-V35', name: 'Syriza TMV v35 Per-Pound', type: 'Customer-specific', service: 'B2B', uom: 'CWT', customerId: 'SARI-1211', status: 'active', effectiveDate: '2026-05-06', version: 35, parentTariffId: 'TAR-B2B-BASE', mctcLevel: '4558' },
        { id: 'TAR-SPOT-001', name: 'Spot Rate Template', type: 'Base', service: 'B2B', uom: 'Flat', customerId: null, status: 'draft', effectiveDate: '2026-06-01', version: 1, parentTariffId: null, mctcLevel: null },
        { id: 'TAR-CFQ-001', name: 'Rural Montana CFQ', type: 'Base', service: 'Threshold', uom: 'Flat', customerId: null, status: 'active', effectiveDate: '2025-12-01', version: 1, parentTariffId: null, mctcLevel: null }
      ],
      tariffVersions: [],
      tariffOverrides: [],
      rateMatrices: {},
      quotes: [
        Object.assign(quoteBase({
          id: 'Q-2026-0847', status: 'pending', quoteDiscPct: 7,
          createdAt: iso(new Date('2026-06-18')), updatedAt: iso(new Date('2026-06-20'))
        })),
        Object.assign(quoteBase({
          id: 'Q-2026-0842', customerId: 'NORT-3301', customerDiscPct: 3, quoteDiscPct: 12,
          status: 'pending', createdAt: iso(new Date('2026-06-17')), updatedAt: iso(new Date('2026-06-19'))
        })),
        Object.assign(quoteBase({
          id: 'Q-2026-0831', customerId: 'NORT-3301', customerDiscPct: 3, quoteDiscPct: 2,
          status: 'pending', createdAt: iso(new Date('2026-06-15')), updatedAt: iso(new Date('2026-06-17'))
        })),
        Object.assign(quoteBase({
          id: 'Q-2026-0823', status: 'approved', quoteDiscPct: 0,
          artifacts: Object.assign(emptyArtifacts(), { pdf: { generatedAt: iso(new Date('2026-06-18')) } }),
          approvedBy: 'user-morgan', approvedAt: iso(new Date('2026-06-18')),
          createdAt: iso(new Date('2026-06-16')), updatedAt: iso(new Date('2026-06-18'))
        })),
        Object.assign(quoteBase({
          id: 'Q-2026-0819', customerId: 'CASA-1102', destination: 'Greenville, SC', deliveryZip: '29601',
          status: 'sent', pricingMode: 'override', pricingOverride: { total: 2340, margin: 20.8 },
          sentAt: iso(new Date('2026-06-15')), createdAt: iso(new Date('2026-06-10')), updatedAt: iso(new Date('2026-06-15'))
        })),
        Object.assign(quoteBase({
          id: 'Q-2026-0770', status: 'accepted', pricingMode: 'override', pricingOverride: { total: 1890, margin: 24.1 },
          acceptedAt: iso(new Date('2026-06-22')), createdAt: iso(new Date('2026-06-01')), updatedAt: iso(new Date('2026-06-22'))
        })),
        Object.assign(quoteBase({
          id: 'Q-2026-0801', status: 'draft', destination: 'Charlotte, NC', deliveryZip: '28202',
          pricingMode: 'override', pricingOverride: { total: 1980, margin: 18.2 },
          createdAt: iso(new Date('2026-06-12')), updatedAt: iso(new Date('2026-06-12'))
        })),
        Object.assign(quoteBase({
          id: 'Q-2026-0798', customerId: 'CASA-1102', deliveryZip: '59801', destination: 'Missoula, MT',
          laneCode: 'CFQ', hdPoi: null, status: 'lost', pricingMode: 'override',
          pricingOverride: { total: 2150, margin: 25.1 },
          createdAt: iso(new Date('2026-06-08')), updatedAt: iso(new Date('2026-06-10'))
        }))
      ],
      reference: {
        fuel: [
          { id: 'fuel-1', effectiveDate: '2026-06-18', pct: 28.4, source: 'Auto (EIA · Wed update)', authorId: 'user-admin' }
        ],
        fuelHistory: [],
        accessorials: [
          { id: 'acc-lift', name: 'Lift gate', trigger: 'Delivery, no dock', rate: 85, rateType: 'flat', status: 'active' },
          { id: 'acc-res', name: 'Residential delivery', trigger: 'Residential address', rate: 120, rateType: 'flat', status: 'active' },
          { id: 'acc-extra', name: 'Extra man', trigger: 'Manual flag', rate: 95, rateType: 'hourly', status: 'active' }
        ],
        originZips: [
          { zip: '27260', city: 'High Point', state: 'NC', originStation: 'TMV' },
          { zip: '27360', city: 'Thomasville', state: 'NC', originStation: 'TMV' },
          { zip: '90001', city: 'Los Angeles', state: 'CA', originStation: 'LAX' },
          { zip: '30301', city: 'Atlanta', state: 'GA', originStation: 'ATL' }
        ],
        b2bLanes: [
          { id: 'lane-sc', baseZip: '293', description: 'SC: 293, 296, 297', originStation: 'TMV', cfq: false, tariffGroup: 3, zoneKey: 'SC:293,296,297' },
          { id: 'lane-900', baseZip: '900', description: 'Los Angeles metro', originStation: 'LAX', cfq: false, tariffGroup: 6, zoneKey: 'CA:900-930' },
          { id: 'lane-303', baseZip: '303', description: 'Atlanta metro', originStation: 'ATL', cfq: false, tariffGroup: 5, zoneKey: 'GA:303' },
          { id: 'lane-596', baseZip: '596', description: 'Montana rural', originStation: null, cfq: true, tariffGroup: 0, zoneKey: null }
        ],
        b2bZipExceptions: [
          { zip: '29621', zoneKey: 'SC:293,296,297', note: '5-digit override — Anderson SC' }
        ],
        hdTiers: [
          { id: 'hd-29621', zip: '29621', poi: 'Greenville Tier 1', tier: '1', tierMiles: '0–50 mi from metro', bppc: '29601', ratePerLb: 0.5654, minimum: 166, origin: 'TMV', service: 'Threshold' },
          { id: 'hd-29601', zip: '29601', poi: 'Greenville Tier 1', tier: '1', tierMiles: '0–50 mi from metro', bppc: '29601', ratePerLb: 0.5654, minimum: 166, origin: 'TMV', service: 'Threshold' },
          { id: 'hd-29605', zip: '29605', poi: 'Greenville Tier 2', tier: '2', tierMiles: '50–100 mi from metro', bppc: '29605', ratePerLb: 0.589, minimum: 175, origin: 'TMV', service: 'Threshold' },
          { id: 'hd-59801', zip: '59801', poi: 'Missoula rural', tier: null, tierMiles: null, bppc: null, ratePerLb: null, minimum: null, origin: null, service: 'Threshold' }
        ],
        mr2ZipMap: [
          { zip: '29621', bppc: '29601', poi: 'Greenville Tier 1' },
          { zip: '29601', bppc: '29601', poi: 'Greenville Tier 1' },
          { zip: '29605', bppc: '29605', poi: 'Greenville Tier 2' },
          { zip: '00501', bppc: '012401', poi: 'New York City Tier 1' },
          { zip: '01001', bppc: '01001', poi: 'Hartford Tier 1' }
        ],
        rateMatrix: {
          b2b: [
            { origin: 'TMV', zoneKey: 'SC:293,296,297', weightGroup: 1, ratePerLb: 0.32, minimum: 73 },
            { origin: 'TMV', zoneKey: 'SC:293,296,297', weightGroup: 2, ratePerLb: 0.305, minimum: 73 },
            { origin: 'TMV', zoneKey: 'SC:293,296,297', weightGroup: 3, ratePerLb: 0.298, minimum: 73 },
            { origin: 'TMV', zoneKey: 'SC:293,296,297', weightGroup: 4, ratePerLb: 0.291, minimum: 73 },
            { origin: 'TMV', zoneKey: 'SC:293,296,297', weightGroup: 5, ratePerLb: 0.285, minimum: 73 },
            { origin: 'TMV', zoneKey: 'SC:293,296,297', weightGroup: 6, ratePerLb: 0.279, minimum: 73 }
          ],
          threshold: [
            { origin: 'TMV', poi: 'Greenville Tier 1', bppc: '29601', ratePerLb: 0.5654, minimum: 166, ratePerCube: 4.85 },
            { origin: 'TMV', poi: 'Greenville Tier 2', bppc: '29605', ratePerLb: 0.589, minimum: 175, ratePerCube: 5.1 }
          ],
          wgni: [
            { origin: 'TMV', poi: 'Greenville Tier 1', bppc: '29601', ratePerLb: 0.612, minimum: 185, ratePerCube: 5.45 },
            { origin: 'TMV', poi: 'Greenville Tier 2', bppc: '29605', ratePerLb: 0.635, minimum: 195, ratePerCube: 5.7 }
          ],
          wgi: [
            { origin: 'TMV', poi: 'Greenville Tier 1', bppc: '29601', ratePerLb: 0.658, minimum: 205, ratePerCube: 5.95 },
            { origin: 'TMV', poi: 'Greenville Tier 2', bppc: '29605', ratePerLb: 0.682, minimum: 215, ratePerCube: 6.2 }
          ]
        },
        tmsMapping: {
          b2b: [
            { id: 'tms-b2b-tmv', label: 'B2B · TMV', tmsType: 'BW', tariffCode: 'D7', minTariffCode: 'D8', levelCode: '4558', discountLevel: '4558', fuelIndex: 'EIA National', exportSheet: 'b2b_tmv_export' }
          ],
          threshold: [
            { id: 'tms-thr-tmv', label: 'Threshold · TMV', tmsType: 'BX', tariffCode: 'DM', minTariffCode: 'DN', levelCode: '4558', discountLevel: '4558', fuelIndex: 'EIA National', exportSheet: 'thr_tmv_export', bppc: '29601' }
          ],
          wgi: [
            { id: 'tms-wgi-tmv', label: 'White Glove · TMV (primary BY)', tmsType: 'BY', tariffCode: 'DM', minTariffCode: 'DN', levelCode: '4558', discountLevel: '4558', fuelIndex: 'EIA National', exportSheet: 'wgi_tmv_export' }
          ],
          mr2: [
            { id: 'mr2-29621', zip: '29621', bppc: '29601', poi: 'Greenville Tier 1', exportTemplate: 'mr2_export' },
            { id: 'mr2-00501', zip: '00501', bppc: '012401', poi: 'New York City Tier 1', exportTemplate: 'mr2_export' }
          ]
        }
      },
      shipments: [
        { id: 'SH-8842', customerId: 'PACI-1200', quoteId: 'Q-2026-0770', origin: 'High Point, NC', destination: 'Anderson, SC', status: 'in_transit', eta: '2026-06-22', podAvailable: false, milestones: ['Booked', 'In transit'], podUrl: null },
        { id: 'SH-8790', customerId: 'PACI-1200', quoteId: null, origin: 'High Point, NC', destination: 'Anderson, SC', status: 'delivered', eta: '2026-06-10', podAvailable: true, milestones: ['Delivered'], podUrl: 'portal-pod.html' },
        { id: 'SH-8851', customerId: 'PACI-1200', quoteId: 'Q-2026-0823', origin: 'High Point, NC', destination: 'Anderson, SC', status: 'booked', eta: '2026-06-25', podAvailable: false, milestones: ['Booked'], podUrl: null }
      ],
      portal: {
        activeCustomerId: 'PACI-1200',
        addresses: [
          { id: 'addr-1', customerId: 'PACI-1200', label: 'Main warehouse', lines: '1200 Industrial Way, High Point NC 27260', default: true }
        ],
        commodities: [
          { id: 'comm-1', customerId: 'PACI-1200', name: 'Case goods — dining sets', nmfc: '', dims: '48×40×36' }
        ],
        supportTickets: [
          { id: 'tkt-1', customerId: 'PACI-1200', subject: 'Rate clarification on last quote', status: 'open', createdAt: iso(new Date('2026-06-19')) }
        ]
      },
      crm: {
        stageMapping: { pending: 'Pending', approved: 'Approved', sent: 'Proposal', accepted: 'Closed Won', lost: 'Closed Lost', draft: 'Lead' },
        followUps: [
          { id: 'fu-1', quoteId: 'Q-2026-0847', repId: 'user-jordan', dueDate: '2026-06-23', note: 'Follow up on pending approval' }
        ]
      },
      auditEvents: []
    };
  }

  global.AwestSeed = {
    STORAGE_KEY: 'awest:store',
    AW_ORIGINS: AW_ORIGINS,
    build: buildSeed
  };
})(typeof window !== 'undefined' ? window : this);
