import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getApps } from 'firebase-admin/app';
import { db, auth } from '../../backend/src/firebase.js';
import { createApp } from '../../backend/src/app.js';
import { makeUser, caller } from './helpers.js';

const T = 'toko-j1';
const T2 = 'toko-j2';
let server, base;
const call = caller(() => base);
const doc = (p) => db.doc(p);
const ok = { tenantId: T, clientName: 'Siti Aminah', rating: 5, quote: 'Hasil riasnya rapi dan tahan seharian penuh.' };
const mk = async (extra = {}) => {
  const r = await call('createReview', { ...ok, ...extra }, 'jContent');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.data.reviewId;
};
const get = async (id) => (await doc(`tenants/${T}/reviews/${id}`).get()).data();

before(async () => {
  server = createApp({ db, auth }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  await Promise.all(['jOwner', 'jAdmin', 'jContent', 'jFinance', 'jOwner2'].map((u) => makeUser(u)));
  const seed = {
    [`tenants/${T}/profile/business`]: { brandName: 'Toko J1', status: 'active' },
    [`tenants/${T2}/profile/business`]: { brandName: 'Toko J2', status: 'active' },
    [`tenants/${T}/memberships/jOwner`]: { role: 'owner', status: 'active' },
    [`tenants/${T}/memberships/jAdmin`]: { role: 'admin', status: 'active' },
    [`tenants/${T}/memberships/jContent`]: { role: 'content_manager', status: 'active' },
    [`tenants/${T}/memberships/jFinance`]: { role: 'finance_manager', status: 'active' },
    [`tenants/${T2}/memberships/jOwner2`]: { role: 'owner', status: 'active' },
    [`tenants/${T}/serviceCategories/bridal`]: { name: 'Pengantin' },
  };
  for (const [p, d] of Object.entries(seed)) await doc(p).set(d);
});

after(async () => {
  server.closeAllConnections?.();
  server.close();
  await Promise.all(getApps().map((a) => a.delete()));
});

describe('membuat testimoni', () => {
  it('content manager membuat draft dengan nilai bawaan', async () => {
    const id = await mk({ categoryId: 'bridal', eventLabel: 'Akad dan resepsi', source: 'WhatsApp' });
    const d = await get(id);
    assert.equal(d.published, false);
    assert.equal(d.consentConfirmed, false);
    assert.equal(d.featured, false);
    assert.equal(d.sortOrder, 0);
    assert.equal(d.publishedAt, null);
    assert.equal(d.clientName, 'Siti Aminah');
  });
  it('validasi: penilaian, panjang kutipan, nama, foto, field asing', async () => {
    const cases = [
      { rating: 0 }, { rating: 6 }, { rating: 4.5 }, { quote: 'terlalu pendek' }, { clientName: 'A' },
      { photo: `tenants/${T2}/reviews/x.webp` }, { photo: `tenants/${T}/products/x.webp` }, { photo: `tenants/${T}/reviews/../x.webp` },
      { published: true },
    ];
    for (const [i, c] of cases.entries()) {
      const r = await call('createReview', { ...ok, ...c }, 'jContent');
      assert.equal(r.status, 400, `kasus ${i}: ` + JSON.stringify(r.body));
    }
  });
  it('kategori tidak ada -> 404; foto di folder tenant sendiri diterima', async () => {
    assert.equal((await call('createReview', { ...ok, categoryId: 'tidak-ada' }, 'jContent')).status, 404);
    const id = await mk({ photo: `tenants/${T}/reviews/a.webp` });
    assert.equal((await get(id)).photo, `tenants/${T}/reviews/a.webp`);
  });
  it('finance manager dan owner tenant lain ditolak; tanpa login 401', async () => {
    assert.equal((await call('createReview', ok, 'jFinance')).status, 403);
    assert.equal((await call('createReview', ok, 'jOwner2')).status, 403);
    assert.equal((await call('createReview', ok)).status, 401);
  });
});

describe('menerbitkan testimoni', () => {
  it('wajib ada izin klien; setelah itu terbit dan bisa dibatalkan', async () => {
    const id = await mk();
    const no = await call('publishReview', { tenantId: T, reviewId: id, published: true }, 'jContent');
    assert.equal(no.status, 412);
    assert.equal(no.body.error.code, 'failed-precondition');
    assert.equal((await call('updateReview', { tenantId: T, reviewId: id, consentConfirmed: true }, 'jContent')).status, 200);
    assert.equal((await call('publishReview', { tenantId: T, reviewId: id, published: true }, 'jContent')).status, 200);
    const d = await get(id);
    assert.equal(d.published, true);
    assert.ok(d.publishedAt);
    assert.equal((await call('publishReview', { tenantId: T, reviewId: id, published: false }, 'jContent')).status, 200);
    assert.equal((await get(id)).publishedAt, null);
  });
  it('izin tidak bisa dicabut saat masih terbit', async () => {
    const id = await mk({ consentConfirmed: true });
    await call('publishReview', { tenantId: T, reviewId: id, published: true }, 'jContent');
    assert.equal((await call('updateReview', { tenantId: T, reviewId: id, consentConfirmed: false }, 'jContent')).status, 412);
    await call('publishReview', { tenantId: T, reviewId: id, published: false }, 'jContent');
    assert.equal((await call('updateReview', { tenantId: T, reviewId: id, consentConfirmed: false }, 'jContent')).status, 200);
  });
  it('mengubah isi; update kosong 400; tidak ada 404', async () => {
    const id = await mk();
    const r = await call('updateReview', { tenantId: T, reviewId: id, rating: 4, featured: true, sortOrder: 2 }, 'jContent');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const d = await get(id);
    assert.equal(d.rating, 4);
    assert.equal(d.featured, true);
    assert.equal((await call('updateReview', { tenantId: T, reviewId: id }, 'jContent')).status, 400);
    assert.equal((await call('updateReview', { tenantId: T, reviewId: 'tidakada', rating: 3 }, 'jContent')).status, 404);
  });
});

describe('menghapus testimoni', () => {
  it('admin boleh menghapus, termasuk yang sudah terbit; audit tanpa isi testimoni', async () => {
    const id = await mk({ consentConfirmed: true, quote: 'Kutipan rahasia klien untuk uji audit log.' });
    await call('publishReview', { tenantId: T, reviewId: id, published: true }, 'jContent');
    const r = await call('deleteReview', { tenantId: T, reviewId: id }, 'jAdmin');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await doc(`tenants/${T}/reviews/${id}`).get()).exists, false);
    const logs = await db.collection(`tenants/${T}/auditLogs`).where('resourceId', '==', id).get();
    assert.ok(logs.size >= 2);
    assert.ok(!JSON.stringify(logs.docs.map((d) => d.data())).includes('rahasia'));
  });
  it('content manager dan owner tenant lain ditolak; tidak ada -> 404', async () => {
    const id = await mk();
    assert.equal((await call('deleteReview', { tenantId: T, reviewId: id }, 'jContent')).status, 403);
    assert.equal((await call('deleteReview', { tenantId: T, reviewId: id }, 'jOwner2')).status, 403);
    assert.equal((await call('deleteReview', { tenantId: T, reviewId: 'tidakada' }, 'jOwner')).status, 404);
    assert.ok((await doc(`tenants/${T}/reviews/${id}`).get()).exists);
  });
});
