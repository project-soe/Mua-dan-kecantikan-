// Teks status untuk pelanggan (murni, tanpa DOM).
export function bookingStatusText(b) {
  switch (b.bookingStatus) {
    case 'awaiting_payment': return 'Menunggu pembayaran';
    case 'payment_verification': return 'Pembayaran sedang diverifikasi';
    case 'pending': return 'Menunggu konfirmasi admin';
    case 'confirmed':
      if (b.pendingPaymentId) return 'Terkonfirmasi — pelunasan sedang diverifikasi';
      if (b.paymentStatus === 'paid') return 'Terkonfirmasi dan lunas';
      if (b.paymentStatus === 'partially_paid') return 'Terkonfirmasi — menunggu pelunasan';
      return 'Terkonfirmasi';
    case 'in_progress': return 'Sedang berlangsung';
    case 'completed': return 'Selesai';
    case 'cancelled': return b.cancelReason === 'expired' ? 'Dibatalkan — batas waktu pembayaran habis' : 'Dibatalkan';
    case 'rejected': return 'Ditolak';
    default: return String(b.bookingStatus);
  }
}

export function bookingAction(b) {
  if (b.bookingStatus === 'awaiting_payment') return { label: 'Bayar sekarang', primary: true };
  if (b.bookingStatus === 'confirmed' && b.paymentStatus === 'partially_paid' && !b.pendingPaymentId) {
    return { label: 'Bayar sisa pelunasan', primary: true };
  }
  return { label: 'Lihat detail', primary: false };
}

export function orderStatusText(o) {
  switch (o.orderStatus) {
    case 'pending': return o.shippingStatus === 'quoted' ? 'Menunggu persetujuan ongkir' : 'Menunggu kutipan ongkir';
    case 'awaiting_payment': return 'Menunggu pembayaran';
    case 'payment_verification': return 'Pembayaran sedang diverifikasi';
    case 'paid': return 'Sudah dibayar';
    case 'processing': return 'Sedang diproses';
    case 'shipped': return 'Dalam pengiriman';
    case 'delivered': return 'Sudah diterima';
    case 'completed': return 'Selesai';
    case 'cancelled': return o.cancelReason === 'expired' ? 'Dibatalkan — batas waktu habis' : 'Dibatalkan';
    case 'refunded': return 'Dana dikembalikan';
    default: return String(o.orderStatus);
  }
}

export const METHOD_LABEL = {
  bank_transfer: 'Transfer Bank', dana: 'DANA', ovo: 'OVO', gopay: 'GoPay', shopeepay: 'ShopeePay', qris: 'QRIS',
};
