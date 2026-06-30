/**
 * Platform consistency audit — run: node js/platform-audit.test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL:', msg);
}

var root = path.join(__dirname, '..');

global.window = global;
global.sessionStorage = {
  _data: {},
  getItem: function (k) { return this._data[k] || null; },
  setItem: function (k, v) { this._data[k] = v; },
  removeItem: function (k) { delete this._data[k]; }
};
global.localStorage = {
  _data: {},
  getItem: function (k) { return this._data[k] || null; },
  setItem: function (k, v) { this._data[k] = v; },
  removeItem: function (k) { delete this._data[k]; }
};
global.dispatchEvent = function () {};

require('./dummy-tariff-data.js');
require('./seed-data.js');
require('./mockup-catalog.js');

var seed = global.AwestSeed.build();
var catalog = global.AwestMockupCatalog;

assert(seed.meta.version === catalog.STORE_VERSION, 'seed version matches catalog STORE_VERSION');
assert(catalog.pageCount() === 58, 'catalog unique page count is 58');

var leaks = ['58.2', '56.55', '4558', 'D7,', '0.305', '0.5654', '29.10'];
function walk(dir, fn) {
  fs.readdirSync(dir).forEach(function (name) {
    if (name === 'node_modules' || name === '.git' || name === '.cursor') return;
    var p = path.join(dir, name);
    var st = fs.statSync(p);
    if (st.isDirectory()) walk(p, fn);
    else if (/\.(html|js)$/.test(name)) fn(p);
  });
}

walk(root, function (file) {
  var rel = path.relative(root, file);
  if (rel.indexOf('platform-audit.test.js') >= 0) return;
  var text = fs.readFileSync(file, 'utf8');
  leaks.forEach(function (l) {
    assert(text.indexOf(l) === -1, 'no real tariff leak "' + l + '" in ' + rel);
  });
});

var htmlFiles = [];
walk(root, function (file) {
  if (file.endsWith('.html') && path.basename(file) !== 'index.html') htmlFiles.push(file);
});

var requiredScripts = ['dummy-tariff-data.js', 'seed-data.js', 'awest-store.js', 'awest-boot.js'];
htmlFiles.forEach(function (file) {
  var rel = path.relative(root, file);
  var text = fs.readFileSync(file, 'utf8');
  requiredScripts.forEach(function (s) {
    assert(text.indexOf(s) !== -1, rel + ' includes ' + s);
  });
  var di = text.indexOf('dummy-tariff-data.js');
  var si = text.indexOf('seed-data.js');
  assert(di !== -1 && si !== -1 && di < si, rel + ' loads dummy-tariff-data before seed-data');
});

catalog.GROUPS.forEach(function (g) {
  g.items.forEach(function (item) {
    var href = item.href.split('?')[0];
    assert(fs.existsSync(path.join(root, href)), 'catalog href exists: ' + href);
  });
});

var index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(index.indexOf('wt-modules') < index.indexOf('wt-value-add'), 'index: modules before enhancements');
assert(index.indexOf('wt-value-add') < index.indexOf('wt-workflow'), 'index: enhancements before workflows');
assert(index.indexOf('wt-workflow') < index.indexOf('wt-config'), 'index: workflows before config');
assert(index.indexOf('wt-config') < index.indexOf('wt-delivery'), 'index: config before delivery');
assert(index.indexOf('wt-delivery') < index.indexOf('wt-architecture'), 'index: delivery before architecture');
assert(index.indexOf('optional value-add') === -1 && index.indexOf('optional proposal') === -1, 'index avoids optional enhancement wording');
assert(index.indexOf('Platform enhancements') !== -1, 'index mentions platform enhancements');

console.log('\nPlatform audit: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
