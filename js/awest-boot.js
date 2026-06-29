/**
 * Boot — init session store, demo toolbar, global listeners
 */
(function (global) {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function injectDemoControls() {
    var banner = document.querySelector('.demo-banner');
    if (!banner || banner.querySelector('[data-demo-store-controls]')) return;

    var wrap = document.createElement('span');
    wrap.setAttribute('data-demo-store-controls', '');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:8px;margin-left:auto;flex-wrap:wrap';

    var user = global.AwestStore.getCurrentUser();
    var userSel = document.createElement('select');
    userSel.className = 'demo-store-select';
    userSel.title = 'Switch demo user (role)';
    userSel.style.cssText = 'font-size:12px;padding:2px 6px;border-radius:4px;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.2);color:inherit';
    global.AwestStore.getState().users.forEach(function (u) {
      var opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = u.name + ' (' + u.role + ')';
      if (u.id === global.AwestStore.getState().meta.currentUserId) opt.selected = true;
      userSel.appendChild(opt);
    });
    userSel.addEventListener('change', function () {
      global.AwestStore.setCurrentUser(userSel.value);
      location.reload();
    });

    var resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'demo-banner-link';
    resetBtn.textContent = 'Reset demo';
    resetBtn.style.cssText = 'background:none;border:none;cursor:pointer;font:inherit;color:inherit;text-decoration:underline';
    resetBtn.addEventListener('click', function () {
      if (window.confirm('Reset all demo data to seed? This clears your session changes.')) {
        global.AwestStore.resetToSeed();
        location.reload();
      }
    });

    var exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'demo-banner-link';
    exportBtn.textContent = 'Export JSON';
    exportBtn.style.cssText = resetBtn.style.cssText;
    exportBtn.addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(global.AwestStore.exportState(), null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'awest-demo-store.json';
      a.click();
    });

    wrap.appendChild(document.createTextNode('Session: '));
    wrap.appendChild(userSel);
    wrap.appendChild(resetBtn);
    wrap.appendChild(exportBtn);
    banner.style.display = 'flex';
    banner.style.flexWrap = 'wrap';
    banner.style.alignItems = 'center';
    banner.style.gap = '8px';
    banner.appendChild(wrap);
  }

  function updateUserHeader() {
    var user = global.AwestStore.getCurrentUser();
    if (!user) return;
    document.querySelectorAll('.page-header-meta > span:first-child').forEach(function (el) {
      if (!el.classList.contains('badge')) el.textContent = user.name;
    });
    document.querySelectorAll('.page-header-meta .badge').forEach(function (badge) {
      if (/Rep|Manager|Admin|Operations/.test(badge.textContent)) {
        badge.textContent = user.role;
      }
    });
  }

  function handlePendingRedirect() {
    var path = location.pathname.split('/').pop() || '';
    if (path === 'quote-detail-pending.html') {
      var id = new URLSearchParams(location.search).get('id') || 'Q-2026-0847';
      location.replace('quote-detail.html?id=' + encodeURIComponent(id));
    }
  }

  ready(function () {
    if (!global.AwestStore) return;
    document.querySelectorAll('.demo-banner-text').forEach(function (el) {
      var note = (global.AwestDummyTariff && global.AwestDummyTariff.disclaimer) || 'Tariff rates are fictional sample data.';
      if (el.textContent.indexOf('fictional') < 0) {
        el.textContent = el.textContent.replace(/\s*$/, '') + ' ' + note;
      }
    });
    global.AwestStore.load();
    handlePendingRedirect();
    injectDemoControls();
    updateUserHeader();
    global.addEventListener('awest:change', function () {
      if (global.AwestDemoHydrate && global.AwestDemoHydrate.rerun) {
        global.AwestDemoHydrate.rerun();
      }
    });
    if (global.AwestDemoHydrate) global.AwestDemoHydrate.run();
  });

  global.AwestBoot = { injectDemoControls: injectDemoControls };
})(typeof window !== 'undefined' ? window : this);
