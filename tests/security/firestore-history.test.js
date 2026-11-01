import { describe, it, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, query, setDoc, where, orderBy, limit } from 'firebase/firestore';

const A = 'tenants/mua-putri';
let env;
const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
// Bentuk query yang sama persis dengan halaman Riwayat.
const mine = (db, name, uid) => getDocs(query(collection(db, A, name),
  where('customerId', '==', uid), orderBy('createdAt', 'desc'), limit(30)));

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-mua-putri',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const seed = {
      [A + '/bookings/b1']: { customerId: 'hc1', createdAt: new Date('2030-01-01') },
      [A + '/bookings/b2']: { customerId: 'hc1', createdAt: new Date('2030-01-02') },
      [A + '/bookings/b3']: { customerId: 'hc2', createdAt: new Date('2030-01-03') },
      [A + '/orders/o1']: { customerId: 'hc1', createdAt: new Date('2030-01-01') },
      [A + '/orders/o2']: { customerId: 'hc2', createdAt: new Date('2030-01-02') },
    };
    for (const [p, d] of Object.entries(seed)) await setDoc(doc(db, p), d);
  });
});

after(async () => { await env.cleanup(); });

for (const name of ['bookings', 'orders']) {
  describe(`riwayat ${name}`, () => {
    it('pemilik boleh mendaftar miliknya sendiri', async () => {
      const snap = await assertSucceeds(mine(as('hc1'), name, 'hc1'));
      if (snap.docs.some((d) => d.data().customerId !== 'hc1')) throw new Error('bocor milik orang lain');
    });
    it('daftar tanpa filter pemilik ditolak', async () => {
      await assertFails(getDocs(query(collection(as('hc1'), A, name), orderBy('createdAt', 'desc'), limit(30))));
    });
    it('mendaftar milik orang lain ditolak', async () => {
      await assertFails(mine(as('hc1'), name, 'hc2'));
    });
    it('tanpa login ditolak', async () => {
      await assertFails(mine(anon(), name, 'hc1'));
    });
  });
}
