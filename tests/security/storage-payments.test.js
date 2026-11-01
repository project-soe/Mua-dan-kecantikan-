import { describe, it, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getMetadata } from 'firebase/storage';

const A = 'tenants/mua-putri';
const MB = 1024 * 1024;
const png = { contentType: 'image/png' };
let env;

const st = (uid, claims = {}) => env.authenticatedContext(uid, { email_verified: true, ...claims }).storage();
const anon = () => env.unauthenticatedContext().storage();
const put = (s, path, n = 10, meta = png) => uploadBytes(ref(s, path), new Uint8Array(n), meta);

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-mua-putri',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const members = {
      [A + '/memberships/ownerA']: { role: 'owner', status: 'active' },
      [A + '/memberships/financeA']: { role: 'finance_manager', status: 'active' },
      [A + '/memberships/adminA']: { role: 'admin', status: 'active' },
      [A + '/memberships/contentA']: { role: 'content_manager', status: 'active' },
      'tenants/tenant-b/memberships/ownerB': { role: 'owner', status: 'active' },
    };
    for (const [p, d] of Object.entries(members)) await setDoc(doc(db, p), d);
    await put(ctx.storage(), A + '/payment-methods/qris.png');
  });
});

after(async () => { await env.cleanup(); });

describe('gambar metode pembayaran (QRIS)', () => {
  it('publik boleh membaca', async () => {
    await assertSucceeds(getMetadata(ref(anon(), A + '/payment-methods/qris.png')));
  });
  it('owner dan finance boleh upload gambar valid', async () => {
    await assertSucceeds(put(st('ownerA'), A + '/payment-methods/q1.png', 1 * MB));
    await assertSucceeds(put(st('financeA'), A + '/payment-methods/q2.png', 1 * MB));
  });
  it('admin, content manager, pelanggan, anonim, dan owner tenant lain ditolak', async () => {
    await assertFails(put(st('adminA'), A + '/payment-methods/x1.png'));
    await assertFails(put(st('contentA'), A + '/payment-methods/x2.png'));
    await assertFails(put(st('cust1'), A + '/payment-methods/x3.png'));
    await assertFails(put(anon(), A + '/payment-methods/x4.png'));
    await assertFails(put(st('ownerB'), A + '/payment-methods/x5.png'));
  });
  it('bukan gambar dan lebih dari 2 MB ditolak', async () => {
    await assertFails(put(st('ownerA'), A + '/payment-methods/x6.html', 10, { contentType: 'text/html' }));
    await assertFails(put(st('ownerA'), A + '/payment-methods/x7.png', 3 * MB));
  });
});
