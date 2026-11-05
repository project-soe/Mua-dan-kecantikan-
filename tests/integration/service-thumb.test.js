import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getApps } from 'firebase-admin/app';
import { db, auth } from '../../backend/src/firebase.js';
import { createApp } from '../../backend/src/app.js';
import { makeUser, caller } from './helpers.js';

const T = 'toko-i1';
const T2 = 'toko-i2';
let server, base;
const call = caller(() => base);
const svc = { tenantId: T, name: 'Bridal Makeup', price: 2500000, durationMinutes: 180 };
const img = (t, n) => `tenants/${t}/services/${n}`;

before(async () => {
  server = createApp({ db, auth }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  await Promise.all(['iContent', 'iOwner2'].map((u) => makeUser(u)));
  const seed = {
    [`tenants/${T}/profile/business`]: { brandName: 'Toko I1', status: 'active' },
    [`tenants/${T2}/profile/business`]: { brandName: 'Toko I2', status: 'active' },
    [`tenants/${T}/memberships/iContent`]: { role: 'content_manager', status: 'active' },
    [`tenants/${T2}/memberships/iOwner2`]: { role: 'owner', status: 'active' },
  };
  for (const [p, d] of Object.entries(seed)) await db.doc(p).set(d);
});

after(async () => {
  server.closeAllConnections?.();
  server.close();
  await Promise.all(getApps().map((a) => a.delete()));
});

describe('thumbnail layanan', () => {
  it('membuat layanan dengan foto utama dan thumbnail', async () => {
    const r = await call('createService', { ...svc, coverImage: img(T, 'a.webp'), thumbnailImage: img(T, 'thumbs/a.webp') }, 'iContent');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const d = (await db.doc(`tenants/${T}/services/${r.body.data.serviceId}`).get()).data();
    assert.equal(d.thumbnailImage, img(T, 'thumbs/a.webp'));
  });
  it('thumbnail dari tenant lain, di luar folder layanan, atau dengan .. ditolak', async () => {
    for (const p of [img(T2, 'thumbs/x.webp'), `tenants/${T}/products/x.webp`, img(T, '../x.webp')]) {
      const r = await call('createService', { ...svc, name: 'Layanan Uji', thumbnailImage: p }, 'iContent');
      assert.equal(r.status, 400, p);
    }
  });
  it('mengubah thumbnail layanan yang ada; owner tenant lain ditolak', async () => {
    const c = await call('createService', { ...svc, name: 'Party Makeup' }, 'iContent');
    const id = c.body.data.serviceId;
    const u = await call('updateService', { tenantId: T, serviceId: id, thumbnailImage: img(T, 'thumbs/b.webp') }, 'iContent');
    assert.equal(u.status, 200, JSON.stringify(u.body));
    assert.equal((await db.doc(`tenants/${T}/services/${id}`).get()).data().thumbnailImage, img(T, 'thumbs/b.webp'));
    assert.equal((await call('updateService', { tenantId: T, serviceId: id, thumbnailImage: img(T, 'thumbs/c.webp') }, 'iOwner2')).status, 403);
  });
});
