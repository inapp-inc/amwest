/**
 * Workflow & governance — role checks and approval rules
 */
(function (global) {
  'use strict';

  var ROLES = {
    'Sales Rep': { canApprove: false, canEditTariff: false, canManageUsers: false },
    'Sales Manager': { canApprove: true, canEditTariff: false, canManageUsers: false },
    Operations: { canApprove: false, canEditTariff: true, canManageUsers: false },
    Admin: { canApprove: true, canEditTariff: true, canManageUsers: true }
  };

  function getRoleCaps(role) {
    return ROLES[role] || ROLES['Sales Rep'];
  }

  function needsApproval(state, quote) {
    var s = state.settings;
    var P = typeof global !== 'undefined' ? global.AwestPricingMock : null;
    var effectiveCust = quote.customerDiscPct || 0;
    if (P && P.getEffectiveCustomerDisc) effectiveCust = P.getEffectiveCustomerDisc(quote);
    var totalDisc = effectiveCust + (quote.quoteDiscPct || 0);
    var margin = quote.pricing && quote.pricing.margin != null ? quote.pricing.margin : 0;
    if (P && P.hasCustomerDiscException && P.hasCustomerDiscException(quote)) {
      return {
        type: 'customer_override',
        msg: 'Customer discount exception (' + effectiveCust + '%) differs from snapshotted master (' +
          quote.appliedTerms.customerDiscPctMaster + '%) — manager approval required.'
      };
    }
    if (totalDisc > s.repMaxDiscount) {
      return {
        type: 'discount',
        msg: 'Combined discount of ' + totalDisc + '% exceeds rep authority (max ' + s.repMaxDiscount + '%).'
      };
    }
    if (margin < s.marginFloor) {
      return {
        type: 'margin',
        msg: 'Custom discount reduced margin to ' + margin + '% (floor ' + s.marginFloor + '%).'
      };
    }
    return null;
  }

  function canApprove(state) {
    var user = state.users.find(function (u) { return u.id === state.meta.currentUserId; });
    return user && getRoleCaps(user.role).canApprove;
  }

  function canEditTariff(state) {
    var user = state.users.find(function (u) { return u.id === state.meta.currentUserId; });
    return user && getRoleCaps(user.role).canEditTariff;
  }

  function canManageUsers(state) {
    var user = state.users.find(function (u) { return u.id === state.meta.currentUserId; });
    return user && getRoleCaps(user.role).canManageUsers;
  }

  global.AwestGovernance = {
    getRoleCaps: getRoleCaps,
    needsApproval: needsApproval,
    canApprove: canApprove,
    canEditTariff: canEditTariff,
    canManageUsers: canManageUsers
  };
})(typeof window !== 'undefined' ? window : this);
