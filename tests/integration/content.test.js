import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getApps } from 'firebase-admin/app';
import { db, auth } from '../../backend/src/firebase.js';
import { createApp } from '../../backend/src/app.js';
import { makeUser, caller } from './helpers.js';

const T = 'toko-c1';
const T2 = 'toko-c2';
let server, base;
const call = caller(() => base);

let seq = 0;
const sku = () => `SKU-${Date.now().toString(36)}-${++seq}`.toUpperCase();
const img = (n) => `tenants/${T}/products/originals/${n}.png`;
const prodDoc = (id) => db.doc(`tenants/${T}/products/${id}`);

async function mk(extra = {}) {
  const r = await call('createProduct',
    { tenantId: T, name: 'Lipstik Rose', sku: sku(), price: 100000, stock: 10, ...extra }, 'cContent');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.data.productId;
}

before(async () => {
  server = createApp({ db, auth }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  await Promise.all(['cOwner', 'cAdmin', 'cContent', 'cFinance', 'cOutsider', 'cOwnerB'].map((u) => makeUser(u)));

  const seed = {
    [`tenants/${T}/profile/business`]: { brandName: 'Toko C1', legalName: 'PT Rahasia', status: 'active' },
    [`tenants/${T2}/profile/business`]: { brandName: 'Toko C2', status: 'active' },
    [`publicTenants/${T}`]: { brandName: 'Toko C1', status: 'active' },
    [`tenants/${T}/memberships/cOwner`]: { role: 'owner', status: 'active' },
    [`tenants/${T}/memberships/cAdmin`]: { role: 'admin', status: 'active' },
    [`tenants/${T}/memberships/cContent`]: { role: 'content_manager', status: 'active' },
    [`tenants/${T}/memberships/cFinance`]: { role: 'finance_manager', status: 'active' },
    [`tenants/${T2}/memberships/cOwnerB`]: { role: 'owner', status: 'active' },
    [`tenants/${T}/productCategories/makeup`]: { name: 'Makeup' },
  };
  for (const [p, d] of Object.entries(seed)) await db.doc(p).set(d);
});

after(async () => {
  server.closeAllConnections?.();
  server.close();
  await Promise.all(getApps().map((a) => a.delete()));
});

describe('updateBrandProfile', () => {
  it('owner berhasil; proyeksi publik terbarui tanpa legalName; ada audit log', async () => {
    const r = await call('updateBrandProfile',
      { tenantId: T, brandName: 'Toko C1 Baru', tagline: 'Cantik setiap hari', logoUrl: 'https://cdn.example/logo.png' }, 'cOwner');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const profile = (await db.doc(`tenants/${T}/profile/business`).get()).data();
    assert.equal(profile.brandName, 'Toko C1 Baru');
    assert.equal(profile.legalName, 'PT Rahasia');
    const pub = (await db.doc(`publicTenants/${T}`).get()).data();
    assert.equal(pub.brandName, 'Toko C1 Baru');
    assert.equal(pub.legalName, undefined);
    const logs = await db.collection(`tenants/${T}/auditLogs`).where('action', '==', 'updateBrandProfile').get();
    assert.ok(logs.size >= 1);
  });
  it('content manager ditolak', async () => {
    const r = await call('updateBrandProfile', { tenantId: T, brandName: 'Coba' }, 'cContent');
    assert.equal(r.status, 403);
  });
  it('owner tenant lain ditolak', async () => {
    const r = await call('updateBrandProfile', { tenantId: T, brandName: 'Coba' }, 'cOwnerB');
    assert.equal(r.status, 403);
  });
  it('logo http, field tak dikenal, dan update kosong ditolak', async () => {
    assert.equal((await call('updateBrandProfile', { tenantId: T, logoUrl: 'http://x.com/a.png' }, 'cOwner')).status, 400);
    assert.equal((await call('updateBrandProfile', { tenantId: T, status: 'active' }, 'cOwner')).status, 400);
    assert.equal((await call('updateBrandProfile', { tenantId: T }, 'cOwner')).status, 400);
  });
});

describe('createProduct', () => {
  it('content manager membuat draft', async () => {
    const r = await call('createProduct',
      { tenantId: T, name: 'Lipstik Rose', sku: 'abc-1' + sku(), price: 100000, stock: 5, categoryId: 'makeup' }, 'cContent');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.productStatus, 'draft');
    assert.match(r.body.data.slug, /^[a-z0-9-]+$/);
    const d = (await prodDoc(r.body.data.productId).get()).data();
    assert.equal(d.published, false);
    assert.equal(d.stock, 5);
    assert.equal(d.sku, d.sku.toUpperCase());
    assert.ok(d.createdAt);
  });
  it('finance manager dan non-anggota ditolak', async () => {
    const body = { tenantId: T, name: 'X Produk', sku: sku(), price: 1000 };
    assert.equal((await call('createProduct', body, 'cFinance')).status, 403);
    assert.equal((await call('createProduct', body, 'cOutsider')).status, 403);
  });
  it('owner tenant lain tidak bisa membuat produk di tenant ini', async () => {
    const r = await call('createProduct', { tenantId: T, name: 'X Produk', sku: sku(), price: 1000 }, 'cOwnerB');
    assert.equal(r.status, 403);
  });
  it('SKU ganda (tanpa peduli huruf besar/kecil) -> 409 already-exists', async () => {
    const s = sku();
    assert.equal((await call('createProduct', { tenantId: T, name: 'Satu Produk', sku: s, price: 1000 }, 'cAdmin')).status, 200);
    const r = await call('createProduct', { tenantId: T, name: 'Dua Produk', sku: s.toLowerCase(), price: 1000 }, 'cAdmin');
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'already-exists');
  });
  it('pembuatan paralel dengan SKU sama hanya menghasilkan satu produk', async () => {
    const s = sku();
    const rs = await Promise.all([1, 2, 3, 4].map((i) =>
      call('createProduct', { tenantId: T, name: 'Paralel ' + i, sku: s, price: 1000 }, 'cAdmin')));
    assert.equal(rs.filter((r) => r.status === 200).length, 1);
    const snap = await db.collection(`tenants/${T}/products`).where('sku', '==', s).get();
    assert.equal(snap.size, 1);
  });
  it('validasi harga dan stok', async () => {
    const base = { tenantId: T, name: 'Valid Produk' };
    assert.equal((await call('createProduct', { ...base, sku: sku(), price: -1 }, 'cAdmin')).status, 400);
    assert.equal((await call('createProduct', { ...base, sku: sku(), price: 10.5 }, 'cAdmin')).status, 400);
    assert.equal((await call('createProduct', { ...base, sku: sku(), price: 1000, stock: -1 }, 'cAdmin')).status, 400);
    assert.equal((await call('createProduct', { ...base, sku: sku(), price: 1000, discountPrice: 2000 }, 'cAdmin')).status, 400);
  });
  it('field published/tak dikenal ditolak', async () => {
    const r = await call('createProduct', { tenantId: T, name: 'Valid Produk', sku: sku(), price: 1000, published: true }, 'cAdmin');
    assert.equal(r.status, 400);
  });
  it('gambar dari folder tenant lain ditolak', async () => {
    const r = await call('createProduct', { tenantId: T, name: 'Valid Produk', sku: sku(), price: 1000,
      coverImage: `tenants/${T2}/products/originals/x.png` }, 'cAdmin');
    assert.equal(r.status, 400);
  });
  it('kategori tidak ada -> 404', async () => {
    const r = await call('createProduct', { tenantId: T, name: 'Valid Produk', sku: sku(), price: 1000, categoryId: 'tidak-ada' }, 'cAdmin');
    assert.equal(r.status, 404);
    assert.equal(r.body.error.code, 'resource-not-found');
  });
});

describe('updateProduct', () => {
  it('harga baru tidak boleh di bawah harga promo yang ada', async () => {
    const id = await mk({ discountPrice: 50000 });
    const r = await call('updateProduct', { tenantId: T, productId: id, price: 40000 }, 'cContent');
    assert.equal(r.status, 400);
  });
  it('ubah nama tidak mengubah slug', async () => {
    const id = await mk();
    const before = (await prodDoc(id).get()).data().slug;
    const r = await call('updateProduct', { tenantId: T, productId: id, name: 'Nama Baru Sekali' }, 'cContent');
    assert.equal(r.status, 200);
    const d = (await prodDoc(id).get()).data();
    assert.equal(d.name, 'Nama Baru Sekali');
    assert.equal(d.slug, before);
  });
  it('ganti SKU: bentrok -> 409; SKU lama dibebaskan', async () => {
    const a = sku(); const b = sku();
    const idA = await mk({ sku: a });
    await mk({ sku: b });
    const clash = await call('updateProduct', { tenantId: T, productId: idA, sku: b }, 'cContent');
    assert.equal(clash.status, 409);
    const c = sku();
    assert.equal((await call('updateProduct', { tenantId: T, productId: idA, sku: c }, 'cContent')).status, 200);
    const reuse = await call('createProduct', { tenantId: T, name: 'Pakai Lama', sku: a, price: 1000 }, 'cContent');
    assert.equal(reuse.status, 200, JSON.stringify(reuse.body));
  });
  it('produk tidak ada -> 404; update kosong -> 400', async () => {
    assert.equal((await call('updateProduct', { tenantId: T, productId: 'tidakada', name: 'Xx' }, 'cContent')).status, 404);
    const id = await mk();
    assert.equal((await call('updateProduct', { tenantId: T, productId: id }, 'cContent')).status, 400);
  });
});

describe('updateProductStock', () => {
  it('tambah stok; stok tidak boleh negatif', async () => {
    const id = await mk({ stock: 2 });
    const up = await call('updateProductStock', { tenantId: T, productId: id, delta: 5, reason: 'restock' }, 'cAdmin');
    assert.equal(up.status, 200);
    assert.equal(up.body.data.stock, 7);
    const down = await call('updateProductStock', { tenantId: T, productId: id, delta: -100 }, 'cAdmin');
    assert.equal(down.status, 409);
    assert.equal(down.body.error.code, 'out-of-stock');
    assert.equal((await prodDoc(id).get()).data().stock, 7);
  });
  it('content manager ditolak; delta 0 ditolak', async () => {
    const id = await mk();
    assert.equal((await call('updateProductStock', { tenantId: T, productId: id, delta: 1 }, 'cContent')).status, 403);
    assert.equal((await call('updateProductStock', { tenantId: T, productId: id, delta: 0 }, 'cAdmin')).status, 400);
  });
  it('pengurangan paralel tidak membuat stok negatif', async () => {
    const id = await mk({ stock: 10 });
    const rs = await Promise.all(Array.from({ length: 5 }, () =>
      call('updateProductStock', { tenantId: T, productId: id, delta: -3 }, 'cAdmin')));
    const ok = rs.filter((r) => r.status === 200).length;
    const final = (await prodDoc(id).get()).data().stock;
    assert.ok(final >= 0);
    assert.ok(ok <= 3);
    assert.equal(final, 10 - 3 * ok);
  });
});

describe('publishProduct', () => {
  it('tanpa coverImage -> 412 failed-precondition', async () => {
    const id = await mk();
    const r = await call('publishProduct', { tenantId: T, productId: id, published: true }, 'cContent');
    assert.equal(r.status, 412);
    assert.equal(r.body.error.code, 'failed-precondition');
  });
  it('dengan coverImage: publish lalu unpublish', async () => {
    const id = await mk({ coverImage: img('cover') });
    assert.equal((await call('publishProduct', { tenantId: T, productId: id, published: true }, 'cContent')).status, 200);
    assert.equal((await prodDoc(id).get()).data().published, true);
    assert.equal((await call('publishProduct', { tenantId: T, productId: id, published: false }, 'cContent')).status, 200);
    assert.equal((await prodDoc(id).get()).data().published, false);
  });
});

describe('tenant suspended', () => {
  it('anggota -> tenant-suspended; non-anggota tetap permission-denied', async () => {
    const profile = db.doc(`tenants/${T}/profile/business`);
    await profile.update({ status: 'suspended' });
    try {
      const body = { tenantId: T, name: 'Saat Suspend', sku: sku(), price: 1000 };
      const m = await call('createProduct', body, 'cOwner');
      assert.equal(m.status, 403);
      assert.equal(m.body.error.code, 'tenant-suspended');
      const o = await call('createProduct', body, 'cOutsider');
      assert.equal(o.status, 403);
      assert.equal(o.body.error.code, 'permission-denied');
      assert.equal((await call('updateBrandProfile', { tenantId: T, brandName: 'Coba' }, 'cOwner')).status, 403);
    } finally {
      await profile.update({ status: 'active' });
    }
  });
});
