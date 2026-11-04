import test from 'node:test';
import assert from 'node:assert/strict';
import { bucketOf, categoryChips, filterItems, featureIds, ctaFor, galleryStats } from '../../public/assets/js/gallery-model.js';

const cats = [{ id: 'bridal', name: 'Pengantin' }, { id: 'party', name: 'Pesta' }, { id: 'kosong', name: 'Tanpa Foto' }];
const items = [
  { id: 1, categoryId: 'bridal' }, { id: 2, categoryId: 'party' }, { id: 3, categoryId: 'bridal' },
  { id: 4 }, { id: 5, categoryId: 'tidak-dikenal' },
];

test('bucket: kategori dikenal, selain itu lainnya', () => {
  assert.equal(bucketOf(items[0], cats), 'bridal');
  assert.equal(bucketOf(items[3], cats), 'lainnya');
  assert.equal(bucketOf(items[4], cats), 'lainnya');
});

test('chip: urutan kategori, hanya yang punya foto, lainnya di akhir', () => {
  assert.deepEqual(categoryChips(items, cats), [
    { id: 'all', label: 'Semua', count: 5 },
    { id: 'bridal', label: 'Pengantin', count: 2 },
    { id: 'party', label: 'Pesta', count: 1 },
    { id: 'lainnya', label: 'Lainnya', count: 2 },
  ]);
  assert.deepEqual(categoryChips([], cats), [{ id: 'all', label: 'Semua', count: 0 }]);
});

test('filter', () => {
  assert.equal(filterItems(items, 'all', cats).length, 5);
  assert.deepEqual(filterItems(items, 'bridal', cats).map((x) => x.id), [1, 3]);
  assert.deepEqual(filterItems(items, 'lainnya', cats).map((x) => x.id), [4, 5]);
  assert.deepEqual(filterItems(items, 'kosong', cats), []);
});

test('foto unggulan: yang pertama boleh, berikutnya berjarak', () => {
  const f = (id, featured) => ({ id, featured });
  const list = [f(1, true), f(2, true), f(3, true), f(4, true), f(5, false), f(6, true)];
  assert.deepEqual([...featureIds(list, 2)], [1, 4]);
  assert.deepEqual([...featureIds([f(1, false), f(2, true)], 6)], [2]);
  assert.deepEqual([...featureIds([], 6)], []);
});

test('ajakan booking: satu layanan sekategori diarahkan langsung', () => {
  const services = [
    { id: 's1', name: 'Bridal Makeup', categoryId: 'bridal' },
    { id: 's2', name: 'Party Makeup', categoryId: 'party', bookingEnabled: false },
    { id: 's3', name: 'Party Lite', categoryId: 'party' },
    { id: 's4', name: 'Party Plus', categoryId: 'party' },
  ];
  assert.deepEqual(ctaFor({ categoryId: 'bridal' }, services), { path: '/booking/?service=s1', label: 'Booking Bridal Makeup' });
  assert.deepEqual(ctaFor({ categoryId: 'party' }, services), { path: '/booking/', label: 'Booking layanan' });
  assert.deepEqual(ctaFor({}, services), { path: '/booking/', label: 'Booking layanan' });
  assert.deepEqual(ctaFor({ categoryId: 'bridal' }, undefined), { path: '/booking/', label: 'Booking layanan' });
  assert.equal(ctaFor({ categoryId: 'bridal' }, [{ id: 'a b', name: 'X', categoryId: 'bridal' }]).path, '/booking/?service=a%20b');
});

test('statistik: jenis acara tidak menghitung Semua dan Lainnya', () => {
  const chips = categoryChips(items, cats);
  assert.deepEqual(galleryStats(items, chips), { results: 5, categories: 2 });
});
