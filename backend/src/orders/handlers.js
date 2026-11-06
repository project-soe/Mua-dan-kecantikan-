import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { ROLE_GROUPS } from '../../../shared/constants/index.js';
import { AppError } from '../errors.js';
import { rejectUnknown, str, int, idOf } from '../validate.js';
import { auditEntry } from '../audit.js';
import { auditRef } from '../common.js';

const bad = (m) => new AppError('invalid-argument', m);
const MAX_LINES = 20;
const MAX_QTY = 20;
const MAX_ACTIVE = 3;
const HOLD_MINUTES = 1440; // pesanan yang belum dibayar/dikutip kedaluwarsa setelah 24 jam
export const ordersCol = (db, t) => db.collection(`tenants/${t}/orders`);
const productRef = (db, t, id) => db.doc(`tenants/${t}/products/${id}`);

function parsePhone(v, name) {
  const raw = str(v, name, { min: 8, max: 20 }).replace(/[\s-]/g, '');
  const m = /^(?:\+62|62|0)(8\d{8,12})$/.exec(raw);
  if (!m) throw bad(`${name} harus nomor ponsel Indonesia yang valid`);
  return `+62${m[1]}`;
}
function parseItems(v) {
  if (!Array.isArray(v) || v.length < 1 || v.length > MAX_LINES) throw bad(`items harus berisi 1-${MAX_LINES} produk`);
  const items = v.map((x, i) => {
    if (typeof x !== 'object' || x === null) throw bad(`items[${i}] tidak valid`);
    rejectUnknown(x, ['productId', 'quantity']);
    return {
      productId: idOf(x.productId, `items[${i}].productId`),
      quantity: int(x.quantity, `items[${i}].quantity`, { min: 1, max: MAX_QTY }),
    };
  });
  if (new Set(items.map((i) => i.productId)).size !== items.length) throw bad('items tidak boleh duplikat');
  return items;
}
function parseAddress(v) {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw bad('shippingAddress wajib diisi');
  rejectUnknown(v, ['recipientName', 'phone', 'street', 'city', 'province', 'postalCode', 'notes']);
  const postalCode = str(v.postalCode, 'shippingAddress.postalCode', { min: 5, max: 5 });
  if (!/^\d{5}$/.test(postalCode)) throw bad('shippingAddress.postalCode harus 5 digit');
  const out = {
    recipientName: str(v.recipientName, 'shippingAddress.recipientName', { min: 2, max: 80 }),
    phone: parsePhone(v.phone, 'shippingAddress.phone'),
    street: str(v.street, 'shippingAddress.street', { min: 5, max: 200 }),
    city: str(v.city, 'shippingAddress.city', { min: 2, max: 80 }),
    province: str(v.province, 'shippingAddress.province', { min: 2, max: 80 }),
    postalCode,
  };
  const notes = str(v.notes, 'shippingAddress.notes', { max: 200, optional: true });
  if (notes) out.notes = notes;
  return out;
}

export function createOrder(db, clock) {
  return async (req, res) => {
    const t = req.tenant.id;
    const uid = req.user.uid;
    rejectUnknown(req.body, ['tenantId', 'idempotencyKey', 'items', 'shippingAddress', 'shippingMethod', 'customerNotes']);
    const key = str(req.body.idempotencyKey, 'idempotencyKey', { min: 8, max: 64 });
    if (!/^[A-Za-z0-9_-]+$/.test(key)) throw bad('idempotencyKey tidak valid');
    const items = parseItems(req.body.items);
    const address = parseAddress(req.body.shippingAddress);
    if (req.body.shippingMethod !== 'manual_quote') throw bad('shippingMethod saat ini hanya mendukung manual_quote');
    const notes = str(req.body.customerNotes, 'customerNotes', { max: 500, optional: true });
    const fingerprint = JSON.stringify([items, address, 'manual_quote']);

    const orderRef = ordersCol(db, t).doc();
    const idemRef = db.doc(`tenants/${t}/idempotencyKeys/${uid}_${key}`);
    const counterRef = db.doc(`tenants/${t}/counters/orders`);
    const prodRefs = items.map((i) => productRef(db, t, i.productId));
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
      const snaps = await tx.getAll(...prodRefs);
      const counterSnap = await tx.get(counterRef);
      const active = await tx.get(ordersCol(db, t)
        .where('customerId', '==', uid).where('orderStatus', 'in', ['pending', 'awaiting_payment']));

      // ---- VALIDASI ----
      if (active.size >= MAX_ACTIVE) throw new AppError('rate-limited', 'Terlalu banyak pesanan yang belum selesai');
      const lines = items.map((it, i) => {
        const s = snaps[i];
        if (!s.exists || s.data().published !== true) throw new AppError('resource-not-found', 'Produk tidak tersedia');
        const p = s.data();
        if ((p.stock ?? 0) < it.quantity) throw new AppError('out-of-stock', `Stok tidak mencukupi: ${p.name}`);
        const unitPrice = p.discountPrice ?? p.price; // harga selalu dari database
        return {
          productId: s.id, productName: p.name, sku: p.sku, variant: null, unitPrice,
          quantity: it.quantity, lineTotal: unitPrice * it.quantity,
          thumbnailUrl: p.thumbnailImage ?? p.coverImage ?? null, stockBefore: p.stock,
        };
      });
      const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0);

      // ---- SEMUA PENULISAN ----
      const ts = FieldValue.serverTimestamp();
      lines.forEach((l, i) => tx.update(prodRefs[i], { stock: l.stockBefore - l.quantity, updatedAt: ts }));
      const n = (counterSnap.exists ? counterSnap.data().value : 0) + 1;
      const orderNumber = `ORD-${String(n).padStart(6, '0')}`;
      const expiresMs = nowMs + HOLD_MINUTES * 60000;
      const snapshot = lines.map(({ stockBefore, ...rest }) => rest);
      tx.set(counterRef, { value: n });
      tx.set(orderRef, {
        orderNumber, customerId: uid, customerName: address.recipientName, customerPhone: address.phone,
        items: snapshot, subtotal, discount: 0, shippingCost: null, totalAmount: null,
        shippingMethod: 'manual_quote', shippingStatus: 'quote_requested', shippingAddressSnapshot: address,
        paymentStatus: 'unpaid', orderStatus: 'pending', notes: notes ?? null,
        expiresAt: Timestamp.fromMillis(expiresMs), createdAt: ts, updatedAt: ts,
      });
      result = {
        orderId: orderRef.id, orderNumber, items: snapshot, subtotal, discount: 0, shippingCost: null,
        totalAmount: null, orderStatus: 'pending', shippingStatus: 'quote_requested',
        expiresAt: new Date(expiresMs).toISOString(),
      };
      tx.set(idemRef, { fingerprint, result, createdAt: ts });
      tx.set(db.doc(`tenants/${t}/customers/${uid}`), { name: address.recipientName, phone: address.phone, updatedAt: ts }, { merge: true });
      tx.set(auditRef(db, t), auditEntry({
        actorUid: uid, tenantId: t, action: 'createOrder', resourceType: 'order', resourceId: orderRef.id,
        summary: { lines: items.length, subtotal },
      }));
    });

    res.json({ ok: true, data: result });
  };
}

async function readProducts(tx, db, t, order) {
  const refs = order.items.map((i) => productRef(db, t, i.productId));
  return { refs, snaps: await tx.getAll(...refs) };
}
function writeRestock(tx, { refs, snaps }, order, ts) {
  snaps.forEach((s, i) => {
    if (s.exists) tx.update(refs[i], { stock: (s.data().stock ?? 0) + order.items[i].quantity, updatedAt: ts });
  });
}

export function cancelOrder(db) {
  return async (req, res) => {
    const t = req.tenant.id;
    const uid = req.user.uid;
    rejectUnknown(req.body, ['tenantId', 'orderId', 'reason']);
    const orderId = idOf(req.body.orderId, 'orderId');
    const reason = str(req.body.reason, 'reason', { max: 200, optional: true });
    const ref = ordersCol(db, t).doc(orderId);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new AppError('resource-not-found', 'Pesanan tidak ditemukan');
      const o = snap.data();
      const mem = await tx.get(db.doc(`tenants/${t}/memberships/${uid}`));
      const m = mem.exists ? mem.data() : null;
      const staff = req.user.email_verified === true && m?.status === 'active' && ROLE_GROUPS.ADMIN.includes(m.role);
      if (o.customerId !== uid && !staff) throw new AppError('resource-not-found', 'Pesanan tidak ditemukan');
      if (!['pending', 'awaiting_payment'].includes(o.orderStatus)) {
        throw new AppError('failed-precondition', 'Pesanan tidak dapat dibatalkan pada status ini. Hubungi admin.');
      }
      const prods = await readProducts(tx, db, t, o);
      const ts = FieldValue.serverTimestamp();
      writeRestock(tx, prods, o, ts);
      tx.update(ref, { orderStatus: 'cancelled', cancelledBy: uid, cancelReason: reason ?? null, cancelledAt: ts, updatedAt: ts });
      tx.set(auditRef(db, t), auditEntry({
        actorUid: uid, tenantId: t, action: 'cancelOrder', resourceType: 'order', resourceId: orderId,
        summary: { by: staff && o.customerId !== uid ? 'staff' : 'customer' },
      }));
    });
    res.json({ ok: true, data: { orderId, orderStatus: 'cancelled' } });
  };
}

// Mengembalikan stok pesanan yang lewat batas waktu. Panggil berkala (cron) di produksi.
export function expireStaleOrders(db, clock) {
  return async (req, res) => {
    const t = req.tenant.id;
    rejectUnknown(req.body, ['tenantId']);
    const nowMs = clock();
    const stale = await ordersCol(db, t)
      .where('orderStatus', 'in', ['pending', 'awaiting_payment'])
      .where('expiresAt', '<=', Timestamp.fromMillis(nowMs)).limit(50).get();

    let expired = 0;
    for (const d of stale.docs) {
      const did = await db.runTransaction(async (tx) => {
        const snap = await tx.get(d.ref);
        const o = snap.data();
        if (!o || !['pending', 'awaiting_payment'].includes(o.orderStatus) || o.expiresAt.toMillis() > nowMs) return false;
        const prods = await readProducts(tx, db, t, o);
        const ts = FieldValue.serverTimestamp();
        writeRestock(tx, prods, o, ts);
        tx.update(d.ref, { orderStatus: 'cancelled', cancelReason: 'expired', cancelledAt: ts, updatedAt: ts });
        tx.set(auditRef(db, t), auditEntry({
          actorUid: req.user.uid, tenantId: t, action: 'expireOrder', resourceType: 'order', resourceId: d.id,
        }));
        return true;
      });
      if (did) expired += 1;
    }
    res.json({ ok: true, data: { expired, more: stale.size === 50 } });
  };
}
