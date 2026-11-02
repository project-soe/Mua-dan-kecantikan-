import test from 'node:test';
import assert from 'node:assert/strict';
import { imagePaths } from '../../public/assets/js/image-tools.js';

test('area branding dan payment-methods', () => {
  assert.deepEqual(imagePaths('t', 'branding', 'i', 'webp'), { full: 'tenants/t/branding/i.webp', thumb: null });
  assert.deepEqual(imagePaths('t', 'payment-methods', 'i', 'png'), { full: 'tenants/t/payment-methods/i.png', thumb: null });
});
