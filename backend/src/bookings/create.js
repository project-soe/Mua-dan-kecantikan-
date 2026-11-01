import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { AppError } from '../errors.js';
import { rejectUnknown, str, oneOf } from '../validate.js';
import { auditEntry } from '../audit.js';
import { auditRef } from '../common.js';
import {
  tenantNow, dayIndex, absMinutes, blockLength, unitMinutes, windowsFor, fits, formatTime, slotId,
} from './schedule.js';
import {
  bad, parseDate, parseStart, parseServiceIds, summarizeServices, requireSettings, settingsRef,
  bookingsCol, slotRef, activeCount, prunedHolds,
} from './common.js';

const MAX_ACTIVE_PER_CUSTOMER = 3;
const conflict = () => new AppError('booking-conflict', 'Jadwal tidak tersedia');

function parseItems(v) {
  if (!Array.isArray(v)) throw bad('serviceItems harus berupa daftar');
  return parseServiceIds(v.map((x) => {
    if (typeof x !== 'object' || x === null) throw bad('serviceItems tidak valid');
    rejectUnknown(x, ['serviceId']);
    return x.serviceId;
  }), 'serviceItems');
}
function parseLocation(v) {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw bad('location wajib diisi');
  rejectUnknown(v, ['mode', 'address']);
  const mode = oneOf(v.mode, ['studio', 'customer_location'], 'location.mode');
  const address = str(v.address, 'location.address', { min: 5, max: 300, optional: mode !== 'customer_location' });
  return address ? { mode, address } : { mode };
}
function parsePhone(v) {
  const raw = str(v, 'customerPhone', { min: 8, max: 20 }).replace(/[\s-]/g, '');
  const m = /^(?:\+62|62|0)(8\d{8,12})$/.exec(raw);
  if (!m) throw bad('customerPhone harus nomor ponsel Indonesia yang valid');
  return `+62${m[1]}`;
}

export function createBooking(db, clock) {
  return async (req, res) => {
    const t = req.tenant.id;
    const uid = req.user.uid;
    rejectUnknown(req.body, ['tenantId', 'idempotencyKey', 'serviceItems', 'bookingDate', 'startTime',
      'customerName', 'customerPhone', 'location', 'notes']);
    const key = str(req.body.idempotencyKey, 'idempotencyKey', { min: 8, max: 64 });
    if (!/^[A-Za-z0-9_-]+$/.test(key)) throw bad('idempotencyKey tidak valid');
    const serviceIds = parseItems(req.body.serviceItems);
    const date = parseDate(req.body.bookingDate, 'bookingDate');
    const start = parseStart(req.body.startTime);
    const customerName = str(req.body.customerName, 'customerName', { min: 2, max: 80 });
    const customerPhone = parsePhone(req.body.customerPhone);
    const location = parseLocation(req.body.location);
    const notes = str(req.body.notes, 'notes', { max: 500, optional: true });
    const fingerprint = JSON.stringify([serviceIds, date, start, location]);

    const bookingRef = bookingsCol(db, t).doc();
    const idemRef = db.doc(`tenants/${t}/idempotencyKeys/${uid}_${key}`);
    const counterRef = db.doc(`tenants/${t}/counters/bookings`);
    let result;

    await db.runTransaction(async (tx) => {
      const nowMs = clock();

      // ---- SEMUA PEMBACAAN ----
      const idem = await tx.get(idemRef);
      if (idem.exists) {
        if (idem.data().fingerprint !== fingerprint) {
          throw new AppError('failed-precondition', 'idempotencyKey sudah dipakai untuk permintaan berbeda');
        }
        result = idem.data().result;
        return;
      }
      const s = requireSettings(await tx.get(settingsRef(db, t)));
      const svcSnaps = await tx.getAll(...serviceIds.map((id) => db.doc(`tenants/${t}/services/${id}`)));
      const sum = summarizeServices(svcSnaps, location.mode);
      const block = blockLength(sum.durationTotal, sum.prepTotal);

      if (start % s.slotIntervalMinutes !== 0) throw bad(`startTime harus kelipatan ${s.slotIntervalMinutes} menit`);
      const now = tenantNow(s.timezone, nowMs);
      const diff = dayIndex(date) - dayIndex(now.date);
      if (diff < 0 || diff > s.maxAdvanceDays) throw bad('Tanggal di luar rentang pemesanan');
      if (!fits(windowsFor(s, date), start, block)) throw conflict();
      if (absMinutes(date, start) < absMinutes(now.date, now.minute) + s.minLeadTimeMinutes) throw conflict();

      const mins = unitMinutes(start, block);
      const slotRefs = mins.map((m) => slotRef(db, t, slotId(date, m)));
      const slotSnaps = await tx.getAll(...slotRefs);
      const counterSnap = await tx.get(counterRef);
      const activeSnap = await tx.get(bookingsCol(db, t)
        .where('customerId', '==', uid).where('bookingStatus', 'in', ['pending', 'awaiting_payment']));

      // ---- VALIDASI ----
      if (activeSnap.size >= MAX_ACTIVE_PER_CUSTOMER) {
        throw new AppError('rate-limited', 'Terlalu banyak booking yang belum selesai');
      }
      for (const snap of slotSnaps) {
        if (activeCount(snap.exists ? snap.data().holds : {}, nowMs) >= s.capacity) throw conflict();
      }

      // ---- SEMUA PENULISAN ----
      const n = (counterSnap.exists ? counterSnap.data().value : 0) + 1;
      const bookingNumber = `BK-${String(n).padStart(6, '0')}`;
      const holdUntil = nowMs + s.holdMinutes * 60000;
      const ts = FieldValue.serverTimestamp();
      slotSnaps.forEach((snap, i) => {
        const holds = prunedHolds(snap.exists ? snap.data().holds : {}, nowMs);
        holds[bookingRef.id] = holdUntil;
        tx.set(slotRefs[i], { date, minute: mins[i], holds, updatedAt: ts });
      });
      tx.set(counterRef, { value: n });

      const bookingStatus = sum.deposit > 0 ? 'awaiting_payment' : 'pending';
      tx.set(bookingRef, {
        bookingNumber, customerId: uid, customerName, customerPhone,
        serviceItems: sum.items, bookingDate: date, startTime: formatTime(start),
        endTime: formatTime(start + sum.durationTotal), startMinute: start, blockMinutes: block,
        slotKeys: slotRefs.map((r) => r.id), timezone: s.timezone, location, notes: notes ?? null,
        subtotal: sum.subtotal, discount: 0, totalAmount: sum.subtotal, depositAmount: sum.deposit,
        paymentStatus: 'unpaid', bookingStatus, paymentDeadline: Timestamp.fromMillis(holdUntil),
        createdAt: ts, updatedAt: ts,
      });
      result = {
        bookingId: bookingRef.id, bookingNumber, totalAmount: sum.subtotal, depositAmount: sum.deposit,
        bookingStatus, paymentDeadline: new Date(holdUntil).toISOString(),
      };
      tx.set(idemRef, { fingerprint, result, createdAt: ts });
      tx.set(db.doc(`tenants/${t}/customers/${uid}`), { name: customerName, phone: customerPhone, updatedAt: ts }, { merge: true });
      tx.set(auditRef(db, t), auditEntry({
        actorUid: uid, tenantId: t, action: 'createBooking', resourceType: 'booking', resourceId: bookingRef.id,
      }));
    });

    res.json({ ok: true, data: result });
  };
}
