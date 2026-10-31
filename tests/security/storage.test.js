import { describe, it, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getMetadata, deleteObject } from 'firebase/storage';

const A = 'tenants/mua-putri';
const MB = 1024 * 1024;
const png = { contentType: 'image/png' };
const bytes = (n) => new Uint8Array(n);
let env;

const st = (uid, claims = {}) =>
  env.authenticatedContext(uid, { email_verified: true, ...claims }).storage();
const anon = () => env.unauthenticatedContext().storage();
const put = (s, path, n = 10, meta = png) => uploadBytes(ref(s, path), bytes(n), meta);
const head = (s, path) => getMetadata(ref(s, path));

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
      [A + '/memberships/adminA']: { role: 'admin', status: 'active' },
      [A + '/memberships/contentA']: { role: 'content_manager', status: 'active' },
      [A + '/memberships/financeA']: { role: 'finance_manager', status: 'active' },
      [A + '/memberships/disabledA']: { role: 'admin', status: 'disabled' },
      'tenants/tenant-b/memberships/ownerB': { role: 'owner', status: 'active' },
    };
    for (const [p, d] of Object.entries(members)) await setDoc(doc(db, p), d);
    const s = ctx.storage();
    for (const p of [
      A + '/branding/logo.png',
      A + '/portfolio/thumbnails/p1.png',
      A + '/portfolio/originals/p1.png',
      A + '/payment-proofs/cust1/proof1.png',
      A + '/customer-uploads/cust1/u1.png',
    ]) await put(s, p);
  });
});

after(async () => { await env.cleanup(); });

describe('baca publik vs privat', () => {
  it('publik boleh baca branding dan thumbnail', async () => {
    await assertSucceeds(head(anon(), A + '/branding/logo.png'));
    await assertSucceeds(head(anon(), A + '/portfolio/thumbnails/p1.png'));
  });
  it('publik tidak boleh baca original, bukti bayar, customer-uploads', async () => {
    await assertFails(head(anon(), A + '/portfolio/originals/p1.png'));
    await assertFails(head(anon(), A + '/payment-proofs/cust1/proof1.png'));
    await assertFails(head(anon(), A + '/customer-uploads/cust1/u1.png'));
  });
});

describe('upload media oleh staf', () => {
  it('tanpa login atau pelanggan biasa ditolak', async () => {
    await assertFails(put(anon(), A + '/branding/x.png'));
    await assertFails(put(st('cust1'), A + '/branding/x.png'));
  });
  it('content manager dan admin boleh upload gambar valid', async () => {
    await assertSucceeds(put(st('contentA'), A + '/products/originals/a.png', 1 * MB));
    await assertSucceeds(put(st('adminA'), A + '/portfolio/optimized/a.png', 1 * MB));
  });
  it('finance manager tidak boleh upload media', async () => {
    await assertFails(put(st('financeA'), A + '/portfolio/optimized/b.png'));
  });
  it('tipe file bukan gambar ditolak', async () => {
    await assertFails(put(st('contentA'), A + '/services/s.html', 10, { contentType: 'text/html' }));
  });
  it('batas ukuran ditegakkan (logo 2 MB, produk 8 MB)', async () => {
    await assertFails(put(st('ownerA'), A + '/branding/besar.png', 3 * MB));
    await assertFails(put(st('ownerA'), A + '/products/optimized/besar.png', 9 * MB));
  });
  it('membership disabled atau email belum terverifikasi ditolak', async () => {
    await assertFails(put(st('disabledA'), A + '/branding/d.png'));
    await assertFails(put(st('ownerA', { email_verified: false }), A + '/branding/e.png'));
  });
  it('owner tenant lain tidak boleh upload ke tenant ini', async () => {
    await assertFails(put(st('ownerB'), A + '/branding/b.png'));
  });
  it('hapus file dari browser ditolak, bahkan oleh owner', async () => {
    await assertFails(deleteObject(ref(st('ownerA'), A + '/branding/logo.png')));
  });
});

describe('bukti pembayaran', () => {
  it('pelanggan upload ke folder uid sendiri', async () => {
    await assertSucceeds(put(st('cust2'), A + '/payment-proofs/cust2/p.png', 1 * MB));
  });
  it('tidak boleh upload ke folder uid orang lain', async () => {
    await assertFails(put(st('cust2'), A + '/payment-proofs/cust1/curang.png'));
  });
  it('batas 5 MB dan harus gambar', async () => {
    await assertFails(put(st('cust2'), A + '/payment-proofs/cust2/besar.png', 6 * MB));
    await assertFails(put(st('cust2'), A + '/payment-proofs/cust2/x.pdf', 10, { contentType: 'application/pdf' }));
  });
  it('tidak bisa menimpa file yang sudah ada', async () => {
    await assertFails(put(st('cust1'), A + '/payment-proofs/cust1/proof1.png'));
  });
  it('baca: pemilik, finance, owner boleh; pelanggan lain dan content manager tidak', async () => {
    const path = A + '/payment-proofs/cust1/proof1.png';
    await assertSucceeds(head(st('cust1'), path));
    await assertSucceeds(head(st('financeA'), path));
    await assertSucceeds(head(st('ownerA'), path));
    await assertFails(head(st('cust2'), path));
    await assertFails(head(st('contentA'), path));
    await assertFails(head(st('ownerB'), path));
  });
});
