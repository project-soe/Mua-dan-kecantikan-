import test from 'node:test';
import assert from 'node:assert/strict';
import { stars, ratingLabel, ratingStats, summaryText, sortReviews, initials } from '../../public/assets/js/review-model.js';

test('bintang', () => {
  assert.equal(stars(5), '★★★★★');
  assert.equal(stars(3), '★★★☆☆');
  assert.equal(stars(0), '☆☆☆☆☆');
  assert.equal(stars(9), '★★★★★');
  assert.equal(stars('x'), '☆☆☆☆☆');
  assert.equal(ratingLabel(4), '4 dari 5 bintang');
});

test('statistik penilaian mengabaikan data tidak valid', () => {
  assert.deepEqual(ratingStats([]), { count: 0, average: null });
  assert.deepEqual(ratingStats([{ rating: 5 }, { rating: 4 }, { rating: 0 }, { rating: 4.5 }, {}]), { count: 2, average: 4.5 });
  assert.deepEqual(ratingStats([{ rating: 5 }, { rating: 5 }, { rating: 4 }]), { count: 3, average: 4.7 });
});

test('ringkasan: rata-rata hanya bila cukup data', () => {
  assert.equal(summaryText({ count: 0, average: null }), '');
  assert.equal(summaryText({ count: 2, average: 5 }), '2 testimoni');
  assert.equal(summaryText({ count: 12, average: 4.9 }), '★ 4,9 dari 5 · 12 testimoni');
  assert.equal(summaryText({ count: 3, average: 5 }), '★ 5,0 dari 5 · 3 testimoni');
});

test('urutan: unggulan dulu, lalu urutan, stabil', () => {
  const r = [{ id: 1, sortOrder: 2 }, { id: 2, featured: true, sortOrder: 5 }, { id: 3, sortOrder: 1 }, { id: 4, featured: true, sortOrder: 1 }, { id: 5, sortOrder: 1 }];
  assert.deepEqual(sortReviews(r).map((x) => x.id), [4, 2, 3, 5, 1]);
});

test('inisial', () => {
  assert.equal(initials('Siti Aminah'), 'SA');
  assert.equal(initials('  budi  '), 'B');
  assert.equal(initials('ayu putri lestari'), 'AP');
  assert.equal(initials(''), '');
  assert.equal(initials(undefined), '');
});
