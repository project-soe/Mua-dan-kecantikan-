import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getApps } from 'firebase-admin/app';
import { FieldValue } from 'firebase-admin/firestore';
import { db, auth } from '../../backend/src/firebase.js';
import { createApp } from '../../backend/src/app.js';
import { makeUser, caller } from './helpers.js';

const T = 'salon-f1';
const T2 = 'salon-f2';
const MB = 1024 * 1024;
const NOW = Date.UTC(2030, 0, 1, 1, 0); // 2030-01-01 08:00 WIB (Selasa)
let nowMs = NOW;
let server, base, seq = 0;
const call = caller(() => base);
const imageKitFiles = new Map();
let proofSeq = 0;
const proofInfo = async ({ fileId, tenantId, userId }) => { const x = imageKitFiles.get(fileId); return x && x.tenantId === tenantId && x.userId === userId && x.private ? x : null; };
const doc = (p) => db.doc(p);
const getB = async (id) => (await doc(`tenants/${T}/bookings/${id}`).get()).data();
const getP = async (id) => (await doc(`tenants/${T}/payments/${id}`).get()).data();
const holdsOf = async (key) => (await doc(`tenants/${T}/bookingSlots/${key}`).get()).data().holds;

const book = (o = {}) => ({
  tenantId: T, idempotencyKey: `key-${++seq}-${Math.random().toString(36).slice(2, 8)}`,
  serviceItems: [{ serviceId: 'svcA' }], bookingDate: '2030-01-03', startTime: '09:00',
  customerName: 'Siti Aminah', customerPhone: '081234567890', location: { mode: 'studio' }, ...o,
});
const mk = async (user, date, startTime = '09:00', svc = 'svcA') => {
  const r = await call('createBooking',
    book({ serviceItems: [{ serviceId: svc }], bookingDate: date, startTime }), user);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.data.bookingId;
};
const putProof = async (uid, name, { size = 2000, contentType = 'image/png', tenant = T } = {}) => {
  const fileId = `ik_test_${++proofSeq}`;
  imageKitFiles.set(fileId, { fileId, tenantId: tenant, userId: uid, filePath: `/tenants/${tenant}/payment-proofs/${uid}/${name}`, size, contentType, private: true });
  return fileId;
};
const payBody = (bookingId, proof, o = {}) => ({
  tenantId: T, bookingId, paymentMethod: 'bank_transfer', proofFileId: proof, amount: 100000, ...o,
});
const submit = async (user, bookingId, name, amount = 100000) => {
  const proof = await putProof(user, name);
  const r = await call('submitPaymentProof', payBody(bookingId, proof, { amount }), user);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.data.paymentId;
};
const settingsBody = (o = {}) => ({
  tenantId: T, instructionsText: 'Transfer lalu unggah bukti.', internalNotes: 'rekening utama',
  methods: [
    { method: 'bank_transfer', enabled: true, accountName: 'Putri Salon', bankName: 'BCA', accountNumber: '1234567890' },
    { method: 'dana', enabled: true, accountName: 'Putri Salon', accountNumber: '081234567890' },
    { method: 'qris', enabled: false, accountName: 'Putri Salon' },
  ], ...o,
});

before(async () => {
  server = createApp({ db, auth, clock: () => nowMs, proofInfo }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const users = ['fOwner', 'fFinance', 'fAdmin', 'fContent', 'fOwner2', 'fX',
    ...Array.from({ length: 11 }, (_, i) => `fC${i + 1}`)];
  await Promise.all(users.map((u) => makeUser(u)));
  const win = [{ open: '09:00', close: '17:00' }];
  const svc = (o) => ({ published: true, bookingEnabled: true, locationMode: 'both', preparationTimeMinutes: 0, ...o });
  const seed = {
    [`tenants/${T}/profile/business`]: { brandName: 'Salon F1', status: 'active' },
    [`tenants/${T2}/profile/business`]: { brandName: 'Salon F2', status: 'active' },
    [`tenants/${T}/memberships/fOwner`]: { role: 'owner', status: 'active' },
    [`tenants/${T}/memberships/fFinance`]: { role: 'finance_manager', status: 'active' },
    [`tenants/${T}/memberships/fAdmin`]: { role: 'admin', status: 'active' },
    [`tenants/${T}/memberships/fContent`]: { role: 'content_manager', status: 'active' },
    [`tenants/${T2}/memberships/fOwner2`]: { role: 'owner', status: 'active' },
    [`tenants/${T}/settings/businessHours`]: {
      timezone: 'Asia/Jakarta', slotIntervalMinutes: 30, capacity: 1, minLeadTimeMinutes: 120,
      maxAdvanceDays: 30, holdMinutes: 60, cancelCutoffHours: 24, closedDates: [],
      weekly: { sun: [], mon: win, tue: win, wed: win, thu: win, fri: win, sat: win },
    },
    [`tenants/${T}/services/svcA`]: svc({ name: 'Bridal', price: 500000, depositAmount: 100000, durationMinutes: 60, preparationTimeMinutes: 30 }),
    [`tenants/${T}/services/svcB`]: svc({ name: 'Touch Up', price: 200000, depositAmount: 0, durationMinutes: 30, locationMode: 'studio' }),
  };
  for (const [p, d] of Object.entries(seed)) await doc(p).set(d);
});

after(async () => {
  server.closeAllConnections?.();
  server.close();
  await Promise.all(getApps().map((a) => a.delete()));
});

let bFirst, bPending;

describe('sebelum pengaturan pembayaran', () => {
  before(async () => {
    bFirst = await mk('fC10', '2030-01-09', '09:00');
    bPending = await mk('fC10', '2030-01-09', '11:00', 'svcB');
  });
  it('instruksi belum tersedia -> 412', async () => {
    const r = await call('getPaymentInstructions', { tenantId: T, bookingId: bFirst }, 'fC10');
    assert.equal(r.status, 412);
  });
});

describe('pengaturan pembayaran', () => {
  const m = (o = {}) => ({ method: 'bank_transfer', enabled: true, accountName: 'Putri Salon', bankName: 'BCA', accountNumber: '1234567890', ...o });

  it('admin, content manager, dan owner tenant lain ditolak', async () => {
    for (const u of ['fAdmin', 'fContent', 'fOwner2']) {
      assert.equal((await call('updatePaymentSettings', settingsBody(), u)).status, 403, u);
    }
  });
  it('validasi input', async () => {
    const bodies = [
      settingsBody({ methods: [m({ bankName: undefined })] }),
      settingsBody({ methods: [{ method: 'qris', enabled: true, accountName: 'Putri Salon' }] }),
      settingsBody({ methods: [m(), m()] }),
      settingsBody({ methods: [{ method: 'qris', enabled: true, accountName: 'Putri Salon', qrImage: `https://ik.imagekit.io/test/tenants/${T2}/payment-methods/q.png` }] }),
      settingsBody({ methods: [m({ accountNumber: 'abc123' })] }),
      settingsBody({ methods: [] }),
      settingsBody({ methods: [m({ method: 'paypal' })] }),
      settingsBody({ extra: 1 }),
    ];
    for (const [i, b] of bodies.entries()) {
      const r = await call('updatePaymentSettings', b, 'fFinance');
      assert.equal(r.status, 400, `kasus ${i}: ` + JSON.stringify(r.body));
    }
  });
  it('QRIS aktif dengan gambar dari folder tenant sendiri berhasil', async () => {
    const r = await call('updatePaymentSettings', settingsBody({
      methods: [{ method: 'qris', enabled: true, accountName: 'Putri Salon', qrImage: `https://ik.imagekit.io/test/tenants/${T}/payment-methods/qris.png` }],
    }), 'fFinance');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.data.enabledMethods, ['qris']);
  });
  it('finance berhasil; data publik/privat benar; audit tanpa nomor rekening', async () => {
    const r = await call('updatePaymentSettings', settingsBody(), 'fFinance');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const pub = (await doc(`tenants/${T}/settings/paymentPublic`).get()).data();
    assert.equal(pub.methods.length, 3);
    assert.equal((await doc(`tenants/${T}/settings/paymentPrivate`).get()).data().internalNotes, 'rekening utama');
    const tenantPub = (await doc(`publicTenants/${T}`).get()).data() ?? {};
    assert.equal(tenantPub.methods, undefined);
    const logs = await db.collection(`tenants/${T}/auditLogs`).where('action', '==', 'updatePaymentSettings').get();
    assert.ok(logs.size >= 2);
    assert.ok(!JSON.stringify(logs.docs.map((d) => d.data())).includes('1234567890'));
  });
  it('owner juga boleh', async () => {
    assert.equal((await call('updatePaymentSettings', settingsBody(), 'fOwner')).status, 200);
  });
});

describe('instruksi pembayaran', () => {
  it('pemilik mendapat metode aktif saja dan pilihan nominal', async () => {
    const r = await call('getPaymentInstructions', { tenantId: T, bookingId: bFirst }, 'fC10');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const d = r.body.data;
    assert.equal(d.stage, 'initial');
    assert.deepEqual(d.amountOptions, { deposit: 100000, full: 500000 });
    assert.deepEqual(d.supportedMethods.map((x) => x.method), ['bank_transfer', 'dana']);
    assert.equal(d.supportedMethods[0].accountNumber, '1234567890');
    assert.equal('enabled' in d.supportedMethods[0], false);
    assert.ok(d.paymentDeadline);
  });
  it('orang lain 404; tanpa deposit 412; order tidak ditemukan 404; keduanya 400', async () => {
    assert.equal((await call('getPaymentInstructions', { tenantId: T, bookingId: bFirst }, 'fC7')).status, 404);
    assert.equal((await call('getPaymentInstructions', { tenantId: T, bookingId: bPending }, 'fC10')).status, 412);
    assert.equal((await call('getPaymentInstructions', { tenantId: T, orderId: 'x' }, 'fC10')).status, 404);
    assert.equal((await call('getPaymentInstructions', { tenantId: T, bookingId: bFirst, orderId: 'x' }, 'fC10')).status, 400);
    assert.equal((await call('getPaymentInstructions', { tenantId: T, bookingId: bFirst })).status, 401);
  });
});

describe('submitPaymentProof', () => {
  let b1, b2, b3b, p1a, p1b, p2ok, p2big, p2pdf, pay1;
  before(async () => {
    b1 = await mk('fC1', '2030-01-03', '09:00');
    b2 = await mk('fC2', '2030-01-03', '11:00');
    b3b = await mk('fC1', '2030-01-07', '09:00');
    p1a = await putProof('fC1', 'a.png');
    p1b = await putProof('fC1', 'b.png');
    p2ok = await putProof('fC2', 'ok.png');
    p2big = await putProof('fC2', 'big.png', { size: 6 * MB });
    p2pdf = await putProof('fC2', 'doc.pdf', { contentType: 'application/pdf' });
  });

  it('nominal salah -> 409 payment-mismatch', async () => {
    const r = await call('submitPaymentProof', payBody(b2, p2ok, { amount: 150000 }), 'fC2');
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'payment-mismatch');
  });
  it('metode tidak aktif atau tidak dikenal -> 400', async () => {
    assert.equal((await call('submitPaymentProof', payBody(b2, p2ok, { paymentMethod: 'qris' }), 'fC2')).status, 400);
    assert.equal((await call('submitPaymentProof', payBody(b2, p2ok, { paymentMethod: 'paypal' }), 'fC2')).status, 400);
  });
  it('file bukti bermasalah -> 400', async () => {
    const wrongTenant = await putProof('fC2', 'x.png', { tenant: T2 });
    const proofs = [p1a, 'ik_test_missing', p2pdf, p2big, wrongTenant];
    for (const p of proofs) {
      const r = await call('submitPaymentProof', payBody(b2, p), 'fC2');
      assert.equal(r.status, 400, p + ' -> ' + JSON.stringify(r.body));
    }
  });
  it('order tidak ditemukan 404; bookingId+orderId 400; field asing 400; tanpa login 401', async () => {
    const o = { tenantId: T, orderId: 'abc', paymentMethod: 'bank_transfer', proofFileId: p2ok, amount: 100000 };
    assert.equal((await call('submitPaymentProof', o, 'fC2')).status, 404);
    assert.equal((await call('submitPaymentProof', payBody(b2, p2ok, { orderId: 'abc' }), 'fC2')).status, 400);
    assert.equal((await call('submitPaymentProof', payBody(b2, p2ok, { totalAmount: 1 }), 'fC2')).status, 400);
    assert.equal((await call('submitPaymentProof', payBody(b2, p2ok))).status, 401);
  });
  it('booking milik orang lain -> 404', async () => {
    assert.equal((await call('submitPaymentProof', payBody(b1, p2ok), 'fC2')).status, 404);
  });
  it('berhasil: pembayaran tercatat, booking menunggu verifikasi, slot permanen', async () => {
    const r = await call('submitPaymentProof', payBody(b1, p1a), 'fC1');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.paymentStatus, 'submitted');
    assert.equal(r.body.data.bookingStatus, 'payment_verification');
    pay1 = r.body.data.paymentId;
    const b = await getB(b1);
    assert.equal(b.pendingPaymentId, pay1);
    assert.equal(b.paymentDeadline, null);
    assert.equal(b.paymentPlan, 'deposit');
    assert.equal((await holdsOf('2030-01-03_0900'))[b1], null);
    const p = await getP(pay1);
    assert.equal(p.customerId, 'fC1');
    assert.equal(p.amount, 100000);
    assert.equal(p.purpose, 'deposit');
    assert.equal(p.verifiedBy, null);
    assert.equal(p.proofImagePath, imageKitFiles.get(p1a).filePath);
    assert.equal(p.proofImageFileId, p1a);
    assert.equal(p.proofStorageProvider, 'imagekit');
  });
  it('kirim ulang yang sama -> hasil sama; file lain saat menunggu -> 409; file dipakai ulang -> 409', async () => {
    const again = await call('submitPaymentProof', payBody(b1, p1a), 'fC1');
    assert.equal(again.status, 200);
    assert.equal(again.body.data.paymentId, pay1);
    assert.equal((await call('submitPaymentProof', payBody(b1, p1b), 'fC1')).status, 409);
    const reuse = await call('submitPaymentProof', payBody(b3b, p1a), 'fC1');
    assert.equal(reuse.status, 409);
    assert.equal(reuse.body.error.code, 'already-exists');
  });
  it('tenant ditangguhkan -> 403', async () => {
    const p = doc(`tenants/${T}/profile/business`);
    await p.update({ status: 'suspended' });
    try {
      const r = await call('submitPaymentProof', payBody(b2, p2ok), 'fC2');
      assert.equal(r.status, 403);
      assert.equal(r.body.error.code, 'tenant-suspended');
    } finally { await p.update({ status: 'active' }); }
  });
});

describe('verifyPayment', () => {
  let b3, b4, b5, b6, pid3, pid4, pid5, pid6;
  before(async () => {
    b3 = await mk('fC3', '2030-01-04', '09:00');
    pid3 = await submit('fC3', b3, 'p.png', 100000);
    b4 = await mk('fC4', '2030-01-04', '11:00');
    pid4 = await submit('fC4', b4, 'p.png', 100000);
    b5 = await mk('fC5', '2030-01-05', '09:00');
    pid5 = await submit('fC5', b5, 'p.png', 500000);
    b6 = await mk('fC6', '2030-01-05', '11:00');
    pid6 = await submit('fC6', b6, 'p.png', 100000);
    const c = await call('cancelBooking', { tenantId: T, bookingId: b6 }, 'fC6');
    assert.equal(c.status, 200, JSON.stringify(c.body));
  });
  const verify = (user, id, o = {}) => call('verifyPayment', { tenantId: T, paymentId: id, decision: 'verify', ...o }, user);

  it('admin, pelanggan, dan owner tenant lain ditolak', async () => {
    for (const u of ['fAdmin', 'fC7', 'fOwner2']) assert.equal((await verify(u, pid3)).status, 403, u);
  });
  it('input tidak valid', async () => {
    assert.equal((await verify('fFinance', pid3, { decision: 'maybe' })).status, 400);
    assert.equal((await call('verifyPayment', { tenantId: T, paymentId: pid3, decision: 'reject' }, 'fFinance')).status, 400);
    assert.equal((await verify('fFinance', 'tidakada')).status, 404);
  });
  it('nominal diterima tidak cocok -> 409 dan pembayaran tetap menunggu', async () => {
    const r = await verify('fFinance', pid3, { receivedAmount: 90000 });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'payment-mismatch');
    assert.equal((await getP(pid3)).paymentStatus, 'submitted');
  });
  it('verifikasi deposit mengonfirmasi booking; kedua kali ditolak', async () => {
    const r = await verify('fFinance', pid3, { receivedAmount: 100000 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.data, { paymentStatus: 'verified', updatedTransactionStatus: 'confirmed', bookingPaymentStatus: 'partially_paid' });
    const b = await getB(b3);
    assert.equal(b.bookingStatus, 'confirmed');
    assert.equal(b.paymentStatus, 'partially_paid');
    assert.equal(b.paidAmount, 100000);
    assert.equal(b.pendingPaymentId, null);
    assert.equal(b.confirmedBy, 'fFinance');
    const p = await getP(pid3);
    assert.equal(p.paymentStatus, 'verified');
    assert.equal(p.verifiedBy, 'fFinance');
    assert.equal((await verify('fFinance', pid3)).status, 412);
  });
  it('penolakan: booking kembali menunggu bayar dengan tenggat baru; pelanggan bisa kirim ulang', async () => {
    const r = await call('verifyPayment', { tenantId: T, paymentId: pid4, decision: 'reject', rejectionReason: 'Nominal tidak terlihat di mutasi' }, 'fFinance');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.paymentStatus, 'rejected');
    assert.equal(r.body.data.updatedTransactionStatus, 'awaiting_payment');
    const p = await getP(pid4);
    assert.equal(p.paymentStatus, 'rejected');
    assert.equal(p.rejectionReason, 'Nominal tidak terlihat di mutasi');
    const b = await getB(b4);
    assert.equal(b.bookingStatus, 'awaiting_payment');
    assert.equal(b.pendingPaymentId, null);
    assert.ok(b.paymentDeadline);
    assert.equal((await holdsOf('2030-01-04_1100'))[b4], NOW + 60 * 60000);
    await submit('fC4', b4, 'p2.png', 100000);
    assert.equal((await getB(b4)).bookingStatus, 'payment_verification');
  });
  it('pembayaran lunas oleh owner: booking confirmed dan paid', async () => {
    const r = await verify('fOwner', pid5);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.bookingPaymentStatus, 'paid');
    const b = await getB(b5);
    assert.equal(b.bookingStatus, 'confirmed');
    assert.equal(b.paidAmount, 500000);
  });
  it('sisa pelunasan: nominal harus pas, satu pengajuan sekali, lalu lunas', async () => {
    const ins = await call('getPaymentInstructions', { tenantId: T, bookingId: b3 }, 'fC3');
    assert.equal(ins.status, 200, JSON.stringify(ins.body));
    assert.equal(ins.body.data.stage, 'balance');
    assert.deepEqual(ins.body.data.amountOptions, { balance: 400000 });

    const badProof = await putProof('fC3', 'bal-bad.png');
    const bad = await call('submitPaymentProof', payBody(b3, badProof, { amount: 100000 }), 'fC3');
    assert.equal(bad.status, 409);
    assert.equal(bad.body.error.code, 'payment-mismatch');

    const balId = await submit('fC3', b3, 'bal.png', 400000);
    assert.equal((await getB(b3)).bookingStatus, 'confirmed'); // tetap confirmed
    const dup = await call('submitPaymentProof', payBody(b3, await putProof('fC3', 'bal2.png'), { amount: 400000 }), 'fC3');
    assert.equal(dup.status, 409);

    const v = await verify('fFinance', balId);
    assert.equal(v.status, 200, JSON.stringify(v.body));
    assert.equal(v.body.data.bookingPaymentStatus, 'paid');
    const b = await getB(b3);
    assert.equal(b.paidAmount, 500000);
    assert.equal(b.pendingPaymentId, null);
    assert.equal((await call('getPaymentInstructions', { tenantId: T, bookingId: b3 }, 'fC3')).status, 412);
  });
  it('pembayaran untuk booking yang sudah dibatalkan: diterima dan ditandai perlu refund', async () => {
    const r = await verify('fFinance', pid6);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const b = await getB(b6);
    assert.equal(b.bookingStatus, 'cancelled');
    assert.equal(b.refundReview, true);
    assert.equal(b.paymentStatus, 'partially_paid');
  });
});

describe('kedaluwarsa dan penguatan confirmBooking', () => {
  it('bukti bayar setelah tahanan lewat: slot diambil orang lain -> 409; slot masih bebas -> 200', async () => {
    const a = await mk('fC8', '2030-01-08', '09:00');
    const c = await mk('fC9', '2030-01-08', '14:00');
    nowMs = NOW + 61 * 60000; // melewati holdMinutes (60)
    await mk('fX', '2030-01-08', '09:00');

    const ra = await call('submitPaymentProof', payBody(a, await putProof('fC8', 'p.png')), 'fC8');
    assert.equal(ra.status, 409);
    assert.equal(ra.body.error.code, 'booking-conflict');

    const rc = await call('submitPaymentProof', payBody(c, await putProof('fC9', 'p.png')), 'fC9');
    assert.equal(rc.status, 200, JSON.stringify(rc.body));
    assert.equal((await getB(c)).bookingStatus, 'payment_verification');
    assert.equal((await holdsOf('2030-01-08_1400'))[c], null);
  });
  it('confirmBooking menolak bila ada tahanan aktif lain pada data tidak konsisten', async () => {
    nowMs = NOW;
    const pend = await mk('fC11', '2030-01-08', '16:00', 'svcB');
    nowMs = NOW + 61 * 60000;
    const slot = doc(`tenants/${T}/bookingSlots/2030-01-08_1600`);
    await slot.update({ 'holds.ghost': nowMs + 3600000 }); // data tidak konsisten buatan
    const r = await call('confirmBooking', { tenantId: T, bookingId: pend }, 'fOwner');
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'booking-conflict');
    await slot.update({ 'holds.ghost': FieldValue.delete() });
    const ok = await call('confirmBooking', { tenantId: T, bookingId: pend }, 'fOwner');
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal((await holdsOf('2030-01-08_1600'))[pend], null);
  });
});
