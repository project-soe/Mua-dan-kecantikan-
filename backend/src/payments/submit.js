import { FieldValue } from 'firebase-admin/firestore';
import { PAYMENT_METHODS } from '../../../shared/constants/index.js';
import { AppError } from '../errors.js';
import { rejectUnknown, int, idOf, oneOf } from '../validate.js';
import { auditEntry } from '../audit.js';
import { auditRef } from '../common.js';
import { bookingsCol, settingsRef, readSlots, activeCount, prunedHolds } from '../bookings/common.js';
import { ordersCol } from '../orders/handlers.js';
import { bad, publicPayRef, paymentsCol, payableOptions, sha, MAX_PROOF_BYTES } from './common.js';

export function submitPaymentProof(db, clock, proofInfo) {
  return async (req, res) => {
    const t = req.tenant.id;
    const uid = req.user.uid;
    rejectUnknown(req.body, ['tenantId', 'bookingId', 'orderId', 'paymentMethod', 'proofFileId', 'proofStoragePath', 'amount']);
    if (req.body.bookingId !== undefined && req.body.orderId !== undefined) throw bad('Isi bookingId atau orderId, bukan keduanya');
    const orderId = req.body.orderId !== undefined ? idOf(req.body.orderId, 'orderId') : null;
    const bookingId = orderId ? null : idOf(req.body.bookingId, 'bookingId');
    const method = oneOf(req.body.paymentMethod, PAYMENT_METHODS, 'paymentMethod');
    const amount = int(req.body.amount, 'amount', { min: 1 });
    if (typeof proofInfo !== 'function') throw new AppError('internal', 'Penyimpanan bukti belum dikonfigurasi');
    const isImageKit = typeof req.body.proofFileId === 'string';
    let info, path, proofKey;
    if (isImageKit) {
      info = await proofInfo({ fileId: req.body.proofFileId, tenantId: t, userId: uid });
      if (!info) throw bad('File bukti pembayaran tidak ditemukan');
      if (!/^image\/(jpeg|png|webp|avif)$/.test(info.contentType ?? '')) throw bad('Bukti pembayaran harus berupa gambar');
      if (!(info.size > 0 && info.size <= MAX_PROOF_BYTES)) throw bad('Ukuran bukti pembayaran tidak valid');
      path = info.filePath;
      proofKey = db.doc(`tenants/${t}/uniqueKeys/proof_${sha(req.body.proofFileId)}`);
    } else {
      // Kompatibilitas untuk test/emulator dan bukti lama Firebase Storage.
      path = req.body.proofStoragePath;
      if (typeof path !== 'string' || !path.startsWith(`tenants/${t}/payment-proofs/${uid}/`)) throw bad('Path bukti pembayaran tidak valid');
      info = await proofInfo(path);
      if (!info) throw bad('File bukti pembayaran tidak ditemukan');
      if (!/^image\/(jpeg|png|webp|avif)$/.test(info.contentType ?? '')) throw bad('Bukti pembayaran harus berupa gambar');
      if (!(info.size > 0 && info.size <= MAX_PROOF_BYTES)) throw bad('Ukuran bukti pembayaran tidak valid');
      proofKey = db.doc(`tenants/${t}/uniqueKeys/proof_${sha(path)}`);
    }

    if (orderId) {
      const orderRef = ordersCol(db, t).doc(orderId);
      const paymentRef = paymentsCol(db, t).doc();
      
      let orderResult;
      await db.runTransaction(async (tx) => {
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists || orderSnap.data().customerId !== uid) throw new AppError('resource-not-found', 'Pesanan tidak ditemukan');
        const order = orderSnap.data();
        const keySnap = await tx.get(proofKey);
        if (keySnap.exists) {
          const key = keySnap.data();
          if (key.uid === uid && key.orderId === orderId && order.pendingPaymentId === key.paymentId) {
            orderResult = { paymentId: key.paymentId, paymentStatus: 'submitted', orderStatus: order.orderStatus };
            return;
          }
          throw new AppError('already-exists', 'Bukti pembayaran ini sudah pernah dipakai');
        }
        if (order.orderStatus !== 'awaiting_payment' || order.pendingPaymentId
          || (order.expiresAt?.toMillis && order.expiresAt.toMillis() <= clock())) {
          throw new AppError('failed-precondition', 'Pesanan belum menerima pembayaran, sudah kedaluwarsa, atau pembayaran sedang diverifikasi');
        }
        if (amount !== order.totalAmount) throw new AppError('payment-mismatch', 'Nominal pembayaran harus sama dengan total pesanan');
        const pubSnap = await tx.get(publicPayRef(db, t));
        if (!pubSnap.exists || !pubSnap.data().methods?.some((m) => m.method === method && m.enabled)) throw bad('Metode pembayaran tidak tersedia');
        const ts = FieldValue.serverTimestamp();
        tx.set(paymentRef, { orderId, bookingId: null, customerId: uid, method, amount, purpose: 'order',
          proofImagePath: path, ...(isImageKit ? { proofImageFileId: req.body.proofFileId, proofStorageProvider: 'imagekit' } : {}), paymentStatus: 'submitted', submittedAt: ts, verifiedBy: null, verifiedAt: null,
          rejectionReason: null, createdAt: ts });
        tx.set(proofKey, { paymentId: paymentRef.id, orderId, uid, createdAt: ts });
        tx.update(orderRef, { pendingPaymentId: paymentRef.id, orderStatus: 'payment_verification', updatedAt: ts });
        tx.set(auditRef(db, t), auditEntry({ actorUid: uid, tenantId: t, action: 'submitOrderPaymentProof',
          resourceType: 'payment', resourceId: paymentRef.id, summary: { orderId, amount, method } }));
        orderResult = { paymentId: paymentRef.id, paymentStatus: 'submitted', orderStatus: 'payment_verification' };
      });
      res.json({ ok: true, data: orderResult });
      return;
    }

    const bookingRef = bookingsCol(db, t).doc(bookingId);
    const paymentRef = paymentsCol(db, t).doc();
    if (!proofKey) proofKey = db.doc(`tenants/${t}/uniqueKeys/proof_${sha(path)}`);
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
        orderId: null, bookingId, customerId: uid, method, amount, purpose, proofImagePath: path, ...(isImageKit ? { proofImageFileId: req.body.proofFileId, proofStorageProvider: 'imagekit' } : {}),
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
