/**
 * Canonical mockup index — single source of truth for index.html mockup grids
 */
(function (global) {
  'use strict';

  var STORE_VERSION = 9;

  var GROUPS = [
    {
      id: 'auth',
      badge: 'ph1a',
      badgeLabel: 'Phase 1a · MVP',
      title: 'Authentication',
      items: [
        { href: 'internal/login.html', title: 'Login', desc: 'Email sign-in — routes by role; sets session user in demo banner' },
        { href: 'internal/forgot-password.html', title: 'Forgot Password', desc: 'Simulated password reset flow' }
      ]
    },
    {
      id: 'quotes-core',
      badge: 'ph1a',
      badgeLabel: 'Phase 1a · MVP',
      title: 'Quote workflow',
      items: [
        { href: 'internal/quotes.html', title: 'Quote List', desc: 'Three-bucket badges · amount hover drawer · inline quote discount · row approve/reject' },
        { href: 'internal/quote-assistant.html', title: 'Quote Assistant', desc: 'Platform enhancement — conversational create → save on shared pricing engine' },
        { href: 'internal/quote-builder.html', title: 'Quote Builder', desc: 'B2B / Home Transport · Step 4a applied terms · Step 4b adjustments · live pricing · draft save' },
        { href: 'internal/quote-builder.html?cfq=1', title: 'Quote Builder (CFQ)', desc: 'Call-for-Quote path — manual base/fuel rates wired to pricing engine' },
        { href: 'internal/quote-builder.html', title: 'Quote Builder (Spot)', desc: 'Spot quote toggle — manual $/CWT + fuel % bypass tariff lookup', queryNote: 'Use Spot Quote radio on builder' },
        { href: 'internal/quote-detail.html?id=Q-2026-0847', title: 'Quote Detail (Pending Q-0847)', desc: 'Pending quote — three-bucket badges · 8% exception + 7% quote disc · manager Approve/Reject · tariff hover drawer' },
        { href: 'internal/quote-detail-pending.html?id=Q-2026-0847', title: 'Pending detail route (alias)', desc: 'Legacy pending URL — redirects to unified Quote Detail with ?id=Q-2026-0847' },
        { href: 'internal/quote-detail.html?id=Q-2026-0823', title: 'Quote Detail (Approved)', desc: 'Approved quote — breakdown, lifecycle stepper, PDF / e-sign / TMS chain · tariff hover drawer' },
        { href: 'internal/quote-pdf.html?id=Q-2026-0823', title: 'Quote PDF Preview', desc: 'Generate PDF — persists artifact state in session store' },
        { href: 'internal/quote-comparison.html?id=Q-2026-0847&right=Q-2026-0823', title: 'Quote Comparison', desc: 'Side-by-side quote diff — selects wired to live store totals' }
      ]
    },
    {
      id: 'tariffs-core',
      badge: 'ph1a',
      badgeLabel: 'Phase 1a · MVP',
      title: 'Tariff administration',
      items: [
        { href: 'internal/tariffs.html', title: 'Tariff List', desc: 'Base schedules by service type · filter bar · Edit matrix row action' },
        { href: 'internal/tariff-detail.html', title: 'Tariff Detail', desc: 'Service/UOM selects · origin grid · baseline rules · live numeric save · reference inheritance' },
        { href: 'internal/tariff-wizard.html', title: 'Tariff Configurator', desc: '5-step wizard — origin stations, commodity, baseline rules persist on create' },
        { href: 'internal/tariff-rate-matrix.html', title: 'Rate Table Matrix', desc: 'Zone × weight/cube breaks per origin × service — save to session store' },
        { href: 'internal/tariff-add-override.html', title: 'Add Tariff Override', desc: 'Add baseline rule to tariff config' },
        { href: 'internal/tariff-delete-confirm.html', title: 'Delete Tariff', desc: 'Destructive confirmation — removes from store' },
        { href: 'internal/tariff-rollback-confirm.html', title: 'Tariff Rollback', desc: 'Version rollback confirmation' }
      ]
    },
    {
      id: 'customers-admin',
      badge: 'ph1a',
      badgeLabel: 'Phase 1a · MVP',
      title: 'Customers & admin',
      items: [
        { href: 'internal/customers.html', title: 'Customer List', desc: 'Customer master browse · filter bar' },
        { href: 'internal/customer-detail.html?id=PACI-1200', title: 'Customer Detail', desc: 'Per-service discounts · lane overrides · live quote preview · save to store' },
        { href: 'internal/admin-users.html', title: 'Users & Roles', desc: 'User accounts grid — links to edit' },
        { href: 'internal/admin-invite.html', title: 'Invite User', desc: 'Admin invitation form — creates user in store' },
        { href: 'internal/admin-user-edit.html', title: 'Edit User', desc: 'Edit profile · status select · disable user action' },
        { href: 'internal/admin-config.html', title: 'Admin Configuration', desc: 'Hub — agreement template, system config, lists, users' },
        { href: 'internal/admin-system-config.html', title: 'System Configuration', desc: 'Cubic divisor, thresholds, margin floor — save to settings' },
        { href: 'internal/admin-agreement-template.html', title: 'Agreement Template', desc: 'Quote PDF legal boilerplate — save to settings' },
        { href: 'internal/admin-list-management.html', title: 'Validation Lists', desc: 'Origins, commodities, UOM picklists' },
        { href: 'internal/admin-list-edit.html', title: 'Edit List Values', desc: 'Single picklist editor — save to store' }
      ]
    },
    {
      id: 'ops-extended',
      badge: 'ph1b',
      badgeLabel: 'Phase 1b · Internal ops',
      title: 'Operations & analytics',
      items: [
        { href: 'internal/dashboard.html', title: 'Dashboard', desc: 'Live KPIs · rep drilldowns · pending queue Approve/Reject' },
        { href: 'internal/analytics.html', title: 'Analytics', desc: 'Win rate KPIs · lane profitability table from store' },
        { href: 'internal/tariff-comparison.html', title: 'Tariff Comparison', desc: 'Compare two tariffs — selects update base-rate diff from store' },
        { href: 'internal/tariff-competitor-comparison.html', title: 'Competitor Comparison', desc: 'AW rate vs competitor quote — seeded from Q-0823' },
        { href: 'internal/quote-layer-templates.html', title: 'Quote Layer Templates', desc: 'Platform enhancement — admin catalog (store-hydrated) defining Step 4b adjustment layers' }
      ]
    },
    {
      id: 'reference',
      badge: 'ph1b',
      badgeLabel: 'Phase 1b · Reference data',
      title: 'Pricing setup & reference data',
      items: [
        { href: 'internal/reference.html', title: 'Pricing Setup Hub', desc: 'Entry to fuel, accessorials, lanes, TMS mapping, layer templates' },
        { href: 'internal/reference-fuel.html', title: 'Fuel Tables', desc: 'EIA-style fuel surcharge list — edit links to store' },
        { href: 'internal/reference-fuel-edit.html?id=fuel-1', title: 'Edit Fuel Rate', desc: 'Fuel surcharge edit form — save to reference collection' },
        { href: 'internal/reference-fuel-override.html', title: 'Fuel Manual Override', desc: 'One-off surcharge entry' },
        { href: 'internal/reference-fuel-history.html', title: 'Fuel Rate History', desc: 'Per-entry fuel audit trail from store' },
        { href: 'internal/reference-accessorials.html', title: 'Accessorials', desc: 'Lift gate, residential, extra man — rates from store' },
        { href: 'internal/reference-accessorial-edit.html?id=acc-lift', title: 'Edit Accessorial', desc: 'Accessorial rule form — save to store' },
        { href: 'internal/reference-lanes.html', title: 'Lane / ZIP Hub', desc: 'Entry to B2B lanes vs home-delivery tiers' },
        { href: 'internal/reference-lanes-b2b.html', title: 'B2B Lane Config', desc: '3-digit base-ZIP → lane description · edit links wired' },
        { href: 'internal/reference-lane-b2b-edit.html?id=lane-sc', title: 'Edit B2B Lane Zone', desc: 'Single commercial lane form — CRUD save' },
        { href: 'internal/reference-lane-edit.html', title: 'Edit Lane Group', desc: 'Lane group form' },
        { href: 'internal/reference-tiers-hd.html', title: 'Home Delivery Tiers', desc: '5-digit ZIP → POI/tier → BPPC' },
        { href: 'internal/reference-tier-hd-edit.html?id=hd-29621', title: 'Edit HD Tier', desc: 'Single tier form — CRUD save' },
        { href: 'internal/reference-tms-mapping.html', title: 'TMS Rate-Key Mapping', desc: 'B2B / Threshold / MR2 tabs — save mapping to store' }
      ]
    },
    {
      id: 'integrations',
      badge: 'ph1c',
      badgeLabel: 'Phase 1c · Integrations',
      title: 'Hub adapters & external systems',
      items: [
        { href: 'internal/quote-esign.html?id=Q-2026-0823', title: 'E-Signature', desc: 'DocuSign send flow — Document Hub adapter (simulated)' },
        { href: 'internal/quote-tms-export.html?id=Q-2026-0823', title: 'TMS Export', desc: 'AlphaTruck export — uses TMS rate-key mapping (simulated)' }
      ]
    },
    {
      id: 'portal',
      badge: 'ph2',
      badgeLabel: 'Phase 2 · Portal',
      title: 'Customer self-service',
      items: [
        { href: 'portal/portal-dashboard.html', title: 'Customer Home', desc: 'Welcome, Get a Quote CTA, recent activity' },
        { href: 'portal/portal-quote-request.html', title: 'Quote Request', desc: 'Origin/destination · tier comparison · live breakdown · Accept & Book · Save for Later' },
        { href: 'portal/portal-pricing-help.html', title: 'Pricing Help Center', desc: 'Glossary, tiers, insurance — deep-linkable from quotes' },
        { href: 'portal/portal-quote-confirmation.html', title: 'Quote Confirmed', desc: 'Accept & book success screen' },
        { href: 'portal/portal-shipment-tracker.html', title: 'Shipment Tracker', desc: 'Quote→Invoice lifecycle · requote / duplicate links' },
        { href: 'portal/portal-self-service.html', title: 'Self-Service Tools', desc: 'Address book · saved commodities · support tickets from store' },
        { href: 'portal/portal-pod.html', title: 'Proof of Delivery', desc: 'POD download view' },
        { href: 'portal/portal-add-address.html', title: 'Add Address', desc: 'Portal address form — save to store' },
        { href: 'portal/portal-add-commodity.html', title: 'Add Commodity', desc: 'Portal commodity form — save to store' }
      ]
    },
    {
      id: 'crm',
      badge: 'ph3',
      badgeLabel: 'Phase 3 · Sales',
      title: 'Sales Pipeline & CRM',
      items: [
        { href: 'crm/crm-dashboard.html', title: 'Sales Dashboard', desc: 'Team KPIs, rep leaderboard, follow-ups from store' },
        { href: 'crm/crm-opportunities.html', title: 'Opportunity Kanban', desc: 'Quote lifecycle stages — Shift+click to move · syncs store status' }
      ]
    }
  ];

  function pageCount() {
    var seen = {};
    GROUPS.forEach(function (g) {
      g.items.forEach(function (item) {
        seen[item.href.split('?')[0]] = true;
      });
    });
    return Object.keys(seen).length;
  }

  function cardCount() {
    return GROUPS.reduce(function (n, g) { return n + g.items.length; }, 0);
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function renderMockupGroups(mount) {
    if (!mount) return;
    mount.innerHTML = GROUPS.map(function (group) {
      var cards = group.items.map(function (item) {
        return '<div class="wt-mockup-card">' +
          '<a href="' + escapeHtml(item.href) + '">' + escapeHtml(item.title) + '</a>' +
          '<p>' + escapeHtml(item.desc) + (item.queryNote ? ' <em>(' + escapeHtml(item.queryNote) + ')</em>' : '') + '</p>' +
          '</div>';
      }).join('');
      return '<div class="wt-mockup-group" id="wt-mockup-' + group.id + '">' +
        '<h3><span class="wt-phase-badge ' + group.badge + '">' + escapeHtml(group.badgeLabel) + '</span> ' + escapeHtml(group.title) + '</h3>' +
        '<div class="wt-mockup-grid">' + cards + '</div></div>';
    }).join('');

    mount.querySelectorAll('a[href^="internal/"], a[href^="portal/"], a[href^="crm/"]').forEach(function (a) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
  }

  global.AwestMockupCatalog = {
    STORE_VERSION: STORE_VERSION,
    GROUPS: GROUPS,
    pageCount: pageCount,
    cardCount: cardCount,
    renderMockupGroups: renderMockupGroups
  };
})(typeof window !== 'undefined' ? window : this);
