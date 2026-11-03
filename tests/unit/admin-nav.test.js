import test from 'node:test';
import assert from 'node:assert/strict';
import { TABS, tabsFor, defaultTab, groupTabs } from '../../public/assets/js/admin-nav.js';

const keys = (role) => tabsFor(role).map((t) => t.key);

test('menu per peran', () => {
  assert.deepEqual(keys('owner'), ['booking', 'pembayaran', 'produk', 'layanan', 'portfolio', 'brand', 'jam', 'metode']);
  assert.deepEqual(keys('admin'), ['booking', 'produk', 'layanan', 'portfolio', 'brand', 'jam']);
  assert.deepEqual(keys('content_manager'), ['booking', 'produk', 'layanan', 'portfolio']);
  assert.deepEqual(keys('finance_manager'), ['booking', 'pembayaran', 'metode']);
  assert.deepEqual(keys('customer'), []);
  assert.deepEqual(keys(undefined), []);
});
test('tab awal', () => {
  assert.equal(defaultTab('finance_manager'), 'pembayaran');
  assert.equal(defaultTab('owner'), 'booking');
  assert.equal(defaultTab('content_manager'), 'booking');
  assert.equal(defaultTab('customer'), null);
});
test('kelompok menu berurutan dan tanpa duplikat', () => {
  const g = groupTabs(tabsFor('owner'));
  assert.deepEqual(g.map((x) => x.group), ['Operasional', 'Katalog', 'Pengaturan']);
  assert.deepEqual(g[2].tabs.map((t) => t.key), ['brand', 'jam', 'metode']);
  assert.equal(new Set(TABS.map((t) => t.key)).size, TABS.length);
  assert.ok(TABS.every((t) => t.title && t.desc && t.label));
});
