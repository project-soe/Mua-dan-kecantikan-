import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getApps } from 'firebase-admin/app';
import { db, auth } from '../../backend/src/firebase.js';
import { createApp } from '../../backend/src/app.js';

const EMU = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const tokens = {};
let server, base;

async function makeUser(uid, { verified = true } = {}) {
  const email = `${uid}@test.local`;
  const password = 'Passw0rd!x';
  await auth.createUser({ uid, email, password, emailVerified: verified });
  const r = await fetch(`http://${EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  tokens[uid] = (await r.json()).idToken;
}

async function call(fn, body, user) {
  const headers = { 'content-type': 'application/json' };
  if (user) headers.authorization = 'Bearer ' + (tokens[user] ?? user);
  const r = await fetch(`${base}/api/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}

before(async () => {
  server = createApp({ db, auth }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;

  for (const u of ['ownerA', 'ownerB', 'outsider', 'disabledA', 'root']) await makeUser(u);
  await makeUser('unverifiedA', { verified: false });

  const seed = {
    'tenants/mua-putri/profile/business': { brandName: 'Mua Putri', status: 'active' },
    'tenants/tenant-b/profile/business': { brandName: 'Tenant B', status: 'active' },
    'publicTenants/mua-putri': { brandName: 'Mua Putri', status: 'active' },
    'tenants/mua-putri/memberships/ownerA': { role: 'owner', status: 'active' },
    'tenants/mua-putri/memberships/disabledA': { role: 'admin', status: 'disabled' },
    'tenants/mua-putri/memberships/unverifiedA': { role: 'owner', status: 'active' },
    'tenants/tenant-b/memberships/ownerB': { role: 'owner', status: 'active' },
    'platformUsers/root': { role: 'super_admin', status: 'active' },
  };
  for (const [p, d] of Object.entries(seed)) await db.doc(p).set(d);
});

after(async () => {
  server.closeAllConnections?.();
  server.close();
  await Promise.all(getApps().map((a) => a.delete()));
});

describe('umum', () => {
  it('health tanpa login', async () => {
    const r = await fetch(`${base}/api/health`);
    assert.equal(r.status, 200);
  });
  it('endpoint tidak dikenal -> 404 resource-not-found', async () => {
    const r = await call('tidakAda', {});
    assert.equal(r.status, 404);
    assert.equal(r.body.error.code, 'resource-not-found');
  });
  it('JSON rusak -> 400 invalid-argument', async () => {
    const r = await fetch(`${base}/api/getMyAccess`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{rusak',
    });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error.code, 'invalid-argument');
  });
});

describe('autentikasi', () => {
  it('tanpa token -> 401 unauthenticated', async () => {
    const r = await call('getMyAccess', { tenantId: 'mua-putri' });
    assert.equal(r.status, 401);
    assert.equal(r.body.error.code, 'unauthenticated');
  });
  it('token palsu -> 401 unauthenticated', async () => {
    const r = await call('getMyAccess', { tenantId: 'mua-putri' }, 'bukan-token');
    assert.equal(r.status, 401);
  });
});

describe('getMyAccess', () => {
  it('tenantId tidak valid -> 400', async () => {
    const r = await call('getMyAccess', { tenantId: 'A B' }, 'ownerA');
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'invalid-argument');
  });
  it('tenant tidak ada -> 404 tenant-not-found', async () => {
    const r = await call('getMyAccess', { tenantId: 'tenant-x' }, 'ownerA');
    assert.equal(r.status, 404);
    assert.equal(r.body.error.code, 'tenant-not-found');
  });
  it('bukan anggota -> 403 permission-denied', async () => {
    const r = await call('getMyAccess', { tenantId: 'mua-putri' }, 'outsider');
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'permission-denied');
  });
  it('owner tenant A berhasil', async () => {
    const r = await call('getMyAccess', { tenantId: 'mua-putri' }, 'ownerA');
    assert.equal(r.status, 200);
    assert.equal(r.body.data.role, 'owner');
    assert.equal(r.body.data.tenantId, 'mua-putri');
  });
  it('owner tenant A tidak bisa mengaku di tenant B', async () => {
    const r = await call('getMyAccess', { tenantId: 'tenant-b' }, 'ownerA');
    assert.equal(r.status, 403);
  });
  it('membership disabled ditolak', async () => {
    const r = await call('getMyAccess', { tenantId: 'mua-putri' }, 'disabledA');
    assert.equal(r.status, 403);
  });
  it('email belum terverifikasi ditolak walau membership aktif', async () => {
    const r = await call('getMyAccess', { tenantId: 'mua-putri' }, 'unverifiedA');
    assert.equal(r.status, 403);
  });
});

describe('setTenantStatus (Super Admin)', () => {
  it('owner tenant bukan Super Admin -> 403', async () => {
    const r = await call('setTenantStatus', { tenantId: 'mua-putri', status: 'suspended' }, 'ownerA');
    assert.equal(r.status, 403);
  });
  it('status tidak valid -> 400', async () => {
    const r = await call('setTenantStatus', { tenantId: 'mua-putri', status: 'bebas' }, 'root');
    assert.equal(r.status, 400);
  });
  it('tenant tidak ada -> 404', async () => {
    const r = await call('setTenantStatus', { tenantId: 'tenant-x', status: 'suspended' }, 'root');
    assert.equal(r.status, 404);
  });
  it('suspend: profil, publicTenants, audit log; lalu aktifkan kembali', async () => {
    const r = await call('setTenantStatus', { tenantId: 'mua-putri', status: 'suspended' }, 'root');
    assert.equal(r.status, 200);
    assert.equal(r.body.data.changed, true);

    assert.equal((await db.doc('tenants/mua-putri/profile/business').get()).data().status, 'suspended');
    assert.equal((await db.doc('publicTenants/mua-putri').get()).data().status, 'suspended');

    const logs = await db.collection('tenants/mua-putri/auditLogs').where('action', '==', 'setTenantStatus').get();
    assert.equal(logs.size, 1);
    assert.equal(logs.docs[0].data().actorUid, 'root');
    assert.deepEqual(logs.docs[0].data().summary, { from: 'active', to: 'suspended' });

    // Owner masih bisa melihat akses (info akun), status terlihat suspended
    const acc = await call('getMyAccess', { tenantId: 'mua-putri' }, 'ownerA');
    assert.equal(acc.status, 200);
    assert.equal(acc.body.data.tenantStatus, 'suspended');

    const back = await call('setTenantStatus', { tenantId: 'mua-putri', status: 'active' }, 'root');
    assert.equal(back.status, 200);
  });
});
