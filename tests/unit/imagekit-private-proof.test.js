import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createUploadAuth, createSignedMediaUrl } from '../../backend/src/media/imagekit.js';

const config = { publicKey: 'public_test', privateKey: 'private_test', urlEndpoint: 'https://ik.imagekit.io/test', clock: () => 1_800_000_000_000 };

test('private proof upload is scoped to customer UID and marked private', () => {
  const auth = createUploadAuth(config)({ tenantId: 'mua-putri', userId: 'customer_123', area: 'payment-proofs', contentType: 'image/png', size: 1024, role: 'customer' });
  assert.equal(auth.folder, '/tenants/mua-putri/payment-proofs/customer_123');
  assert.equal(auth.isPrivateFile, true);
  assert.equal(auth.maxBytes, 5 * 1024 * 1024);
});

test('private proof upload rejects staff role and oversized file', () => {
  const create = createUploadAuth(config);
  assert.throws(() => create({ tenantId: 'mua-putri', userId: 'x', area: 'payment-proofs', contentType: 'image/png', size: 1, role: 'admin' }), /pelanggan/);
  assert.throws(() => create({ tenantId: 'mua-putri', userId: 'x', area: 'payment-proofs', contentType: 'image/png', size: 6 * 1024 * 1024, role: 'customer' }), /Ukuran media/);
});

test('private proof signed URL is short-lived and signed with ImageKit HMAC-SHA1', () => {
  const build = createSignedMediaUrl(config);
  const url = build('/tenants/mua-putri/payment-proofs/customer_123/proof.png', 180);
  const expiry = 1_800_000_180;
  const sig = createHmac('sha1', config.privateKey).update('tenants/mua-putri/payment-proofs/customer_123/proof.png' + expiry).digest('hex');
  assert.equal(url, `https://ik.imagekit.io/test/tenants/mua-putri/payment-proofs/customer_123/proof.png?ik-t=${expiry}&ik-s=${sig}`);
});
