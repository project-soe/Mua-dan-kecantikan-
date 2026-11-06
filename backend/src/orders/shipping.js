import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { AppError } from '../errors.js';
import { rejectUnknown, int, idOf, str } from '../validate.js';
import { auditEntry } from '../audit.js';
import { auditRef } from '../common.js';

const orders = (db, tenantId) => db.collection(`tenants/${tenantId}/orders`);
const bad = (message) => new AppError('invalid-argument', message);

// Admin menetapkan ongkir; total dihitung server dari subtotal tersimpan + ongkir.
export function setOrderShippingQuote(db, clock = Date.now) {
  return async (req, res) => {
    const tenantId = req.tenant.id;
    const uid = req.user.uid;
    rejectUnknown(req.body, ['tenantId', 'orderId', 'shippingCost', 'shippingNotes']);
    const orderId = idOf(req.body.orderId, 'orderId');
    const shippingCost = int(req.body.shippingCost, 'shippingCost', { min: 0, max: 100000000 });
    const shippingNotes = str(req.body.shippingNotes, 'shippingNotes', { max: 300, optional: true });
    const ref = orders(db, tenantId).doc(orderId);
    let result;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new AppError('resource-not-found', 'Pesanan tidak ditemukan');
      const order = snap.data();
      if (order.orderStatus !== 'pending' || order.shippingStatus !== 'quote_requested'
        || (order.expiresAt?.toMillis && order.expiresAt.toMillis() <= clock())) {
        throw new AppError('failed-precondition', 'Pesanan tidak sedang menunggu penawaran ongkir');
      }
      const totalAmount = order.subtotal + shippingCost;
      const ts = FieldValue.serverTimestamp();
      const expiresAt = Timestamp.fromMillis(clock() + 24 * 60 * 60 * 1000);
      tx.update(ref, { shippingCost, totalAmount, shippingStatus: 'quoted', shippingNotes: shippingNotes ?? null,
        quotedBy: uid, quotedAt: ts, expiresAt, updatedAt: ts });
      tx.set(auditRef(db, tenantId), auditEntry({ actorUid: uid, tenantId, action: 'setOrderShippingQuote',
        resourceType: 'order', resourceId: orderId, summary: { shippingCost, totalAmount } }));
      result = { orderId, shippingCost, totalAmount, shippingStatus: 'quoted', expiresAt: expiresAt.toDate().toISOString() };
    });
    res.json({ ok: true, data: result });
  };
}

// Pelanggan harus menyetujui nominal final sebelum pesanan menerima pembayaran.
export function acceptOrderShippingQuote(db, clock = Date.now) {
  return async (req, res) => {
    const tenantId = req.tenant.id;
    const uid = req.user.uid;
    rejectUnknown(req.body, ['tenantId', 'orderId']);
    const orderId = idOf(req.body.orderId, 'orderId');
    const ref = orders(db, tenantId).doc(orderId);
    let result;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data().customerId !== uid) throw new AppError('resource-not-found', 'Pesanan tidak ditemukan');
      const order = snap.data();
      if (order.orderStatus !== 'pending' || order.shippingStatus !== 'quoted'
        || (order.expiresAt?.toMillis && order.expiresAt.toMillis() <= clock())
        || !Number.isSafeInteger(order.totalAmount) || order.totalAmount < order.subtotal) {
        throw new AppError('failed-precondition', 'Penawaran ongkir belum tersedia atau sudah diproses');
      }
      const ts = FieldValue.serverTimestamp();
      const expiresAt = Timestamp.fromMillis(clock() + 24 * 60 * 60 * 1000);
      tx.update(ref, { orderStatus: 'awaiting_payment', shippingStatus: 'accepted',
        quoteAcceptedAt: ts, expiresAt, updatedAt: ts });
      tx.set(auditRef(db, tenantId), auditEntry({ actorUid: uid, tenantId, action: 'acceptOrderShippingQuote',
        resourceType: 'order', resourceId: orderId, summary: { totalAmount: order.totalAmount } }));
      result = { orderId, orderStatus: 'awaiting_payment', totalAmount: order.totalAmount,
        expiresAt: expiresAt.toDate().toISOString() };
    });
    res.json({ ok: true, data: result });
  };
}
