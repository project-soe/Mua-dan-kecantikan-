import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getApps } from 'firebase-admin/app';
import { db, auth } from '../../backend/src/firebase.js';
import { createApp } from '../../backend/src/app.js';
import { makeUser, caller } from './helpers.js';

const T = 'toko-d1';
const T2 = 'toko-d2';
let server, base;
const call = caller(() => base);
const svcImg = (n) => `tenants/${T}/services/${n}.png`;
const pfImg = (n) => `tenants/${T}/portfolio/originals/${n}.png`;
const doc = (p) => db.doc(p);

before(async () => {
  server = createApp({ db, auth }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  await Promise.all(['dOwner', 'dContent', 'dFinance', 'dOwner2', 'dOutsider'].map((u) => makeUser(u)));
  const seed = {
    [`tenants/${T}/profile/business`]: { brandName: 'Toko D1', status: 'active' },
    [`tenants/${T2}/profile/business`]: { brandName: 'Toko D2', status: 'active' },
    [`tenants/${T}/memberships/dOwner`]: { role: 'owner', status: 'active' },
    [`tenants/${T}/memberships/dContent`]: { role: 'content_manager', status: 'active' },
    [`tenants/${T}/memberships/dFinance`]: { role: 'finance_manager', status: 'active' },
    [`tenants/${T2}/memberships/dOwner2`]: { role: 'owner', status: 'active' },
  };
  for (const [p, d] of Object.entries(seed)) await doc(p).set(d);
});

after(async () => {
  server.closeAllConnections?.();
  server.close();
  await Promise.all(getApps().map((a) => a.delete()));
});

describe('kategori', () => {
  it('buat kategori layanan; nama kembar -> 409', async () => {
    const r = await call('createCategory', { tenantId: T, kind: 'service', name: 'Bridal' }, 'dContent');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.categoryId, 'bridal');
    assert.ok((await doc(`tenants/${T}/serviceCategories/bridal`).get()).exists);
    const dup = await call('createCategory', { tenantId: T, kind: 'service', name: 'Bridal' }, 'dContent');
    assert.equal(dup.status, 409);
  });
  it('kind tidak valid -> 400; finance dan tenant lain -> 403', async () => {
    assert.equal((await call('createCategory', { tenantId: T, kind: 'lain', name: 'Xx' }, 'dContent')).status, 400);
    assert.equal((await call('createCategory', { tenantId: T, kind: 'service', name: 'Xx' }, 'dFinance')).status, 403);
    assert.equal((await call('createCategory', { tenantId: T, kind: 'service', name: 'Xx' }, 'dOwner2')).status, 403);
  });
  it('update kategori; kategori tidak ada -> 404', async () => {
    const ok = await call('updateCategory', { tenantId: T, kind: 'service', categoryId: 'bridal', name: 'Bridal Makeup', sortOrder: 2 }, 'dContent');
    assert.equal(ok.status, 200);
    assert.equal((await doc(`tenants/${T}/serviceCategories/bridal`).get()).data().name, 'Bridal Makeup');
    const nf = await call('updateCategory', { tenantId: T, kind: 'service', categoryId: 'tidak-ada', name: 'Xx' }, 'dContent');
    assert.equal(nf.status, 404);
  });
});

describe('layanan', () => {
  const base = { tenantId: T, name: 'Bridal Makeup Akad', price: 2500000, durationMinutes: 180 };

  it('membuat draft dengan nilai default', async () => {
    const r = await call('createService', { ...base, categoryId: 'bridal', depositAmount: 500000 }, 'dContent');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const d = (await doc(`tenants/${T}/services/${r.body.data.serviceId}`).get()).data();
    assert.equal(d.published, false);
    assert.equal(d.locationMode, 'studio');
    assert.equal(d.bookingEnabled, true);
    assert.equal(d.preparationTimeMinutes, 0);
    assert.equal(d.depositAmount, 500000);
  });
  it('validasi: deposit > harga, durasi, lokasi, kategori, gambar tenant lain', async () => {
    assert.equal((await call('createService', { ...base, depositAmount: 3000000 }, 'dContent')).status, 400);
    assert.equal((await call('createService', { ...base, durationMinutes: 5 }, 'dContent')).status, 400);
    assert.equal((await call('createService', { ...base, locationMode: 'rumah' }, 'dContent')).status, 400);
    assert.equal((await call('createService', { ...base, categoryId: 'tidak-ada' }, 'dContent')).status, 404);
    assert.equal((await call('createService', { ...base, coverImage: `tenants/${T2}/services/x.png` }, 'dContent')).status, 400);
    assert.equal((await call('createService', { ...base, published: true }, 'dContent')).status, 400);
  });
  it('finance dan tenant lain ditolak', async () => {
    assert.equal((await call('createService', base, 'dFinance')).status, 403);
    assert.equal((await call('createService', base, 'dOwner2')).status, 403);
    assert.equal((await call('createService', base, 'dOutsider')).status, 403);
  });
  it('nama sama secara paralel tetap menghasilkan slug unik', async () => {
    const rs = await Promise.all([1, 2, 3].map(() =>
      call('createService', { ...base, name: 'Layanan Kembar' }, 'dContent')));
    const ok = rs.filter((r) => r.status === 200);
    assert.equal(ok.length, 3, JSON.stringify(rs.map((r) => r.body)));
    assert.equal(new Set(ok.map((r) => r.body.data.slug)).size, 3);
  });
  it('update: deposit dicek terhadap harga yang ada', async () => {
    const c = await call('createService', { ...base, name: 'Layanan Update', depositAmount: 1000000 }, 'dContent');
    const id = c.body.data.serviceId;
    const r = await call('updateService', { tenantId: T, serviceId: id, price: 500000 }, 'dContent');
    assert.equal(r.status, 400);
    const ok = await call('updateService', { tenantId: T, serviceId: id, price: 3000000, bookingEnabled: false }, 'dContent');
    assert.equal(ok.status, 200);
    assert.equal((await doc(`tenants/${T}/services/${id}`).get()).data().bookingEnabled, false);
    assert.equal((await call('updateService', { tenantId: T, serviceId: 'tidakada', price: 1 }, 'dContent')).status, 404);
  });
  it('publish butuh coverImage; lalu unpublish', async () => {
    const c = await call('createService', { ...base, name: 'Layanan Publish' }, 'dContent');
    const id = c.body.data.serviceId;
    const no = await call('publishService', { tenantId: T, serviceId: id, published: true }, 'dContent');
    assert.equal(no.status, 412);
    await call('updateService', { tenantId: T, serviceId: id, coverImage: svcImg('cover') }, 'dContent');
    assert.equal((await call('publishService', { tenantId: T, serviceId: id, published: true }, 'dContent')).status, 200);
    assert.equal((await doc(`tenants/${T}/services/${id}`).get()).data().published, true);
    assert.equal((await call('publishService', { tenantId: T, serviceId: id, published: false }, 'dContent')).status, 200);
  });
});

describe('portfolio', () => {
  const base = { tenantId: T, title: 'Soft Glam Akad' };
  const mk = async (extra = {}) => {
    const r = await call('createPortfolio', { ...base, ...extra }, 'dContent');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.data.portfolioId;
  };

  it('membuat draft; consent default false', async () => {
    const r = await call('createPortfolio', { ...base, modelName: 'Sari', categoryId: 'bridal' }, 'dContent');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const d = (await doc(`tenants/${T}/portfolio/${r.body.data.portfolioId}`).get()).data();
    assert.equal(d.published, false);
    assert.equal(d.consentConfirmed, false);
    assert.deepEqual(d.gallery, []);
    assert.equal(d.publishedAt, null);
  });
  it('slug kembar diberi akhiran; tenant lain dan finance ditolak', async () => {
    const a = await call('createPortfolio', { ...base, title: 'Judul Sama' }, 'dContent');
    const b = await call('createPortfolio', { ...base, title: 'Judul Sama' }, 'dContent');
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    assert.notEqual(a.body.data.slug, b.body.data.slug);
    assert.equal((await call('createPortfolio', base, 'dFinance')).status, 403);
    assert.equal((await call('createPortfolio', base, 'dOwner2')).status, 403);
  });
  it('publish ditolak tanpa cover atau tanpa persetujuan model', async () => {
    const id = await mk();
    assert.equal((await call('publishPortfolio', { tenantId: T, portfolioId: id, published: true }, 'dContent')).status, 412);
    await call('updatePortfolio', { tenantId: T, portfolioId: id, coverImage: pfImg('c') }, 'dContent');
    const r = await call('publishPortfolio', { tenantId: T, portfolioId: id, published: true }, 'dContent');
    assert.equal(r.status, 412);
    assert.match(r.body.error.message, /persetujuan/i);
  });
  it('before tanpa after ditolak; lengkap berhasil dan mengisi publishedAt', async () => {
    const id = await mk({ coverImage: pfImg('c'), consentConfirmed: true, beforeImage: pfImg('b') });
    assert.equal((await call('publishPortfolio', { tenantId: T, portfolioId: id, published: true }, 'dContent')).status, 412);
    await call('updatePortfolio', { tenantId: T, portfolioId: id, afterImage: pfImg('a') }, 'dContent');
    const ok = await call('publishPortfolio', { tenantId: T, portfolioId: id, published: true }, 'dContent');
    assert.equal(ok.status, 200);
    const d = (await doc(`tenants/${T}/portfolio/${id}`).get()).data();
    assert.equal(d.published, true);
    assert.ok(d.publishedAt);
  });
  it('persetujuan tidak bisa dicabut saat terpublikasi', async () => {
    const id = await mk({ coverImage: pfImg('c'), consentConfirmed: true });
    await call('publishPortfolio', { tenantId: T, portfolioId: id, published: true }, 'dContent');
    const r = await call('updatePortfolio', { tenantId: T, portfolioId: id, consentConfirmed: false }, 'dContent');
    assert.equal(r.status, 412);
    await call('publishPortfolio', { tenantId: T, portfolioId: id, published: false }, 'dContent');
    assert.equal((await call('updatePortfolio', { tenantId: T, portfolioId: id, consentConfirmed: false }, 'dContent')).status, 200);
  });
  it('gambar dari folder tenant lain ditolak; featured & sortOrder bisa diubah', async () => {
    assert.equal((await call('createPortfolio', { ...base, coverImage: `tenants/${T2}/portfolio/x.png` }, 'dContent')).status, 400);
    const id = await mk();
    const r = await call('updatePortfolio', { tenantId: T, portfolioId: id, featured: true, sortOrder: 5 }, 'dContent');
    assert.equal(r.status, 200);
    const d = (await doc(`tenants/${T}/portfolio/${id}`).get()).data();
    assert.equal(d.featured, true);
    assert.equal(d.sortOrder, 5);
  });
});
