import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getApps } from 'firebase-admin/app';
import { db, auth } from '../../backend/src/firebase.js';
import { createApp } from '../../backend/src/app.js';
import { makeUser, caller } from './helpers.js';

const T = 'toko-g1';
const T2 = 'toko-g2';
const NOW = Date.UTC(2030, 0, 1, 1, 0);
let nowMs = NOW;
let server, base, seq = 0;
const call = caller(() => base);
const doc = (p) => db.doc(p);
const stock = async (id) => (await doc(`tenants/${T}/products/${id}`).get()).data().stock;
const getO = async (id) => (await doc(`tenants/${T}/orders/${id}`).get()).data();

const addr = (o = {}) => ({
  recipientName: 'Siti Aminah', phone: '081234567890', street: 'Jl. Mawar No. 1',
  city: 'Bandar Lampung', province: 'Lampung', postalCode: '35141', ...o,
});
const body = (o = {}) => ({
  tenantId: T, idempotencyKey: `key-${++seq}-${Math.random().toString(36).slice(2, 8)}`,
  items: [{ productId: 'prodA', quantity: 2 }], shippingAddress: addr(), shippingMethod: 'manual_quote', ...o,
});
const order = (user, items, o = {}) => call('createOrder', body({ items, ...o }), user);
const mk = async (user, items) => {
  const r = await order(user, items);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.data.orderId;
};

before(async () => {
  server = createApp({ db, auth, clock: () => nowMs }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const users = ['gOwner', 'gAdmin', 'gContent', 'gOwner2',
    ...Array.from({ length: 9 }, (_, i) => `gC${i + 1}`), ...Array.from({ length: 4 }, (_, i) => `gB${i + 1}`)];
  await Promise.all(users.map((u) => makeUser(u)));
  const prod = (name, sku, price, stockN, o = {}) => ({ name, sku, price, stock: stockN, published: true, variants: [], ...o });
  const seed = {
    [`tenants/${T}/profile/business`]: { brandName: 'Toko G1', status: 'active' },
    [`tenants/${T2}/profile/business`]: { brandName: 'Toko G2', status: 'active' },
    [`tenants/${T}/memberships/gOwner`]: { role: 'owner', status: 'active' },
    [`tenants/${T}/memberships/gAdmin`]: { role: 'admin', status: 'active' },
    [`tenants/${T}/memberships/gContent`]: { role: 'content_manager', status: 'active' },
    [`tenants/${T2}/memberships/gOwner2`]: { role: 'owner', status: 'active' },
    [`tenants/${T}/products/prodA`]: prod('Lipstik', 'A', 100000, 10),
    [`tenants/${T}/products/prodB`]: prod('Serum', 'B', 200000, 5, { discountPrice: 150000 }),
    [`tenants/${T}/products/prodC`]: prod('Draft', 'C', 1000, 5, { published: false }),
    [`tenants/${T}/products/prodD`]: prod('Habis', 'D', 1000, 0),
    [`tenants/${T}/products/prodE`]: prod('Terakhir', 'E', 50000, 1),
    [`tenants/${T}/products/prodF`]: prod('Batal', 'F', 70000, 10),
    [`tenants/${T}/products/prodG`]: prod('Batas', 'G', 10000, 10),
    [`tenants/${T}/products/prodH`]: prod('Dihapus', 'H', 10000, 10),
    [`tenants/${T}/products/prodI`]: prod('Dibayar', 'I', 10000, 10),
    [`tenants/${T}/products/prodJ`]: prod('Idem', 'J', 10000, 10),
  };
  for (const [p, d] of Object.entries(seed)) await doc(p).set(d);
});

after(async () => {
  server.closeAllConnections?.();
  server.close();
  await Promise.all(getApps().map((a) => a.delete()));
});

describe('createOrder', () => {
  it('tanpa login -> 401', async () => {
    assert.equal((await call('createOrder', body())).status, 401);
  });
  it('berhasil: harga promo dari database, snapshot item, stok berkurang, total belum final', async () => {
    const r = await order('gC1', [{ productId: 'prodA', quantity: 2 }, { productId: 'prodB', quantity: 1 }]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const d = r.body.data;
    assert.equal(d.orderNumber, 'ORD-000001');
    assert.equal(d.subtotal, 350000);
    assert.equal(d.shippingCost, null);
    assert.equal(d.totalAmount, null);
    assert.equal(d.orderStatus, 'pending');
    assert.equal(d.shippingStatus, 'quote_requested');
    assert.equal(d.expiresAt, new Date(NOW + 24 * 3600000).toISOString());
    assert.equal(d.items[0].unitPrice, 100000);
    assert.equal(d.items[0].lineTotal, 200000);
    assert.equal(d.items[1].unitPrice, 150000);
    assert.equal('stockBefore' in d.items[0], false);
    const o = await getO(d.orderId);
    assert.equal(o.customerId, 'gC1');
    assert.equal(o.paymentStatus, 'unpaid');
    assert.equal(o.shippingAddressSnapshot.phone, '+6281234567890');
    assert.equal(await stock('prodA'), 8);
    assert.equal(await stock('prodB'), 4);
  });
  it('harga/total dari browser ditolak; input tidak valid ditolak; stok tidak berubah', async () => {
    const cases = [
      body({ items: [{ productId: 'prodA', quantity: 1, unitPrice: 1 }] }),
      body({ totalAmount: 1 }),
      body({ items: [{ productId: 'prodA', quantity: 0 }] }),
      body({ items: [{ productId: 'prodA', quantity: 21 }] }),
      body({ items: [{ productId: 'prodA', quantity: 1.5 }] }),
      body({ items: [{ productId: 'prodA', quantity: 1 }, { productId: 'prodA', quantity: 1 }] }),
      body({ items: [] }),
      body({ shippingAddress: addr({ postalCode: 'abc' }) }),
      body({ shippingAddress: addr({ phone: '123' }) }),
      body({ shippingAddress: undefined }),
      body({ shippingMethod: 'courier' }),
      body({ idempotencyKey: 'pendek' }),
    ];
    for (const [i, b] of cases.entries()) {
      const r = await call('createOrder', b, 'gC1');
      assert.equal(r.status, 400, `kasus ${i}: ` + JSON.stringify(r.body));
    }
    assert.equal(await stock('prodA'), 8);
    assert.equal(await stock('prodB'), 4);
  });
  it('produk draft 404; stok habis atau kurang 409', async () => {
    assert.equal((await order('gC1', [{ productId: 'prodC', quantity: 1 }])).status, 404);
    assert.equal((await order('gC1', [{ productId: 'tidakada', quantity: 1 }])).status, 404);
    const empty = await order('gC1', [{ productId: 'prodD', quantity: 1 }]);
    assert.equal(empty.status, 409);
    assert.equal(empty.body.error.code, 'out-of-stock');
    assert.equal((await order('gC1', [{ productId: 'prodB', quantity: 5 }])).status, 409);
  });
  it('atomik: satu baris gagal, stok baris lain tidak berkurang', async () => {
    const r = await order('gC1', [{ productId: 'prodA', quantity: 1 }, { productId: 'prodD', quantity: 1 }]);
    assert.equal(r.status, 409);
    assert.equal(await stock('prodA'), 8);
  });
  it('4 pembeli berebut 1 unit terakhir: hanya satu berhasil, stok tidak negatif', async () => {
    const rs = await Promise.all(['gB1', 'gB2', 'gB3', 'gB4'].map((u) =>
      order(u, [{ productId: 'prodE', quantity: 1 }])));
    assert.equal(rs.filter((r) => r.status === 200).length, 1, JSON.stringify(rs.map((r) => r.body)));
    for (const r of rs.filter((x) => x.status !== 200)) {
      assert.equal(r.status, 409);
      assert.equal(r.body.error.code, 'out-of-stock');
    }
    assert.equal(await stock('prodE'), 0);
  });
  it('idempotensi: kunci sama -> pesanan sama, stok dikurangi sekali; payload beda -> 412', async () => {
    const b = body({ items: [{ productId: 'prodJ', quantity: 1 }] });
    const a1 = await call('createOrder', b, 'gC2');
    const a2 = await call('createOrder', b, 'gC2');
    assert.equal(a1.status, 200, JSON.stringify(a1.body));
    assert.equal(a2.status, 200);
    assert.equal(a1.body.data.orderId, a2.body.data.orderId);
    assert.equal(await stock('prodJ'), 9);
    const snap = await db.collection(`tenants/${T}/orders`).where('customerId', '==', 'gC2').get();
    assert.equal(snap.size, 1);
    const diff = await call('createOrder', { ...b, items: [{ productId: 'prodJ', quantity: 2 }] }, 'gC2');
    assert.equal(diff.status, 412);
    assert.equal(await stock('prodJ'), 9);
  });
  it('batas 3 pesanan menunggu per pelanggan -> 429', async () => {
    for (let i = 0; i < 3; i++) await mk('gC3', [{ productId: 'prodG', quantity: 1 }]);
    const r = await order('gC3', [{ productId: 'prodG', quantity: 1 }]);
    assert.equal(r.status, 429);
    assert.equal(r.body.error.code, 'rate-limited');
    assert.equal(await stock('prodG'), 7);
  });
  it('tenant ditangguhkan -> 403 dan stok tidak berubah', async () => {
    const p = doc(`tenants/${T}/profile/business`);
    await p.update({ status: 'suspended' });
    try {
      const before = await stock('prodA');
      const r = await order('gC9', [{ productId: 'prodA', quantity: 1 }]);
      assert.equal(r.status, 403);
      assert.equal(r.body.error.code, 'tenant-suspended');
      assert.equal(await stock('prodA'), before);
    } finally { await p.update({ status: 'active' }); }
  });
});

describe('penawaran ongkir dan persetujuan pelanggan', () => {
  it('hanya owner/admin menetapkan ongkir; total dihitung server dari subtotal', async () => {
    const id = await mk('gC1', [{ productId: 'prodA', quantity: 1 }]);
    assert.equal((await call('setOrderShippingQuote', { tenantId: T, orderId: id, shippingCost: 15000 }, 'gContent')).status, 403);
    assert.equal((await call('setOrderShippingQuote', { tenantId: T, orderId: id, shippingCost: -1 }, 'gAdmin')).status, 400);
    const r = await call('setOrderShippingQuote', { tenantId: T, orderId: id, shippingCost: 15000, shippingNotes: 'Reguler' }, 'gAdmin');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.totalAmount, 115000);
    const saved = await getO(id);
    assert.equal(saved.shippingStatus, 'quoted');
    assert.equal(saved.totalAmount, 115000);
  });
  it('hanya pemilik menerima penawaran; setelah setuju pesanan menunggu pembayaran', async () => {
    const id = await mk('gC2', [{ productId: 'prodB', quantity: 1 }]);
    await call('setOrderShippingQuote', { tenantId: T, orderId: id, shippingCost: 10000 }, 'gOwner');
    assert.equal((await call('acceptOrderShippingQuote', { tenantId: T, orderId: id }, 'gC3')).status, 404);
    const r = await call('acceptOrderShippingQuote', { tenantId: T, orderId: id }, 'gC2');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.totalAmount, 160000);
    assert.equal((await getO(id)).orderStatus, 'awaiting_payment');
    assert.equal((await call('acceptOrderShippingQuote', { tenantId: T, orderId: id }, 'gC2')).status, 412);
  });
});

describe('cancelOrder', () => {
  const cancel = (user, orderId, o = {}) => call('cancelOrder', { tenantId: T, orderId, ...o }, user);

  it('pemilik membatalkan: stok kembali; orang lain 404; batal dua kali 412', async () => {
    const s0 = await stock('prodF');
    const id = await mk('gC4', [{ productId: 'prodF', quantity: 3 }]);
    assert.equal(await stock('prodF'), s0 - 3);
    assert.equal((await cancel('gC5', id)).status, 404);
    assert.equal((await cancel('gContent', id)).status, 404);
    assert.equal(await stock('prodF'), s0 - 3);
    const r = await cancel('gC4', id, { reason: 'salah pilih' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(await stock('prodF'), s0);
    const o = await getO(id);
    assert.equal(o.orderStatus, 'cancelled');
    assert.equal(o.cancelReason, 'salah pilih');
    assert.equal((await cancel('gC4', id)).status, 412);
    assert.equal(await stock('prodF'), s0);
  });
  it('admin boleh membatalkan pesanan pelanggan', async () => {
    const s0 = await stock('prodF');
    const id = await mk('gC6', [{ productId: 'prodF', quantity: 2 }]);
    assert.equal((await cancel('gAdmin', id)).status, 200);
    assert.equal(await stock('prodF'), s0);
  });
  it('pesanan yang sudah dibayar tidak bisa dibatalkan sendiri -> 412', async () => {
    const id = await mk('gC7', [{ productId: 'prodI', quantity: 1 }]);
    await doc(`tenants/${T}/orders/${id}`).update({ orderStatus: 'paid' });
    const r = await cancel('gC7', id);
    assert.equal(r.status, 412);
    assert.equal(await stock('prodI'), 9);
  });
  it('produk sudah dihapus: pembatalan tetap berhasil', async () => {
    const id = await mk('gC8', [{ productId: 'prodH', quantity: 1 }]);
    await doc(`tenants/${T}/products/prodH`).delete();
    assert.equal((await cancel('gC8', id)).status, 200);
  });
  it('tanpa login -> 401', async () => {
    assert.equal((await call('cancelOrder', { tenantId: T, orderId: 'x' })).status, 401);
  });
});

describe('expireStaleOrders', () => {
  const sweep = (user) => call('expireStaleOrders', { tenantId: T }, user);

  it('hanya admin/owner; belum lewat waktu -> tidak ada yang kedaluwarsa', async () => {
    assert.equal((await sweep('gC1')).status, 403);
    assert.equal((await sweep('gContent')).status, 403);
    assert.equal((await sweep('gOwner2')).status, 403);
    const r = await sweep('gAdmin');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.expired, 0);
  });
  it('lewat 24 jam: pesanan dibatalkan dan stok kembali; sapuan kedua tidak menemukan apa pun', async () => {
    const s0 = await stock('prodF');
    const id = await mk('gC9', [{ productId: 'prodF', quantity: 2 }]);
    assert.equal(await stock('prodF'), s0 - 2);
    assert.equal((await getO(id)).orderStatus, 'pending');

    nowMs = NOW + 25 * 3600000;
    const r = await sweep('gOwner');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.data.expired >= 1);
    const o = await getO(id);
    assert.equal(o.orderStatus, 'cancelled');
    assert.equal(o.cancelReason, 'expired');
    assert.equal(await stock('prodF'), s0);
    assert.equal((await sweep('gOwner')).body.data.expired, 0);
  });
});
