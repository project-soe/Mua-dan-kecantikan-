import test from 'node:test';
import assert from 'node:assert/strict';
import { priceInfo, stockInfo, slideList, factsFor, sortShowcase } from '../../public/assets/js/detail-model.js';

test('harga: promo hanya bila lebih murah', () => {
  assert.deepEqual(priceInfo({ price: 185000, discountPrice: 165000 }), { current: 165000, original: 185000, saving: 20000 });
  assert.deepEqual(priceInfo({ price: 100000 }), { current: 100000, original: null, saving: 0 });
  assert.equal(priceInfo({ price: 100000, discountPrice: 100000 }).original, null);
  assert.equal(priceInfo({ price: 100000, discountPrice: 120000 }).original, null);
});

test('stok: habis, menipis, tersedia', () => {
  assert.equal(stockInfo(0).level, 'out');
  assert.equal(stockInfo(undefined).level, 'out');
  assert.equal(stockInfo(-3).level, 'out');
  assert.deepEqual(stockInfo(3), { label: 'Tersisa 3', level: 'low' });
  assert.equal(stockInfo(5).level, 'low');
  assert.equal(stockInfo(6).level, 'ok');
});

test('slide: utama, perbandingan, galeri; tanpa duplikat dan nilai kosong', () => {
  const s = slideList('portfolio', { coverImage: 'c', beforeImage: 'b', afterImage: 'a', gallery: ['g1', 'c', '', null, 'g2'] });
  assert.deepEqual(s.map((x) => x.type), ['image', 'compare', 'image', 'image']);
  assert.deepEqual(s.filter((x) => x.type === 'image').map((x) => x.path), ['c', 'g1', 'g2']);
  assert.deepEqual(slideList('portfolio', { coverImage: 'c', beforeImage: 'b' }).map((x) => x.type), ['image']);
  assert.deepEqual(slideList('product', { coverImage: 'c', beforeImage: 'b', afterImage: 'a' }).map((x) => x.type), ['image']);
  assert.deepEqual(slideList('product', {}), []);
  assert.deepEqual(slideList('product', { gallery: 'bukan-array' }), []);
});

test('fakta per jenis', () => {
  assert.deepEqual(factsFor('product', { brand: 'Putri', weightGrams: 30 }), [['Merek', 'Putri'], ['Berat', '30 g']]);
  assert.deepEqual(factsFor('product', { weightGrams: 0 }), []);
  assert.deepEqual(factsFor('portfolio', { modelName: 'Sari', artistName: 'Putri' }), [['Model', 'Sari'], ['MUA', 'Putri']]);
});

test('urutan: produk tersedia dulu; portfolio unggulan lalu sortOrder; stabil', () => {
  const p = sortShowcase('product', [{ id: 1, stock: 0 }, { id: 2, stock: 4 }, { id: 3, stock: 0 }, { id: 4, stock: 9 }]);
  assert.deepEqual(p.map((x) => x.id), [2, 4, 1, 3]);
  const f = sortShowcase('portfolio', [{ id: 1, sortOrder: 2 }, { id: 2, featured: true, sortOrder: 5 }, { id: 3, sortOrder: 1 }, { id: 4, featured: true, sortOrder: 1 }]);
  assert.deepEqual(f.map((x) => x.id), [4, 2, 3, 1]);
});
