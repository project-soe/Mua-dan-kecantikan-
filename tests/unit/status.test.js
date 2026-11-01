import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingStatusText, bookingAction, orderStatusText } from '../../public/assets/js/status.js';

test('status booking', () => {
  assert.equal(bookingStatusText({ bookingStatus: 'awaiting_payment' }), 'Menunggu pembayaran');
  assert.equal(bookingStatusText({ bookingStatus: 'confirmed', paymentStatus: 'paid' }), 'Terkonfirmasi dan lunas');
  assert.match(bookingStatusText({ bookingStatus: 'confirmed', paymentStatus: 'partially_paid' }), /menunggu pelunasan/);
  assert.match(bookingStatusText({ bookingStatus: 'confirmed', paymentStatus: 'partially_paid', pendingPaymentId: 'p' }), /sedang diverifikasi/);
  assert.match(bookingStatusText({ bookingStatus: 'cancelled', cancelReason: 'expired' }), /batas waktu/);
  assert.equal(bookingStatusText({ bookingStatus: 'cancelled' }), 'Dibatalkan');
  assert.equal(bookingStatusText({ bookingStatus: 'aneh' }), 'aneh');
});
test('aksi booking', () => {
  assert.deepEqual(bookingAction({ bookingStatus: 'awaiting_payment' }), { label: 'Bayar sekarang', primary: true });
  assert.deepEqual(bookingAction({ bookingStatus: 'confirmed', paymentStatus: 'partially_paid' }), { label: 'Bayar sisa pelunasan', primary: true });
  assert.equal(bookingAction({ bookingStatus: 'confirmed', paymentStatus: 'partially_paid', pendingPaymentId: 'p' }).primary, false);
  assert.equal(bookingAction({ bookingStatus: 'cancelled' }).label, 'Lihat detail');
});
test('status pesanan', () => {
  assert.equal(orderStatusText({ orderStatus: 'pending', totalAmount: null }), 'Menunggu kutipan ongkir');
  assert.equal(orderStatusText({ orderStatus: 'pending', totalAmount: 5 }), 'Menunggu diproses');
  assert.equal(orderStatusText({ orderStatus: 'shipped' }), 'Dalam pengiriman');
  assert.match(orderStatusText({ orderStatus: 'cancelled', cancelReason: 'expired' }), /batas waktu/);
});
