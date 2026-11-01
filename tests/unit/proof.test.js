import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProofFile, proofPath, MAX_PROOF_BYTES } from '../../public/assets/js/proof.js';

test('validateProofFile', () => {
  assert.equal(validateProofFile(null), 'Pilih file bukti pembayaran.');
  assert.equal(validateProofFile({ type: 'image/png', size: 1000 }), '');
  assert.equal(validateProofFile({ type: 'image/avif', size: 1000 }), '');
  assert.equal(validateProofFile({ type: 'image/jpeg', size: MAX_PROOF_BYTES }), '');
  assert.match(validateProofFile({ type: 'application/pdf', size: 1000 }), /Format/);
  assert.match(validateProofFile({ type: 'image/png', size: 0 }), /kosong/);
  assert.match(validateProofFile({ type: 'image/png', size: MAX_PROOF_BYTES + 1 }), /5 MB/);
  assert.match(validateProofFile({ type: 'constructor', size: 10 }), /Format/);
});
test('proofPath memakai folder pengguna dan ekstensi dari tipe', () => {
  assert.equal(proofPath('mua-putri', 'u1', 'image/png', 'abc-123'), 'tenants/mua-putri/payment-proofs/u1/abc-123.png');
  assert.equal(proofPath('t', 'u', 'image/jpeg', 'x'), 'tenants/t/payment-proofs/u/x.jpg');
  assert.equal(proofPath('t', 'u', 'image/avif', 'y'), 'tenants/t/payment-proofs/u/y.avif');
});
