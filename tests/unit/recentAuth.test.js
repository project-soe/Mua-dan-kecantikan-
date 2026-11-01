import test from 'node:test';
import assert from 'node:assert/strict';
import { isRecentAuth } from '../../backend/src/payments/recentAuth.js';

test('isRecentAuth', () => {
  const now = 1_900_000_000_000;
  const s = now / 1000;
  assert.equal(isRecentAuth(s - 60, now, 900), true);
  assert.equal(isRecentAuth(s - 901, now, 900), false);
  assert.equal(isRecentAuth(s + 3600, now, 900), false); // dari masa depan
  assert.equal(isRecentAuth(undefined, now, 900), false);
});
