import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../shared/constants/index.js';

const noDupes = (arr) => new Set(arr).size === arr.length;

test('daftar status tidak punya duplikat', () => {
  for (const k of ['ORDER_STATUS','BOOKING_STATUS','PAYMENT_DOC_STATUS','PAYMENT_STATUS',
    'SHIPMENT_STATUS','TENANT_STATUS','ERROR_CODES']) {
    assert.ok(noDupes(C[k]), k + ' duplikat');
  }
});

test('transisi order hanya merujuk status yang valid dan lengkap', () => {
  assert.deepEqual(Object.keys(C.ORDER_TRANSITIONS).sort(), [...C.ORDER_STATUS].sort());
  for (const [from, tos] of Object.entries(C.ORDER_TRANSITIONS)) {
    for (const to of tos) assert.ok(C.ORDER_STATUS.includes(to), from + ' -> ' + to);
  }
});

test('peran customer bukan peran tenant', () => {
  assert.ok(!Object.values(C.TENANT_ROLES).includes('customer'));
});
