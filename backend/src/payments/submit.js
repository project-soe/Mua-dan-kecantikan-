import { FieldValue } from 'firebase-admin/firestore';
import { PAYMENT_METHODS } from '../../../shared/constants/index.js';
import { AppError } from '../errors.js';
import { rejectUnknown, int, idOf, oneOf, storagePath } from '../validate.js';
import { auditEntry } from '../audit.js';
import { auditRef } from '../common.js';
import { bookingsCol, settingsRef, readSlots, activeCount, prunedHolds } from '../bookings/common.js';
import { bad, publicPayRef, paymentsCol, payableOptions, sha, MAX_PROOF_BYTES } from './common.js';

export function submitPaymentProof(db, clock, proofInfo) {
  return async (req, res) => {
    const t = req.tenant.id;
    const uid = req.user.uid;
    rejectUnknown(req.body, ['tenantId', 'bookingId', 'orderId', 'paymentMethod', 'proofStoragePath', 'amount']);
    if (req.body.bookingId !== undefined && req.body.orderId !== undefined) throw bad('Isi bookingId atau orderId, bukan keduanya');
    if (req.body.orderId !== undefined) throw new AppError('failed-precondition', 'Pembayaran pesanan produk belum tersedia');
    const bookingId = idOf(req.body.bookingId, 'bookingId');
    const method = oneOf(req.body.paymentMethod, PAYMENT_METHODS, 'paymentMethod');
    const amount = int(req.body.amount, 'amount', { min: 1 });
    const path = storagePath(req.body.proofStoragePath, 'proofStoragePath', `tenants/${t}/payment-proofs/${uid}/`);

    // Pemeriksaan file di luar transaksi (file bersifat create-only, tidak bisa ditimpa).
    if (typeof proofInfo !== 'function') throw new AppError('internal', 'Penyimpanan bukti belum dikonfigurasi');
    const info = await proofInfo(path);
    if (!info) throw bad('File bukti pembayaran tidak ditemukan');
    if (!/^image\/(jpeg|png|webp|avif)$/.test(info.contentType ?? '')) throw bad('Bukti pembayaran harus berupa gambar');
    if (!(info.size > 0 && info.size <= MAX_PROOF_BYTES)) throw bad('Ukuran bukti pembayaran tidak valid');

    const bookingRef = bookingsCol(db, t).doc(bookingId);
    const paymentRef = paymentsCol(db, t).doc();
    const proofKey = db.doc(`tenants/${t}/uniqueKeys/proof_${sha(path)}`);
    let result;

    await db.runTransaction(async (tx) => {
      const nowMs = clock();
      const bSnap = await tx.get(bookingRef);
      if (!bSnap.exists || bSnap.data().customerId !== uid) throw new AppError('resource-not-found', 'Booking tidak ditemukan');
      const b = bSnap.data();

      const keySnap = await tx.get(proofKey);
      if (keySnap.exists) {
        const k = keySnap.data();
        if (k.uid === uid && k.bookingId === bookingId && b.pendingPaymentId === k.paymentId) {
          result = { paymentId: k.paymentId, paymentStatus: 'submitted', bookingStatus: b.bookingStatus };
          return; // kirim ulang yang sama: hasil yang sama
        }
        throw new AppError('already-exists', 'Bukti pembayaran ini sudah pernah dipakai');
      }
      if (b.pendingPaymentId) throw new AppError('already-exists', 'Pembayaran sebelumnya masih diverifikasi');

      const opts = payableOptions(b);
      if (!opts) throw new AppError('failed-precondition', 'Booking tidak menerima pembayaran pada status ini');
      if (!Object.values(opts.options).includes(amount)) throw new AppError('payment-mismatch', 'Nominal pembayaran tidak sesuai');

      const [pubSnap, hoursSnap] = await tx.getAll(publicPayRef(db, t), settingsRef(db, t));
      if (!pubSnap.exists || !pubSnap.data().methods?.some((m) => m.method === method && m.enabled)) {
        throw bad('Metode pembayaran tidak tersedia');
      }
      const capacity = hoursSnap.exists ? hoursSnap.data().capacity : 1;
      const slots = opts.stage === 'initial' ? await readSlots(tx, db, t, b.slotKeys) : { refs: [], snaps: [] };
      for (const s of slots.snaps) {
        if (activeCount(s.exists ? s.data().holds : {}, nowMs, bookingId) >= capacity) {
          throw new AppError('booking-conflict', 'Jadwal sudah terisi booking lain. Hubungi admin.');
        }
      }

      const ts = FieldValue.serverTimestamp();
      const purpose = opts.stage === 'balance' ? 'balance' : (amount === b.totalAmount ? 'full' : 'deposit');
      tx.set(paymentRef, {
        orderId: null, bookingId, customerId: uid, method, amount, purpose, proofImagePath: path,
        paymentStatus: 'submitted', submittedAt: ts, verifiedBy: null, verifiedAt: null,
        rejectionReason: null, createdAt: ts,
      });
      tx.set(proofKey, { paymentId: paymentRef.id, bookingId, uid, createdAt: ts });
      const upd = { pendingPaymentId: paymentRef.id, updatedAt: ts };
      if (opts.stage === 'initial') {
        upd.bookingStatus = 'payment_verification';
        upd.paymentDeadline = null;
        upd.paymentPlan = purpose;
        slots.snaps.forEach((s, i) => {
          const holds = prunedHolds(s.exists ? s.data().holds : {}, nowMs);
          holds[bookingId] = null; // tahanan permanen selama verifikasi
          tx.set(slots.refs[i], { date: b.bookingDate, minute: b.startMinute + i * 15, holds, updatedAt: ts });
        });
      }
      tx.update(bookingRef, upd);
      tx.set(auditRef(db, t), auditEntry({
        actorUid: uid, tenantId: t, action: 'submitPaymentProof', resourceType: 'payment', resourceId: paymentRef.id,
        summary: { bookingId, amount, method },
      }));
      result = { paymentId: paymentRef.id, paymentStatus: 'submitted', bookingStatus: upd.bookingStatus ?? b.bookingStatus };
    });

    res.json({ ok: true, data: result });
  };
}
