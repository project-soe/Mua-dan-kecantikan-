import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getApps } from 'firebase-admin/app';
import { db, auth } from '../../backend/src/firebase.js';
import { createApp } from '../../backend/src/app.js';
import { makeUser, caller } from './helpers.js';

const T = 'salon-e1';
const T2 = 'salon-e2';
const NOW = Date.UTC(2030, 0, 1, 1, 0); // 2030-01-01 08:00 WIB (Selasa)
let nowMs = NOW;
let server, base, seq = 0;
const call = caller(() => base);
const doc = (p) => db.doc(p);
const bookingDoc = async (id) => (await doc(`tenants/${T}/bookings/${id}`).get()).data();

const hours = (o = {}) => ({
  tenantId: T, timezone: 'Asia/Jakarta', slotIntervalMinutes: 30, capacity: 1,
  minLeadTimeMinutes: 120, maxAdvanceDays: 30, holdMinutes: 60, cancelCutoffHours: 24,
  closedDates: ['2030-01-10'],
  weekly: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, [{ open: '09:00', close: '17:00' }]])),
  ...o,
});
const book = (o = {}) => ({
  tenantId: T, idempotencyKey: `key-${++seq}-${Math.random().toString(36).slice(2, 8)}`,
  serviceItems: [{ serviceId: 'svcA' }], bookingDate: '2030-01-03', startTime: '10:00',
  customerName: 'Siti Aminah', customerPhone: '081234567890', location: { mode: 'studio' }, ...o,
});
const bookB = (o = {}) => book({ serviceItems: [{ serviceId: 'svcB' }], ...o });
const avail = async (user, o = {}) => {
  const r = await call('checkBookingAvailability', { tenantId: T, serviceIds: ['svcA'], date: '2030-01-03', ...o }, user);
  return r;
};
const starts = (r) => r.body.data.availableSlots.map((s) => s.startTime);

before(async () => {
  server = createApp({ db, auth, clock: () => nowMs }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const users = ['eOwner', 'eOwner2', 'eContent', 'eCust1', 'eCust2', 'eCust3', 'eP1', 'eP2', 'eP3', 'eP4',
    'eRate', 'eVal', 'eCan1', 'eCan2', 'eExp1', 'eExp2', 'eOther'];
  await Promise.all(users.map((u) => makeUser(u)));
  const svc = (o) => ({ published: true, bookingEnabled: true, locationMode: 'both', preparationTimeMinutes: 0, ...o });
  const seed = {
    [`tenants/${T}/profile/business`]: { brandName: 'Salon E1', status: 'active' },
    [`tenants/${T2}/profile/business`]: { brandName: 'Salon E2', status: 'active' },
    [`tenants/${T}/memberships/eOwner`]: { role: 'owner', status: 'active' },
    [`tenants/${T}/memberships/eContent`]: { role: 'content_manager', status: 'active' },
    [`tenants/${T2}/memberships/eOwner2`]: { role: 'owner', status: 'active' },
    [`tenants/${T}/services/svcA`]: svc({ name: 'Bridal', price: 500000, depositAmount: 100000, durationMinutes: 60, preparationTimeMinutes: 30 }),
    [`tenants/${T}/services/svcB`]: svc({ name: 'Touch Up', price: 200000, depositAmount: 0, durationMinutes: 30, locationMode: 'studio' }),
    [`tenants/${T}/services/svcC`]: svc({ name: 'Draft', price: 1000, durationMinutes: 30, published: false }),
    [`tenants/${T}/services/svcD`]: svc({ name: 'Off', price: 1000, durationMinutes: 30, bookingEnabled: false }),
  };
  for (const [p, d] of Object.entries(seed)) await doc(p).set(d);
});

after(async () => {
  server.closeAllConnections?.();
  server.close();
  await Promise.all(getApps().map((a) => a.delete()));
});

describe('jam operasional', () => {
  it('belum diatur -> availability 412', async () => {
    const r = await avail('eCust1');
    assert.equal(r.status, 412);
  });
  it('content manager dan owner tenant lain ditolak', async () => {
    assert.equal((await call('updateBusinessHours', hours(), 'eContent')).status, 403);
    assert.equal((await call('updateBusinessHours', hours(), 'eOwner2')).status, 403);
  });
  it('validasi: kelipatan interval, tumpang tindih, zona waktu, buka>=tutup', async () => {
    const w = (list) => hours({ weekly: { mon: list } });
    assert.equal((await call('updateBusinessHours', w([{ open: '09:15', close: '17:00' }]), 'eOwner')).status, 400);
    assert.equal((await call('updateBusinessHours', w([{ open: '09:00', close: '12:00' }, { open: '11:00', close: '15:00' }]), 'eOwner')).status, 400);
    assert.equal((await call('updateBusinessHours', hours({ timezone: 'Asia/Tokyo' }), 'eOwner')).status, 400);
    assert.equal((await call('updateBusinessHours', w([{ open: '17:00', close: '09:00' }]), 'eOwner')).status, 400);
    assert.equal((await call('updateBusinessHours', hours({ capacity: 0 }), 'eOwner')).status, 400);
  });
  it('owner berhasil; proyeksi publik terisi', async () => {
    const r = await call('updateBusinessHours', hours(), 'eOwner');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const pub = (await doc(`publicTenants/${T}`).get()).data();
    assert.equal(pub.operatingHours.timezone, 'Asia/Jakarta');
    assert.deepEqual(pub.operatingHours.closedDates, ['2030-01-10']);
  });
});

describe('ketersediaan', () => {
  it('tanpa login -> 401', async () => {
    const r = await call('checkBookingAvailability', { tenantId: T, serviceIds: ['svcA'], date: '2030-01-03' });
    assert.equal(r.status, 401);
  });
  it('hari buka: 14 slot, 09:00 sampai 15:30 (blok 90 menit)', async () => {
    const r = await avail('eCust1');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const s = starts(r);
    assert.equal(s.length, 14);
    assert.equal(s[0], '09:00');
    assert.equal(s.at(-1), '15:30');
    assert.equal(r.body.data.availableSlots[0].endTime, '10:00');
  });
  it('Minggu, tanggal libur, kemarin, dan di luar rentang -> kosong', async () => {
    for (const date of ['2030-01-06', '2030-01-10', '2029-12-31', '2030-03-01']) {
      assert.deepEqual(starts(await avail('eCust1', { date })), [], date);
    }
  });
  it('hari ini memperhitungkan jeda minimal (sekarang 08:00 + 120 menit)', async () => {
    const s = starts(await avail('eCust1', { date: '2030-01-01' }));
    assert.equal(s[0], '10:00');
  });
  it('layanan draft -> 404; nonaktif -> 412; lokasi tidak didukung -> 400', async () => {
    assert.equal((await avail('eCust1', { serviceIds: ['svcC'] })).status, 404);
    assert.equal((await avail('eCust1', { serviceIds: ['svcD'] })).status, 412);
    assert.equal((await avail('eCust1', { serviceIds: ['svcB'], locationMode: 'customer_location' })).status, 400);
  });
});

describe('createBooking', () => {
  it('berhasil: harga dari database, slot ditahan, nomor booking', async () => {
    const r = await call('createBooking', book({ notes: 'Tolong tepat waktu' }), 'eCust1');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.bookingNumber, 'BK-000001');
    assert.equal(r.body.data.totalAmount, 500000);
    assert.equal(r.body.data.depositAmount, 100000);
    assert.equal(r.body.data.bookingStatus, 'awaiting_payment');
    const b = await bookingDoc(r.body.data.bookingId);
    assert.equal(b.customerId, 'eCust1');
    assert.equal(b.startTime, '10:00');
    assert.equal(b.endTime, '11:00');
    assert.equal(b.paymentStatus, 'unpaid');
    assert.equal(b.customerPhone, '+6281234567890');
    assert.equal(b.serviceItems[0].price, 500000);
    const slots = await db.collection(`tenants/${T}/bookingSlots`).where('date', '==', '2030-01-03').get();
    assert.equal(slots.size, 6);
    for (const s of slots.docs) assert.equal(typeof s.data().holds[r.body.data.bookingId], 'number');
  });
  it('setelah itu, slot yang bertabrakan tidak lagi tersedia', async () => {
    const s = starts(await avail('eCust2'));
    assert.equal(s[0], '11:30');
    assert.ok(!s.includes('10:00') && !s.includes('09:00'));
    assert.equal(s.length, 9);
  });
  it('bertabrakan -> 409; bersebelahan -> 200', async () => {
    const same = await call('createBooking', book(), 'eCust2');
    assert.equal(same.status, 409);
    assert.equal(same.body.error.code, 'booking-conflict');
    const overlap = await call('createBooking', book({ startTime: '11:00' }), 'eCust2');
    assert.equal(overlap.status, 409);
    const adjacent = await call('createBooking', book({ startTime: '11:30' }), 'eCust2');
    assert.equal(adjacent.status, 200, JSON.stringify(adjacent.body));
  });
  it('4 pelanggan memesan slot yang sama bersamaan: hanya satu berhasil', async () => {
    const rs = await Promise.all(['eP1', 'eP2', 'eP3', 'eP4'].map((u) =>
      call('createBooking', book({ bookingDate: '2030-01-04', startTime: '09:00' }), u)));
    assert.equal(rs.filter((r) => r.status === 200).length, 1, JSON.stringify(rs.map((r) => r.body)));
    for (const r of rs.filter((x) => x.status !== 200)) assert.equal(r.status, 409);
    const snap = await db.collection(`tenants/${T}/bookings`).where('bookingDate', '==', '2030-01-04').get();
    assert.equal(snap.size, 1);
  });
  it('idempotensi: kunci sama -> booking yang sama; payload beda -> 412', async () => {
    const body = bookB({ bookingDate: '2030-01-05', startTime: '09:00' });
    const a = await call('createBooking', body, 'eCust3');
    const b = await call('createBooking', body, 'eCust3');
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal(b.status, 200);
    assert.equal(a.body.data.bookingId, b.body.data.bookingId);
    assert.equal(a.body.data.bookingStatus, 'pending');
    const snap = await db.collection(`tenants/${T}/bookings`).where('customerId', '==', 'eCust3').get();
    assert.equal(snap.size, 1);
    const diff = await call('createBooking', { ...body, startTime: '10:00' }, 'eCust3');
    assert.equal(diff.status, 412);
  });
  it('validasi jadwal', async () => {
    const cases = [
      [{ bookingDate: '2029-12-31' }, 400], [{ bookingDate: '2030-03-01' }, 400],
      [{ bookingDate: '2030-01-06' }, 409], [{ bookingDate: '2030-01-10' }, 409],
      [{ startTime: '10:15' }, 400], [{ startTime: '08:00' }, 409], [{ startTime: '16:30' }, 409],
      [{ bookingDate: '2030-01-01', startTime: '09:00' }, 409],
    ];
    for (const [o, status] of cases) {
      const r = await call('createBooking', book(o), 'eVal');
      assert.equal(r.status, status, JSON.stringify(o) + ' -> ' + JSON.stringify(r.body));
    }
  });
  it('validasi input dan layanan', async () => {
    const cases = [
      [{ customerPhone: '12345' }, 400], [{ location: { mode: 'customer_location' } }, 400],
      [{ totalAmount: 1 }, 400], [{ idempotencyKey: 'pendek' }, 400],
      [{ serviceItems: [{ serviceId: 'svcC' }] }, 404], [{ serviceItems: [{ serviceId: 'svcD' }] }, 412],
      [{ serviceItems: [{ serviceId: 'svcB' }], location: { mode: 'customer_location', address: 'Jl. Mawar 1' } }, 400],
      [{ serviceItems: [{ serviceId: 'svcA' }, { serviceId: 'svcA' }] }, 400],
    ];
    for (const [o, status] of cases) {
      const r = await call('createBooking', book(o), 'eVal');
      assert.equal(r.status, status, JSON.stringify(o) + ' -> ' + JSON.stringify(r.body));
    }
    assert.equal((await call('createBooking', book())).status, 401);
  });
  it('batas 3 booking menunggu per pelanggan -> 429', async () => {
    for (const t of ['10:00', '11:00', '12:00']) {
      const r = await call('createBooking', bookB({ bookingDate: '2030-01-05', startTime: t }), 'eRate');
      assert.equal(r.status, 200, JSON.stringify(r.body));
    }
    const r = await call('createBooking', bookB({ bookingDate: '2030-01-05', startTime: '13:00' }), 'eRate');
    assert.equal(r.status, 429);
    assert.equal(r.body.error.code, 'rate-limited');
  });
  it('tenant ditangguhkan: tidak bisa membuat booking', async () => {
    const p = doc(`tenants/${T}/profile/business`);
    await p.update({ status: 'suspended' });
    try {
      const r = await call('createBooking', bookB({ bookingDate: '2030-01-09', startTime: '09:00' }), 'eVal');
      assert.equal(r.status, 403);
      assert.equal(r.body.error.code, 'tenant-suspended');
      assert.equal((await avail('eVal')).status, 403);
    } finally { await p.update({ status: 'active' }); }
  });
});

describe('konfirmasi dan pembatalan', () => {
  it('pembatalan oleh pemilik melepas slot; orang lain bisa memesan', async () => {
    const b = await call('createBooking', bookB({ bookingDate: '2030-01-08', startTime: '09:00' }), 'eCan1');
    assert.equal(b.status, 200, JSON.stringify(b.body));
    const id = b.body.data.bookingId;
    assert.equal((await call('createBooking', bookB({ bookingDate: '2030-01-08', startTime: '09:00' }), 'eOther')).status, 409);
    assert.equal((await call('cancelBooking', { tenantId: T, bookingId: id }, 'eCan2')).status, 404);
    const c = await call('cancelBooking', { tenantId: T, bookingId: id, reason: 'berhalangan' }, 'eCan1');
    assert.equal(c.status, 200, JSON.stringify(c.body));
    assert.equal((await bookingDoc(id)).bookingStatus, 'cancelled');
    const slot = (await doc(`tenants/${T}/bookingSlots/2030-01-08_0900`).get()).data();
    assert.ok(!(id in slot.holds));
    assert.equal((await call('createBooking', bookB({ bookingDate: '2030-01-08', startTime: '09:00' }), 'eOther')).status, 200);
    assert.equal((await call('cancelBooking', { tenantId: T, bookingId: id }, 'eCan1')).status, 412);
  });
  it('konfirmasi: pelanggan ditolak; awaiting_payment ditolak; pending berhasil', async () => {
    const pending = await call('createBooking', bookB({ bookingDate: '2030-01-09', startTime: '10:00' }), 'eCan2');
    const awaiting = await call('createBooking', book({ bookingDate: '2030-01-09', startTime: '13:00' }), 'eCan2');
    assert.equal(pending.status, 200, JSON.stringify(pending.body));
    const pid = pending.body.data.bookingId;
    assert.equal((await call('confirmBooking', { tenantId: T, bookingId: pid }, 'eCan2')).status, 403);
    assert.equal((await call('confirmBooking', { tenantId: T, bookingId: awaiting.body.data.bookingId }, 'eOwner')).status, 412);
    const ok = await call('confirmBooking', { tenantId: T, bookingId: pid }, 'eOwner');
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal((await bookingDoc(pid)).bookingStatus, 'confirmed');
    const slot = (await doc(`tenants/${T}/bookingSlots/2030-01-09_1000`).get()).data();
    assert.equal(slot.holds[pid], null);
  });
  it('terkonfirmasi di dalam batas pembatalan: pelanggan 412, staf boleh', async () => {
    const b = await call('createBooking', bookB({ bookingDate: '2030-01-01', startTime: '14:00' }), 'eCan1');
    assert.equal(b.status, 200, JSON.stringify(b.body));
    const id = b.body.data.bookingId;
    await call('confirmBooking', { tenantId: T, bookingId: id }, 'eOwner');
    const c = await call('cancelBooking', { tenantId: T, bookingId: id }, 'eCan1');
    assert.equal(c.status, 412);
    assert.equal((await call('cancelBooking', { tenantId: T, bookingId: id }, 'eOwner')).status, 200);
  });
  it('terkonfirmasi jauh dari jadwal: pelanggan boleh membatalkan', async () => {
    const b = await call('createBooking', bookB({ bookingDate: '2030-01-15', startTime: '09:00' }), 'eCan1');
    const id = b.body.data.bookingId;
    await call('confirmBooking', { tenantId: T, bookingId: id }, 'eOwner');
    assert.equal((await call('cancelBooking', { tenantId: T, bookingId: id }, 'eCan1')).status, 200);
  });
});

describe('kedaluwarsa tahanan', () => {
  it('tahanan lewat waktu otomatis kosong; sapuan menyinkronkan status', async () => {
    const a = await call('createBooking', bookB({ bookingDate: '2030-01-07', startTime: '09:00' }), 'eExp1');
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal((await call('createBooking', bookB({ bookingDate: '2030-01-07', startTime: '09:00' }), 'eExp2')).status, 409);

    nowMs = NOW + 61 * 60000; // lewat holdMinutes (60)
    const b = await call('createBooking', bookB({ bookingDate: '2030-01-07', startTime: '09:00' }), 'eExp2');
    assert.equal(b.status, 200, JSON.stringify(b.body));

    assert.equal((await call('expireStaleBookings', { tenantId: T }, 'eCust1')).status, 403);
    const sweep = await call('expireStaleBookings', { tenantId: T }, 'eOwner');
    assert.equal(sweep.status, 200, JSON.stringify(sweep.body));
    assert.ok(sweep.body.data.expired >= 1);

    const old = await bookingDoc(a.body.data.bookingId);
    assert.equal(old.bookingStatus, 'cancelled');
    assert.equal(old.cancelReason, 'expired');
    assert.equal((await bookingDoc(b.body.data.bookingId)).bookingStatus, 'pending');
    const slot = (await doc(`tenants/${T}/bookingSlots/2030-01-07_0900`).get()).data();
    assert.ok(b.body.data.bookingId in slot.holds);
    assert.ok(!(a.body.data.bookingId in slot.holds));
  });
});
