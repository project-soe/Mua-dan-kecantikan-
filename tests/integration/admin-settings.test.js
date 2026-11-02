import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getApps } from 'firebase-admin/app';
import { db, auth } from '../../backend/src/firebase.js';
import { createApp } from '../../backend/src/app.js';
import { makeUser, caller } from './helpers.js';

const T = 'toko-h1';
const T2 = 'toko-h2';
let server, base, seq = 0;
const call = caller(() => base);
const doc = (p) => db.doc(p);
const sku = () => `H-${Date.now().toString(36)}-${++seq}`.toUpperCase();
const exists = async (p) => (await doc(p).get()).exists;

before(async () => {
  server = createApp({ db, auth }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  await Promise.all(['hOwner', 'hAdmin', 'hContent', 'hOwner2'].map((u) => makeUser(u)));
  const seed = {
    [`tenants/${T}/profile/business`]: { brandName: 'Toko H1', legalName: 'PT Rahasia', status: 'active' },
    [`tenants/${T2}/profile/business`]: { brandName: 'Toko H2', status: 'active' },
    [`publicTenants/${T}`]: { brandName: 'Toko H1', status: 'active' },
    [`tenants/${T}/memberships/hOwner`]: { role: 'owner', status: 'active' },
    [`tenants/${T}/memberships/hAdmin`]: { role: 'admin', status: 'active' },
    [`tenants/${T}/memberships/hContent`]: { role: 'content_manager', status: 'active' },
    [`tenants/${T2}/memberships/hOwner2`]: { role: 'owner', status: 'active' },
  };
  for (const [p, d] of Object.entries(seed)) await doc(p).set(d);
});

after(async () => {
  server.closeAllConnections?.();
  server.close();
  await Promise.all(getApps().map((a) => a.delete()));
});

describe('gambar dan label brand', () => {
  const img = (n) => `tenants/${T}/branding/${n}`;
  it('owner mengatur logo, gambar utama, favicon, gaya header, tagline; proyeksi publik terisi tanpa legalName', async () => {
    const r = await call('updateBrandProfile', {
      tenantId: T, logoImage: img('logo.webp'), brandImage: img('hero.webp'), faviconImage: img('fav.png'),
      headerStyle: 'dark', tagline: 'Beauty · Makeup · Studio',
    }, 'hOwner');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const pub = (await doc(`publicTenants/${T}`).get()).data();
    assert.equal(pub.logoImage, img('logo.webp'));
    assert.equal(pub.brandImage, img('hero.webp'));
    assert.equal(pub.faviconImage, img('fav.png'));
    assert.equal(pub.headerStyle, 'dark');
    assert.equal(pub.tagline, 'Beauty · Makeup · Studio');
    assert.equal(pub.legalName, undefined);
    assert.equal((await doc(`tenants/${T}/profile/business`).get()).data().legalName, 'PT Rahasia');
  });
  it('admin boleh; content manager dan owner tenant lain ditolak', async () => {
    assert.equal((await call('updateBrandProfile', { tenantId: T, tagline: 'Baru' }, 'hAdmin')).status, 200);
    assert.equal((await call('updateBrandProfile', { tenantId: T, tagline: 'X' }, 'hContent')).status, 403);
    assert.equal((await call('updateBrandProfile', { tenantId: T, tagline: 'X' }, 'hOwner2')).status, 403);
  });
  it('path di luar folder branding tenant sendiri atau traversal ditolak', async () => {
    for (const p of [`tenants/${T2}/branding/x.webp`, `tenants/${T}/products/x.webp`, `tenants/${T}/branding/../x.webp`, 'https://jahat.example/x.png']) {
      const r = await call('updateBrandProfile', { tenantId: T, logoImage: p }, 'hOwner');
      assert.equal(r.status, 400, p);
    }
  });
  it('gaya header tidak valid dan field asing ditolak', async () => {
    assert.equal((await call('updateBrandProfile', { tenantId: T, headerStyle: 'neon' }, 'hOwner')).status, 400);
    assert.equal((await call('updateBrandProfile', { tenantId: T, status: 'active' }, 'hOwner')).status, 400);
  });
});

describe('jam toko produk', () => {
  const ok = { mon: [{ open: '09:00', close: '17:00' }], sat: [{ open: '08:00', close: '12:00' }, { open: '13:00', close: '18:00' }] };
  it('admin menyimpan; proyeksi publik dan audit terisi', async () => {
    const r = await call('updateStoreHours', { tenantId: T, weekly: ok, closedDates: ['2030-01-10', '2030-01-10'] }, 'hAdmin');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const pub = (await doc(`publicTenants/${T}`).get()).data();
    assert.equal(pub.storeHours.weekly.sat.length, 2);
    assert.equal(pub.storeHours.weekly.sun.length, 0);
    assert.deepEqual(pub.storeHours.closedDates, ['2030-01-10']);
    assert.ok(await exists(`tenants/${T}/settings/storeHours`));
    const logs = await db.collection(`tenants/${T}/auditLogs`).where('action', '==', 'updateStoreHours').get();
    assert.ok(logs.size >= 1);
  });
  it('content manager dan owner tenant lain ditolak', async () => {
    assert.equal((await call('updateStoreHours', { tenantId: T, weekly: ok }, 'hContent')).status, 403);
    assert.equal((await call('updateStoreHours', { tenantId: T, weekly: ok }, 'hOwner2')).status, 403);
  });
  it('validasi jendela jam dan tanggal', async () => {
    const bad = [
      { weekly: { mon: [{ open: '09:00', close: '12:00' }, { open: '11:00', close: '15:00' }] } },
      { weekly: { mon: [{ open: '17:00', close: '09:00' }] } },
      { weekly: { mon: [{ open: '9:00', close: '17:00' }] } },
      { weekly: { mon: [{ open: '09:10', close: '17:00' }] } },
      { weekly: { senin: [{ open: '09:00', close: '17:00' }] } },
      { weekly: ok, closedDates: ['2030-02-30'] },
      { closedDates: [] },
    ];
    for (const [i, b] of bad.entries()) {
      const r = await call('updateStoreHours', { tenantId: T, ...b }, 'hOwner');
      assert.equal(r.status, 400, `kasus ${i}: ` + JSON.stringify(r.body));
    }
  });
});

describe('hapus produk', () => {
  const mk = async (extra = {}) => {
    const s = sku();
    const r = await call('createProduct', { tenantId: T, name: 'Produk Uji', sku: s, price: 1000, ...extra }, 'hContent');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return { id: r.body.data.productId, sku: s, slug: r.body.data.slug };
  };

  it('admin menghapus draft: dokumen, kunci SKU/slug hilang, audit ada, SKU bisa dipakai lagi', async () => {
    const p = await mk();
    assert.ok(await exists(`tenants/${T}/uniqueKeys/product-sku_${p.sku}`));
    const r = await call('deleteProduct', { tenantId: T, productId: p.id }, 'hAdmin');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(await exists(`tenants/${T}/products/${p.id}`), false);
    assert.equal(await exists(`tenants/${T}/uniqueKeys/product-sku_${p.sku}`), false);
    assert.equal(await exists(`tenants/${T}/uniqueKeys/product-slug_${p.slug}`), false);
    const logs = await db.collection(`tenants/${T}/auditLogs`).where('action', '==', 'deleteProduct').get();
    assert.ok(logs.docs.some((d) => d.data().summary.sku === p.sku));
    const again = await call('createProduct', { tenantId: T, name: 'Produk Baru', sku: p.sku, price: 2000 }, 'hContent');
    assert.equal(again.status, 200, JSON.stringify(again.body));
  });
  it('owner boleh; content manager dan owner tenant lain ditolak', async () => {
    const a = await mk();
    assert.equal((await call('deleteProduct', { tenantId: T, productId: a.id }, 'hContent')).status, 403);
    assert.equal((await call('deleteProduct', { tenantId: T, productId: a.id }, 'hOwner2')).status, 403);
    assert.ok(await exists(`tenants/${T}/products/${a.id}`));
    assert.equal((await call('deleteProduct', { tenantId: T, productId: a.id }, 'hOwner')).status, 200);
  });
  it('produk yang masih terbit tidak bisa dihapus; setelah dibatalkan terbitnya bisa', async () => {
    const p = await mk({ coverImage: `tenants/${T}/products/optimized/c.webp` });
    assert.equal((await call('publishProduct', { tenantId: T, productId: p.id, published: true }, 'hContent')).status, 200);
    const blocked = await call('deleteProduct', { tenantId: T, productId: p.id }, 'hAdmin');
    assert.equal(blocked.status, 412);
    assert.equal(blocked.body.error.code, 'failed-precondition');
    assert.ok(await exists(`tenants/${T}/products/${p.id}`));
    await call('publishProduct', { tenantId: T, productId: p.id, published: false }, 'hContent');
    assert.equal((await call('deleteProduct', { tenantId: T, productId: p.id }, 'hAdmin')).status, 200);
  });
  it('produk tidak ada -> 404; tanpa login -> 401; field asing -> 400', async () => {
    assert.equal((await call('deleteProduct', { tenantId: T, productId: 'tidakada' }, 'hAdmin')).status, 404);
    assert.equal((await call('deleteProduct', { tenantId: T, productId: 'x' })).status, 401);
    assert.equal((await call('deleteProduct', { tenantId: T, productId: 'x', force: true }, 'hAdmin')).status, 400);
  });
});
