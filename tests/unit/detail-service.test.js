import test from 'node:test';
import assert from 'node:assert/strict';
import { factsFor, sortShowcase, slideList } from '../../public/assets/js/detail-model.js';

test('fakta layanan: durasi, deposit, lokasi', () => {
  const rows = factsFor('service', { durationMinutes: 180, depositAmount: 500000, locationMode: 'both' });
  assert.deepEqual(rows[0], ['Durasi', '3 jam']);
  assert.equal(rows[1][0], 'Deposit');
  assert.match(rows[1][1], /Rp\s?500\.000/);
  assert.deepEqual(rows[2], ['Lokasi', 'Studio atau lokasi Anda']);
  assert.deepEqual(factsFor('service', { durationMinutes: 60, depositAmount: 0, locationMode: 'constructor' }), [['Durasi', '1 jam']]);
  assert.deepEqual(factsFor('service', {}), []);
});

test('urutan layanan: bisa dibooking dulu, lalu nama', () => {
  const s = sortShowcase('service', [
    { id: 1, name: 'Party Makeup' }, { id: 2, name: 'Wisuda', bookingEnabled: false },
    { id: 3, name: 'Bridal Makeup' }, { id: 4, name: 'Akad', bookingEnabled: false },
  ]);
  assert.deepEqual(s.map((x) => x.id), [3, 1, 4, 2]);
});

test('slide layanan: foto utama dan galeri tanpa perbandingan', () => {
  const s = slideList('service', { coverImage: 'c', beforeImage: 'b', afterImage: 'a', gallery: ['g1', 'c'] });
  assert.deepEqual(s, [{ type: 'image', path: 'c' }, { type: 'image', path: 'g1' }]);
});
