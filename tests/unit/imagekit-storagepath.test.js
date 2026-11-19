import test from 'node:test';
import assert from 'node:assert/strict';

process.env.IMAGEKIT_URL_ENDPOINT = 'https://ik.imagekit.io/muaAndBeauty';
const { storagePath } = await import('../../backend/src/validate.js');

const invalid = (error) => error.code === 'invalid-argument';
const prefix = 'tenants/mua-putri/services/';
const validUrl = 'https://ik.imagekit.io/muaAndBeauty/tenants/mua-putri/services/c0143d3e-b2be-4644-bf3f-1fad3a49b342-image_bbKl8UieR.webp?updatedAt=1794999795846';

test('storagePath menerima URL ImageKit dengan base path dan updatedAt', () => {
  assert.equal(storagePath(validUrl, 'coverImage', prefix), validUrl);
});

test('storagePath tetap menerima path relatif tenant yang valid', () => {
  const path = prefix + 'service.webp';
  assert.equal(storagePath(path, 'coverImage', prefix), path);
});

test('storagePath menolak URL dari origin atau folder tenant lain', () => {
  assert.throws(
    () => storagePath(validUrl.replace('ik.imagekit.io', 'evil.example'), 'coverImage', prefix),
    invalid,
  );
  assert.throws(
    () => storagePath(validUrl.replace('mua-putri/services/', 'tenant-lain/services/'), 'coverImage', prefix),
    invalid,
  );
});

test('storagePath hanya menerima query updatedAt numerik tunggal', () => {
  assert.throws(() => storagePath(validUrl + '&download=1', 'coverImage', prefix), invalid);
  assert.throws(() => storagePath(validUrl.replace('1794999795846', 'abc'), 'coverImage', prefix), invalid);
});

test('storagePath menolak encoded path dan fragment pada URL ImageKit', () => {
  assert.throws(() => storagePath(validUrl.replace('/services/', '/services/%2e%2e/'), 'coverImage', prefix), invalid);
  assert.throws(() => storagePath(validUrl + '#preview', 'coverImage', prefix), invalid);
});
