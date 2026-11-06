import { describe, it, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, orderBy, limit } from 'firebase/firestore';

const A = 'tenants/mua-putri';
let env;
const as = (uid) => env.authenticatedContext(uid, { email_verified: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
// Bentuk query yang sama dengan dashboard admin (tanpa filter pemilik).
const list = (db, name) => getDocs(query(collection(db, A, name), orderBy('createdAt', 'desc'), limit(50)));

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-mua-putri',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const seed = {
      [A + '/memberships/ownerA']: { role: 'owner', status: 'active' },
      [A + '/memberships/adminA']: { role: 'admin', status: 'active' },
      [A + '/memberships/contentA']: { role: 'content_manager', status: 'active' },
      [A + '/memberships/financeA']: { role: 'finance_manager', status: 'active' },
      'tenants/tenant-b/memberships/ownerB': { role: 'owner', status: 'active' },
      [A + '/bookings/b1']: { customerId: 'c1', createdAt: new Date('2030-01-01') },
      [A + '/bookings/b2']: { customerId: 'c2', createdAt: new Date('2030-01-02') },
      [A + '/payments/p1']: { customerId: 'c1', createdAt: new Date('2030-01-01') },
    };
    for (const [p, d] of Object.entries(seed)) await setDoc(doc(db, p), d);
  });
});

after(async () => { await env.cleanup(); });

describe('daftar booking untuk dashboard', () => {
  for (const u of ['ownerA', 'adminA', 'financeA']) {
    it(`${u} boleh`, async () => { await assertSucceeds(list(as(u), 'bookings')); });
  }
  it('content manager, pelanggan tanpa filter, owner tenant lain, dan anonim ditolak', async () => {
    await assertFails(list(as('contentA'), 'bookings'));
    await assertFails(list(as('c1'), 'bookings'));
    await assertFails(list(as('ownerB'), 'bookings'));
    await assertFails(list(anon(), 'bookings'));
  });
});

describe('daftar pembayaran untuk dashboard', () => {
  for (const u of ['ownerA', 'financeA']) {
    it(`${u} boleh`, async () => { await assertSucceeds(list(as(u), 'payments')); });
  }
  it('admin, content manager, pelanggan, dan tenant lain ditolak', async () => {
    for (const u of ['adminA', 'contentA', 'c1', 'ownerB']) await assertFails(list(as(u), 'payments'));
  });
});

describe('membaca keanggotaan sendiri (login admin)', () => {
  it('boleh membaca milik sendiri, bukan milik orang lain', async () => {
    await assertSucceeds(getDoc(doc(as('financeA'), A + '/memberships/financeA')));
    await assertFails(getDoc(doc(as('financeA'), A + '/memberships/adminA')));
    await assertFails(getDoc(doc(as('c1'), A + '/memberships/ownerA')));
  });
});
