import { AppError } from '../errors.js';
import { rejectUnknown, idOf } from '../validate.js';
import { bookingsCol } from '../bookings/common.js';
import { bad, publicPayRef, payableOptions } from './common.js';

export function getPaymentInstructions(db) {
  return async (req, res) => {
    const t = req.tenant.id;
    rejectUnknown(req.body, ['tenantId', 'bookingId', 'orderId']);
    if (req.body.bookingId !== undefined && req.body.orderId !== undefined) throw bad('Isi bookingId atau orderId, bukan keduanya');
    if (req.body.orderId !== undefined) throw new AppError('failed-precondition', 'Pembayaran pesanan produk belum tersedia');
    const bookingId = idOf(req.body.bookingId, 'bookingId');

    const [bSnap, pSnap] = await db.getAll(bookingsCol(db, t).doc(bookingId), publicPayRef(db, t));
    if (!bSnap.exists || bSnap.data().customerId !== req.user.uid) {
      throw new AppError('resource-not-found', 'Booking tidak ditemukan');
    }
    const b = bSnap.data();
    const opts = payableOptions(b);
    if (!opts) throw new AppError('failed-precondition', 'Booking tidak memerlukan pembayaran saat ini');
    const pub = pSnap.exists ? pSnap.data() : { methods: [] };
    const supportedMethods = pub.methods.filter((m) => m.enabled).map(({ enabled, ...m }) => m);
    if (!supportedMethods.length) throw new AppError('failed-precondition', 'Metode pembayaran belum tersedia');

    res.json({ ok: true, data: {
      bookingId, bookingNumber: b.bookingNumber, stage: opts.stage, amountOptions: opts.options,
      supportedMethods, instructionsText: pub.instructionsText ?? '',
      paymentDeadline: b.paymentDeadline ? b.paymentDeadline.toDate().toISOString() : null,
    } });
  };
}
