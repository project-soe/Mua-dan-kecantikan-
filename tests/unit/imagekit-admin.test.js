import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageKitProofInfo } from '../../backend/src/media/imagekit-admin.js';

const details = (overrides = {}) => ({
  filePath: '/tenants/store-a/payment-proofs/customer-1/proof.png',
  size: 2048,
  mime: 'image/png',
  isPrivateFile: true,
  ...overrides,
});

test('ImageKit proof metadata is authenticated and scoped to tenant/customer', async () => {
  let request;
  const info = createImageKitProofInfo({
    privateKey: 'private_test',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => details() };
    },
  });
  const result = await info({ fileId: 'file_123', tenantId: 'store-a', userId: 'customer-1' });
  assert.equal(result.filePath, details().filePath);
  assert.equal(result.size, 2048);
  assert.equal(result.contentType, 'image/png');
  assert.match(request.url, /file_123\/details$/);
  assert.match(request.options.headers.Authorization, /^Basic /);
});

test('ImageKit proof metadata rejects public files and files outside customer folder', async () => {
  const create = (file) => createImageKitProofInfo({
    privateKey: 'private_test',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => file }),
  });
  await assert.rejects(create(details({ isPrivateFile: false }))({ fileId: 'x', tenantId: 'store-a', userId: 'customer-1' }), /bukan bukti pembayaran privat/);
  await assert.rejects(create(details({ filePath: '/tenants/store-b/payment-proofs/customer-1/proof.png' }))({ fileId: 'x', tenantId: 'store-a', userId: 'customer-1' }), /bukan bukti pembayaran privat/);
});

test('missing ImageKit proof returns null', async () => {
  const info = createImageKitProofInfo({
    privateKey: 'private_test',
    fetchImpl: async () => ({ ok: false, status: 404 }),
  });
  assert.equal(await info({ fileId: 'missing', tenantId: 'store-a', userId: 'customer-1' }), null);
});
