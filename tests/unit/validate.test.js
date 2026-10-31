import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, int, str, httpsUrl, storagePath, rejectUnknown } from '../../backend/src/validate.js';

const invalid = (e) => e.code === 'invalid-argument';

test('slugify', () => {
  assert.equal(slugify('Lipstik Rosé Matte!'), 'lipstik-rose-matte');
  assert.equal(slugify('!!!'), 'item');
});
test('int menolak desimal, negatif, dan non-angka', () => {
  assert.equal(int(5, 'x'), 5);
  assert.equal(int(undefined, 'x', { optional: true }), undefined);
  assert.throws(() => int(10.5, 'x'), invalid);
  assert.throws(() => int(-1, 'x'), invalid);
  assert.throws(() => int('5', 'x'), invalid);
  assert.throws(() => int(undefined, 'x'), invalid);
});
test('str memangkas spasi dan memeriksa panjang', () => {
  assert.equal(str('  halo ', 'x', { min: 2 }), 'halo');
  assert.throws(() => str('a', 'x', { min: 2 }), invalid);
  assert.throws(() => str(5, 'x'), invalid);
});
test('httpsUrl hanya menerima https', () => {
  assert.equal(httpsUrl('https://a.com/logo.png', 'u'), 'https://a.com/logo.png');
  assert.throws(() => httpsUrl('http://a.com', 'u'), invalid);
  assert.throws(() => httpsUrl('javascript:alert(1)', 'u'), invalid);
});
test('storagePath menolak tenant lain dan path traversal', () => {
  const p = 'tenants/a/products/';
  assert.equal(storagePath(p + 'x.png', 'g', p), p + 'x.png');
  assert.throws(() => storagePath('tenants/b/products/x.png', 'g', p), invalid);
  assert.throws(() => storagePath(p + '../b/x.png', 'g', p), invalid);
});
test('rejectUnknown', () => {
  assert.throws(() => rejectUnknown({ a: 1, status: 'x' }, ['a']), invalid);
});
