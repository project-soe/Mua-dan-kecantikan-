import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPayload } from '../../public/assets/js/admin-form.js';
import { planSize, imagePaths, extOf } from '../../public/assets/js/image-tools.js';

const fields = [
  { name: 'name', label: 'Nama', type: 'text', required: true },
  { name: 'price', label: 'Harga', type: 'number', required: true, min: 0 },
  { name: 'discountPrice', label: 'Promo', type: 'number', min: 0 },
  { name: 'stock', label: 'Stok', type: 'number', createOnly: true, min: 0 },
  { name: 'active', label: 'Aktif', type: 'checkbox' },
  { name: 'gallery', label: 'Galeri', type: 'gallery' },
  { name: 'coverImage', label: 'Foto', type: 'image' },
];

test('buat baru: field kosong opsional dihilangkan, wajib divalidasi', () => {
  const r = buildPayload(fields, { name: ' Lipstik ', price: '100000', discountPrice: '', stock: '0', active: false, gallery: [], coverImage: '' }, null, true);
  assert.deepEqual(r.out, { name: 'Lipstik', price: 100000, stock: 0, active: false });
  assert.deepEqual(r.errors, []);
  const bad = buildPayload(fields, { name: '', price: '' }, null, true);
  assert.equal(bad.errors.length, 2);
});
test('angka harus bulat dan dalam batas', () => {
  assert.match(buildPayload(fields, { name: 'x', price: '10.5' }, null, true).errors[0], /bilangan bulat/);
  assert.match(buildPayload(fields, { name: 'x', price: '-1' }, null, true).errors[0], /batas/);
  assert.match(buildPayload(fields, { name: 'x', price: 'abc' }, null, true).errors[0], /bilangan bulat/);
});
test('ubah: hanya yang berubah; createOnly diabaikan; kosong = tidak berubah', () => {
  const orig = { name: 'Lipstik', price: 100000, stock: 5, active: true, gallery: ['a'], coverImage: 'p1' };
  const same = buildPayload(fields, { name: 'Lipstik', price: '100000', stock: '999', active: true, gallery: ['a'], coverImage: 'p1' }, orig, false);
  assert.deepEqual(same.out, {});
  const chg = buildPayload(fields, { name: 'Baru', price: '90000', active: false, gallery: ['a', 'b'], coverImage: 'p2' }, orig, false);
  assert.deepEqual(chg.out, { name: 'Baru', price: 90000, active: false, gallery: ['a', 'b'], coverImage: 'p2' });
  const blank = buildPayload(fields, { name: '', price: '', gallery: ['a'], coverImage: '' }, orig, false);
  assert.deepEqual(blank.out, {});
  assert.deepEqual(blank.errors, []);
});
test('galeri boleh dikosongkan saat ubah', () => {
  const r = buildPayload(fields, { name: 'Lipstik', price: '1', gallery: [] }, { name: 'Lipstik', price: 1, gallery: ['a'] }, false);
  assert.deepEqual(r.out, { gallery: [] });
});

test('planSize mengecilkan tanpa memperbesar', () => {
  assert.deepEqual(planSize(4000, 3000, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(planSize(800, 600, 1600), { width: 800, height: 600 });
  assert.deepEqual(planSize(1, 4000, 1600), { width: 1, height: 1600 });
});
test('imagePaths per area', () => {
  assert.deepEqual(imagePaths('t', 'products', 'id1', 'webp'), { full: 'tenants/t/products/optimized/id1.webp', thumb: 'tenants/t/products/thumbnails/id1.webp' });
  assert.deepEqual(imagePaths('t', 'services', 'id1', 'jpg'), { full: 'tenants/t/services/id1.jpg', thumb: null });
  assert.equal(imagePaths('t', 'portfolio', 'i', 'webp', 'jpg').thumb, 'tenants/t/portfolio/thumbnails/i.jpg');
  assert.throws(() => imagePaths('t', 'lain', 'i', 'webp'));
});
test('extOf', () => {
  assert.equal(extOf('image/webp'), 'webp');
  assert.equal(extOf('image/gif'), null);
  assert.equal(extOf('constructor'), null);
});
