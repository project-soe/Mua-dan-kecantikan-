import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createUploadAuth } from '../../backend/src/media/imagekit.js';

const base = {
  publicKey: 'public_test',
  privateKey: 'private_test',
  urlEndpoint: 'https://ik.imagekit.io/test',
  clock: () => 1_800_000_000_000,
};

test('ImageKit upload auth is short-lived and tenant-scoped by folder metadata', () => {
  const create = createUploadAuth(base);
  const result = create({ tenantId: 'mua-putri', area: 'products', contentType: 'image/webp', size: 1024, role: 'content_manager' });
  assert.equal(result.folder, '/tenants/mua-putri/products');
  assert.equal(result.publicKey, 'public_test');
  assert.equal(result.expire, 1_800_000_300);
  assert.equal(result.signature, createHmac('sha1', 'private_test').update(result.token + result.expire).digest('hex'));
});

test('QRIS upload is limited to owner and finance manager', () => {
  const create = createUploadAuth(base);
  assert.throws(() => create({ tenantId: 'mua-putri', area: 'payment-methods', contentType: 'image/png', size: 10, role: 'content_manager' }), /Hanya owner/);
  assert.equal(create({ tenantId: 'mua-putri', area: 'payment-methods', contentType: 'image/png', size: 10, role: 'finance_manager' }).folder,
    '/tenants/mua-putri/payment-methods');
});

test('video MIME and size are checked before credentials are issued', () => {
  const create = createUploadAuth(base);
  assert.throws(() => create({ tenantId: 'mua-putri', area: 'videos', contentType: 'image/png', size: 10, role: 'owner' }), /Tipe media/);
  assert.throws(() => create({ tenantId: 'mua-putri', area: 'videos', contentType: 'video/mp4', size: 101 * 1024 * 1024, role: 'owner' }), /Ukuran media/);
});
