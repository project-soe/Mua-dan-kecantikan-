import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { ROLE_GROUPS } from '../../../shared/constants/index.js';
import { AppError } from '../errors.js';
import { rejectUnknown, str, idOf } from '../validate.js';
import { auditEntry } from '../audit.js';
import { auditRef } from '../common.js';
import { tenantNow, absMinutes } from './schedule.js';
import {
  bookingsCol, settingsRef, readSlots, writeRelease, activeCount, prunedHolds,
} from './common.js';

const notFound = () => new AppError('resource-not-found', 'Booking tidak ditemukan');
const CANCELLABLE = ['pending', 'awaiting_payment', 'payment_verification', 'confirmed'];

export function confirmBooking(db, clock) {
  return async (req, res) => {
    const t = req.tenant.id;
    rejectUnknown(req.body, ['tenantId', 'bookingId']);
    const bookingId = idOf(req.body.bookingId, 'bookingId');
    const ref = bookingsCol(db, t).doc(bookingId);

    await db.runTransaction(async (tx) => {
      const nowMs = clock();
      const snap = await tx.get(ref);
      if (!snap.exists) throw notFound();
      const b = snap.data();
      if (!['pending', 'payment_verification'].includes(b.bookingStatus)) {
        throw new AppError('failed-precondition', 'Status booking tidak dapat dikonfirmasi');
      }
      const settings = await tx.get(settingsRef(db, t));
      const capacity = settings.exists ? settings.data().capacity : 1;
      const slots = await readSlots(tx, db, t, b.slotKeys);

      // Jika tahanan sudah hilang (kedaluwarsa & terpangkas), pastikan masih ada kapasitas.
      for (const s of slots.snaps) {
        const holds = s.exists ? s.data().holds ?? {} : {};
        if (activeCount(holds, nowMs, bookingId) >= capacity) {
          throw new AppError('booking-conflict', 'Jadwal sudah terisi booking lain');
        }
      }
      const ts = FieldValue.serverTimestamp();
      slots.snaps.forEach((s, i) => {
        const holds = prunedHolds(s.exists ? s.data().holds : {}, nowMs);
        holds[bookingId] = null; // permanen
        tx.set(slots.refs[i], { date: b.bookingDate, minute: b.startMinute + i * 15, holds, updatedAt: ts });
      });
      tx.update(ref, {
        bookingStatus: 'confirmed', confirmedBy: req.user.uid, confirmedAt: ts,
        paymentDeadline: null, updatedAt: ts,
      });
      tx.set(auditRef(db, t), auditEntry({
        actorUid: req.user.uid, tenantId: t, action: 'confirmBooking', resourceType: 'booking', resourceId: bookingId,
      }));
    });
    res.json({ ok: true, data: { bookingId, bookingStatus: 'confirmed' } });
  };
}

export function cancelBooking(db, clock) {
  return async (req, res) => {
    const t = req.tenant.id;
    const uid = req.user.uid;
    rejectUnknown(req.body, ['tenantId', 'bookingId', 'reason']);
    const bookingId = idOf(req.body.bookingId, 'bookingId');
    const reason = str(req.body.reason, 'reason', { max: 200, optional: true });
    const ref = bookingsCol(db, t).doc(bookingId);
    let refundReview = false;

    await db.runTransaction(async (tx) => {
      const nowMs = clock();
      const snap = await tx.get(ref);
      if (!snap.exists) throw notFound();
      const b = snap.data();
      const memberSnap = await tx.get(db.doc(`tenants/${t}/memberships/${uid}`));
      const settingsSnap = await tx.get(settingsRef(db, t));
      const slots = await readSlots(tx, db, t, b.slotKeys);

      const m = memberSnap.exists ? memberSnap.data() : null;
      const staff = req.user.email_verified === true && m?.status === 'active' && ROLE_GROUPS.ADMIN.includes(m.role);
      const owner = b.customerId === uid;
      if (!owner && !staff) throw notFound(); // jangan bocorkan keberadaan booking orang lain

      if (!CANCELLABLE.includes(b.bookingStatus)) {
        throw new AppError('failed-precondition', 'Booking tidak dapat dibatalkan pada status ini');
      }
      if (!staff && ['confirmed', 'payment_verification'].includes(b.bookingStatus)) {
        const s = settingsSnap.exists ? settingsSnap.data() : { timezone: b.timezone, cancelCutoffHours: 24 };
        const now = tenantNow(s.timezone, nowMs);
        const hoursLeft = (absMinutes(b.bookingDate, b.startMinute) - absMinutes(now.date, now.minute)) / 60;
        if (hoursLeft < (s.cancelCutoffHours ?? 24)) {
          throw new AppError('failed-precondition', 'Pembatalan melewati batas waktu yang ditentukan');
        }
      }

      refundReview = b.paymentStatus !== 'unpaid';
      const ts = FieldValue.serverTimestamp();
      writeRelease(tx, slots, bookingId, nowMs, ts);
      tx.update(ref, {
        bookingStatus: 'cancelled', cancelledBy: uid, cancelReason: reason ?? null,
        cancelledAt: ts, paymentDeadline: null, refundReview, updatedAt: ts,
      });
      tx.set(auditRef(db, t), auditEntry({
        actorUid: uid, tenantId: t, action: 'cancelBooking', resourceType: 'booking', resourceId: bookingId,
        summary: { by: staff && !owner ? 'staff' : 'customer', from: b.bookingStatus },
      }));
    });
    res.json({ ok: true, data: { bookingId, bookingStatus: 'cancelled', refundReview } });
  };
}

// Merapikan status booking yang tahanannya sudah lewat. Slotnya sendiri sudah otomatis
// dianggap kosong; endpoint ini hanya menyinkronkan status. Panggil berkala (cron) atau manual.
export function expireStaleBookings(db, clock) {
  return async (req, res) => {
    const t = req.tenant.id;
    rejectUnknown(req.body, ['tenantId']);
    const nowMs = clock();
    const stale = await bookingsCol(db, t)
      .where('bookingStatus', 'in', ['pending', 'awaiting_payment'])
      .where('paymentDeadline', '<=', Timestamp.fromMillis(nowMs)).limit(50).get();

    let expired = 0;
    for (const d of stale.docs) {
      const did = await db.runTransaction(async (tx) => {
        const snap = await tx.get(d.ref);
        const b = snap.data();
        if (!b || !['pending', 'awaiting_payment'].includes(b.bookingStatus)
          || !b.paymentDeadline || b.paymentDeadline.toMillis() > nowMs) return false;
        const slots = await readSlots(tx, db, t, b.slotKeys);
        const ts = FieldValue.serverTimestamp();
        writeRelease(tx, slots, d.id, nowMs, ts);
        tx.update(d.ref, {
          bookingStatus: 'cancelled', cancelReason: 'expired', cancelledAt: ts,
          paymentDeadline: null, updatedAt: ts,
        });
        tx.set(auditRef(db, t), auditEntry({
          actorUid: req.user.uid, tenantId: t, action: 'expireBooking', resourceType: 'booking', resourceId: d.id,
        }));
        return true;
      });
      if (did) expired += 1;
    }
    res.json({ ok: true, data: { expired, more: stale.size === 50 } });
  };
}
