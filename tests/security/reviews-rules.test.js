import { describe, it, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, query, setDoc, where, orderBy, limit } from 'firebase/firestore';
import { ref, uploadBytes, getMetadata } from 'firebase/storage';

const A = 'tenants/mua-putri';
const MB = 1024 * 1024;
let env;
const fs = (uid) => env.authenticatedContext(uid, { email_verified: true }).firestore();
const st = (uid) => env.authenticatedContext(uid, { email_verified: true }).storage();
const put = (s, path, n = 1000) => uploadBytes(ref(s, path), new Uint8Array(n), { contentType: 'image/webp' });
const publicList = (db) => getDocs(query(collection(db, A, 'reviews'), where('published', '==', true), limit(24)));
const staffList = (db) => getDocs(query(collection(db, A, 'reviews'), orderBy('createdAt', 'desc'), limit(100)));

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-mua-putri',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const seed = {
      [A + '/memberships/contentA']: { role: 'content_manager', status: 'active' },
      [A + '/memberships/financeA']: { role: 'finance_manager', status: 'active' },
      [A + '/reviews/pub']: { published: true, createdAt: new Date('2030-01-01') },
      [A + '/reviews/draft']: { published: false, createdAt: new Date('2030-01-02') },
    };
    for (const [p, d] of Object.entries(seed)) await setDoc(doc(db, p), d);
    await put(ctx.storage(), A + '/reviews/seed.webp');
  });
});

after(async () => { await env.cleanup(); });

describe('testimoni di Firestore', () => {
  it('publik hanya bisa mendaftar yang terbit; tanpa filter ditolak', async () => {
    const anon = env.unauthenticatedContext().firestore();
    const snap = await assertSucceeds(publicList(anon));
    if (snap.docs.some((d) => d.data().published !== true)) throw new Error('draft bocor ke publik');
    await assertFails(staffList(anon));
  });
  it('staf dapat mendaftar semua termasuk draft; pelanggan tidak', async () => {
    const snap = await assertSucceeds(staffList(fs('contentA')));
    if (!snap.docs.some((d) => d.id === 'draft')) throw new Error('draft tidak terlihat staf');
    await assertFails(staffList(fs('pelanggan1')));
  });
  it('tidak ada penulisan langsung dari browser', async () => {
    await assertFails(setDoc(doc(fs('contentA'), A + '/reviews/baru'), { published: true }));
  });
});

describe('foto testimoni di Storage', () => {
  it('publik boleh membaca; content manager boleh mengunggah gambar kecil', async () => {
    await assertSucceeds(getMetadata(ref(env.unauthenticatedContext().storage(), A + '/reviews/seed.webp')));
    await assertSucceeds(put(st('contentA'), A + '/reviews/baru.webp', 1 * MB));
  });
  it('lebih dari 4 MB, finance, dan anonim ditolak', async () => {
    await assertFails(put(st('contentA'), A + '/reviews/besar.webp', 5 * MB));
    await assertFails(put(st('financeA'), A + '/reviews/x.webp'));
    await assertFails(put(env.unauthenticatedContext().storage(), A + '/reviews/y.webp'));
  });
});
