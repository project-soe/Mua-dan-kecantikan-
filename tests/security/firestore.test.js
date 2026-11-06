import { describe, it, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, getDocs, collection } from 'firebase/firestore';

const A = 'tenants/mua-putri';
const B = 'tenants/tenant-b';
let env;

const as = (uid, claims = {}) =>
  env.authenticatedContext(uid, { email_verified: true, ...claims }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-mua-putri',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const seed = {
      'publicTenants/mua-putri': { brandName: 'Mua Putri' },
      'platformDomains/muaputri.com': { tenantId: 'mua-putri', status: 'active' },
      'platformDomains/pending.com': { tenantId: 'mua-putri', status: 'pending' },
      'platformUsers/root': { role: 'super_admin' },
      [A + '/memberships/ownerA']: { role: 'owner', status: 'active' },
      [A + '/memberships/adminA']: { role: 'admin', status: 'active' },
      [A + '/memberships/contentA']: { role: 'content_manager', status: 'active' },
      [A + '/memberships/financeA']: { role: 'finance_manager', status: 'active' },
      [A + '/memberships/disabledA']: { role: 'admin', status: 'disabled' },
      [B + '/memberships/ownerB']: { role: 'owner', status: 'active' },
      [A + '/products/pub']: { name: 'Lipstik', published: true, stock: 5 },
      [A + '/products/draft']: { name: 'Draft', published: false },
      [B + '/products/draftB']: { name: 'Draft B', published: false },
      [A + '/bookings/b-private']: { customerId: 'cust1', customerName: 'Nama Rahasia', customerPhone: '+628123456789' },
      [A + '/orders/o1']: { customerId: 'cust1', customerName: 'Nama Rahasia', customerPhone: '+628123456789', shippingAddressSnapshot: { street: 'Alamat Rahasia' }, totalAmount: 100000 },
      [A + '/orders/o2']: { customerId: 'cust2', totalAmount: 200000 },
      [A + '/payments/pay1']: { customerId: 'cust1', amount: 100000 },
      [A + '/payments/pay2']: { customerId: 'cust2', amount: 200000 },
      [A + '/settings/paymentPrivate']: { accountNumber: 'rahasia' },
      [A + '/settings/contact']: { phone: '08123' },
      [A + '/auditLogs/a1']: { action: 'verifyPayment' },
      [B + '/orders/ob1']: { customerId: 'custB' },
    };
    for (const [path, data] of Object.entries(seed)) await setDoc(doc(db, path), data);
  });
});

after(async () => { await env.cleanup(); });

describe('akses publik (tanpa login)', () => {
  it('boleh baca publicTenants dan produk published', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'publicTenants/mua-putri')));
    await assertSucceeds(getDoc(doc(anon(), A + '/products/pub')));
  });
  it('tidak boleh baca produk draft, order, payment, platformUsers', async () => {
    await assertFails(getDoc(doc(anon(), A + '/products/draft')));
    await assertFails(getDoc(doc(anon(), A + '/orders/o1')));
    await assertFails(getDoc(doc(anon(), A + '/payments/pay1')));
    await assertFails(getDoc(doc(anon(), 'platformUsers/root')));
  });
  it('domain: hanya get untuk yang active, list ditolak', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'platformDomains/muaputri.com')));
    await assertFails(getDoc(doc(anon(), 'platformDomains/pending.com')));
    await assertFails(getDocs(collection(anon(), 'platformDomains')));
  });
});

describe('penulisan dari browser ditolak semua', () => {
  it('owner pun tidak boleh menulis produk langsung', async () => {
    await assertFails(setDoc(doc(as('ownerA'), A + '/products/baru'), { name: 'x', published: true }));
    await assertFails(updateDoc(doc(as('ownerA'), A + '/products/pub'), { stock: 999 }));
  });
  it('pelanggan tidak boleh ubah harga/stok/status bayar', async () => {
    await assertFails(updateDoc(doc(as('cust1'), A + '/orders/o1'), { totalAmount: 1 }));
    await assertFails(updateDoc(doc(as('cust1'), A + '/payments/pay1'), { paymentStatus: 'verified' }));
  });
  it('tidak boleh memberi diri sendiri peran admin', async () => {
    await assertFails(setDoc(doc(as('hacker'), A + '/memberships/hacker'), { role: 'owner', status: 'active' }));
  });
});

describe('kepemilikan pelanggan', () => {
  it('baca order dan payment milik sendiri', async () => {
    await assertSucceeds(getDoc(doc(as('cust1'), A + '/orders/o1')));
    await assertSucceeds(getDoc(doc(as('cust1'), A + '/payments/pay1')));
  });
  it('tidak bisa baca milik pelanggan lain', async () => {
    await assertFails(getDoc(doc(as('cust1'), A + '/orders/o2')));
    await assertFails(getDoc(doc(as('cust1'), A + '/payments/pay2')));
  });
});

describe('peran tenant', () => {
  it('content manager: boleh draft, tidak boleh membaca data transaksi yang berisi PII', async () => {
    const db = as('contentA');
    await assertSucceeds(getDoc(doc(db, A + '/products/draft')));
    await assertFails(getDoc(doc(db, A + '/bookings/b-private')));
    await assertFails(getDoc(doc(db, A + '/orders/o1')));
    await assertFails(getDoc(doc(db, A + '/settings/paymentPrivate')));
    await assertFails(getDoc(doc(db, A + '/payments/pay1')));
    await assertFails(getDoc(doc(db, A + '/auditLogs/a1')));
  });
  it('finance: boleh paymentPrivate, transaksi dan payments, tidak boleh auditLogs', async () => {
    const db = as('financeA');
    await assertSucceeds(getDoc(doc(db, A + '/settings/paymentPrivate')));
    await assertSucceeds(getDoc(doc(db, A + '/bookings/b-private')));
    await assertSucceeds(getDoc(doc(db, A + '/orders/o1')));
    await assertSucceeds(getDoc(doc(db, A + '/payments/pay2')));
    await assertFails(getDoc(doc(db, A + '/auditLogs/a1')));
  });
  it('admin: boleh transaksi operasional, tidak boleh paymentPrivate dan payments', async () => {
    const db = as('adminA');
    await assertSucceeds(getDoc(doc(db, A + '/settings/contact')));
    await assertSucceeds(getDoc(doc(db, A + '/bookings/b-private')));
    await assertSucceeds(getDoc(doc(db, A + '/orders/o1')));
    await assertFails(getDoc(doc(db, A + '/settings/paymentPrivate')));
    await assertFails(getDoc(doc(db, A + '/payments/pay1')));
  });
  it('owner: boleh paymentPrivate dan auditLogs', async () => {
    const db = as('ownerA');
    await assertSucceeds(getDoc(doc(db, A + '/settings/paymentPrivate')));
    await assertSucceeds(getDoc(doc(db, A + '/auditLogs/a1')));
  });
  it('membership disabled atau email belum terverifikasi ditolak', async () => {
    await assertFails(getDoc(doc(as('disabledA'), A + '/products/draft')));
    await assertFails(getDoc(doc(as('ownerA', { email_verified: false }), A + '/products/draft')));
  });
});

describe('isolasi antar tenant', () => {
  it('owner tenant B tidak bisa baca data tenant A', async () => {
    const db = as('ownerB');
    await assertFails(getDoc(doc(db, A + '/products/draft')));
    await assertFails(getDoc(doc(db, A + '/orders/o1')));
    await assertFails(getDoc(doc(db, A + '/settings/paymentPrivate')));
    await assertFails(getDoc(doc(db, A + '/auditLogs/a1')));
  });
  it('owner tenant A tidak bisa baca data tenant B', async () => {
    const db = as('ownerA');
    await assertFails(getDoc(doc(db, B + '/products/draftB')));
    await assertFails(getDoc(doc(db, B + '/orders/ob1')));
  });
});
