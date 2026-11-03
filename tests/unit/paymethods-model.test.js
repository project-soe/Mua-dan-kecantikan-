import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMethods, ORDER } from '../../public/assets/js/paymethods-model.js';

const labels = { bank_transfer: 'Transfer Bank', dana: 'DANA', qris: 'QRIS' };

test('metode kosong dan nonaktif dilewati; hasil dirapikan', () => {
  const out = buildMethods({
    bank_transfer: { enabled: true, accountName: ' Putri Salon ', bankName: ' BCA ', accountNumber: ' 1234 5678 ' },
    dana: { enabled: false },
    qris: { enabled: false, accountName: 'Putri Salon' },
  }, labels);
  assert.deepEqual(out, [
    { method: 'bank_transfer', enabled: true, accountName: 'Putri Salon', bankName: 'BCA', accountNumber: '1234 5678' },
    { method: 'qris', enabled: false, accountName: 'Putri Salon' },
  ]);
});
test('metode aktif wajib lengkap', () => {
  assert.throws(() => buildMethods({ bank_transfer: { enabled: true, accountName: 'P', bankName: 'BCA', accountNumber: '12345' } }, labels), /nama pemilik/);
  assert.throws(() => buildMethods({ bank_transfer: { enabled: true, accountName: 'Putri', accountNumber: '12345' } }, labels), /nama bank/);
  assert.throws(() => buildMethods({ dana: { enabled: true, accountName: 'Putri' } }, labels), /isi nomor/);
  assert.throws(() => buildMethods({ qris: { enabled: true, accountName: 'Putri' } }, labels), /QRIS/);
});
test('nomor harus angka; QRIS memakai gambar bukan nomor', () => {
  assert.throws(() => buildMethods({ dana: { enabled: true, accountName: 'Putri', accountNumber: 'abc123' } }, labels), /angka/);
  const q = buildMethods({ qris: { enabled: true, accountName: 'Putri', qrImage: 'tenants/t/payment-methods/q.webp', accountNumber: 'abaikan' } });
  assert.deepEqual(q, [{ method: 'qris', enabled: true, accountName: 'Putri', qrImage: 'tenants/t/payment-methods/q.webp' }]);
});
test('minimal satu metode; menerima Map; bank hanya membawa bankName untuk transfer', () => {
  assert.throws(() => buildMethods({}), /minimal satu/);
  const m = new Map([['dana', { enabled: true, accountName: 'Putri', accountNumber: '0812-3456-7890', bankName: 'diabaikan' }]]);
  assert.deepEqual(buildMethods(m), [{ method: 'dana', enabled: true, accountName: 'Putri', accountNumber: '0812-3456-7890' }]);
  assert.equal(ORDER.length, 6);
});
