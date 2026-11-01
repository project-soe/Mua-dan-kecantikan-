import { createHash } from 'node:crypto';
import { AppError } from '../errors.js';

export const bad = (m) => new AppError('invalid-argument', m);
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
export const sha = (s) => createHash('sha256').update(s).digest('hex');
export const paymentsCol = (db, t) => db.collection(`tenants/${t}/payments`);
export const publicPayRef = (db, t) => db.doc(`tenants/${t}/settings/paymentPublic`);

// Nominal yang boleh dibayar saat ini; null bila booking tidak sedang menerima pembayaran.
export function payableOptions(b) {
  const paid = b.paidAmount ?? 0;
  if (b.pendingPaymentId) return null;
  if (b.bookingStatus === 'awaiting_payment' && paid === 0) {
    return { stage: 'initial', options: { deposit: b.depositAmount, full: b.totalAmount } };
  }
  if (b.bookingStatus === 'confirmed' && b.paymentStatus === 'partially_paid') {
    return { stage: 'balance', options: { balance: b.totalAmount - paid } };
  }
  return null;
}
