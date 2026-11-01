import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { AppError } from '../errors.js';
import { rejectUnknown, int, idOf, oneOf, str } from '../validate.js';
import { auditEntry } from '../audit.js';
import { auditRef } from '../common.js';
import { bookingsCol, settingsRef, readSlots, prunedHolds } from '../bookings/common.js';
import { paymentsCol } from './common.js';

export function verifyPayment(db, clock) {
  return async (req, res) => {
    const t = req.tenant.id;
    const uid = req.user.uid;
    rejectUnknown(req.body, ['tenantId', 'paymentId', 'decision', 'rejectionReason', 'receivedAmount']);
    const paymentId = idOf(req.body.paymentId, 'paymentId');
    const decision = oneOf(req.body.decision, ['verify', 'reject'], 'decision');
    const reason = str(req.body.rejectionReason, 'rejectionReason', { min: 3, max: 300, optional: decision === 'verify' });
    const received = int(req.body.receivedAmount, 'receivedAmount', { min: 1, optional: true });

    const paymentRef = paymentsCol(db, t).doc(paymentId);
    let out;

    await db.runTransaction(async (tx) => {
      const nowMs = clock();
      const pSnap = await tx.get(paymentRef);
      if (!pSnap.exists) throw new AppError('resource-not-found', 'Pembayaran tidak ditemukan');
      const p = pSnap.data();
      if (p.paymentStatus !== 'submitted') throw new AppError('failed-precondition', 'Pembayaran sudah diproses');
      const bookingRef = bookingsCol(db, t).doc(p.bookingId);
      const bSnap = await tx.get(bookingRef);
      if (!bSnap.exists) throw new AppError('resource-not-found', 'Booking tidak ditemukan');
      const b = bSnap.data();
      if (b.pendingPaymentId !== paymentId) throw new AppError('failed-precondition', 'Status transaksi tidak konsisten');
      if (decision === 'verify' && received !== undefined && received !== p.amount) {
        throw new AppError('payment-mismatch', 'Nominal yang diterima tidak sesuai dengan pengajuan');
      }

      const reopen = decision === 'reject' && b.bookingStatus === 'payment_verification';
      let hold = 120; let slots = { refs: [], snaps: [] };
      if (reopen) {
        const hs = await tx.get(settingsRef(db, t));
        hold = hs.exists ? hs.data().holdMinutes : 120;
        slots = await readSlots(tx, db, t, b.slotKeys);
      }

      const ts = FieldValue.serverTimestamp();
      const upd = { pendingPaymentId: null, updatedAt: ts };
      if (decision === 'verify') {
        const paid = (b.paidAmount ?? 0) + p.amount;
        upd.paidAmount = paid;
        upd.paymentStatus = paid >= b.totalAmount ? 'paid' : 'partially_paid';
        if (b.bookingStatus === 'payment_verification') {
          upd.bookingStatus = 'confirmed'; upd.confirmedBy = uid; upd.confirmedAt = ts;
        }
        if (b.bookingStatus === 'cancelled') upd.refundReview = true; // uang diterima untuk booking batal
        tx.update(paymentRef, { paymentStatus: 'verified', verifiedBy: uid, verifiedAt: ts });
      } else {
        tx.update(paymentRef, { paymentStatus: 'rejected', rejectionReason: reason, verifiedBy: uid, verifiedAt: ts });
        if (reopen) {
          const until = nowMs + hold * 60000;
          upd.bookingStatus = 'awaiting_payment';
          upd.paymentDeadline = Timestamp.fromMillis(until);
          slots.snaps.forEach((s, i) => {
            const holds = prunedHolds(s.exists ? s.data().holds : {}, nowMs);
            holds[p.bookingId] = until; // tahanan kembali berbatas waktu
            tx.set(slots.refs[i], { date: b.bookingDate, minute: b.startMinute + i * 15, holds, updatedAt: ts });
          });
        }
      }
      tx.update(bookingRef, upd);
      tx.set(auditRef(db, t), auditEntry({
        actorUid: uid, tenantId: t, action: decision === 'verify' ? 'verifyPayment' : 'rejectPayment',
        resourceType: 'payment', resourceId: paymentId, summary: { bookingId: p.bookingId, amount: p.amount },
      }));
      out = {
        paymentStatus: decision === 'verify' ? 'verified' : 'rejected',
        updatedTransactionStatus: upd.bookingStatus ?? b.bookingStatus,
        bookingPaymentStatus: upd.paymentStatus ?? b.paymentStatus,
      };
    });

    res.json({ ok: true, data: out });
  };
}
