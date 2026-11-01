export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

const EXT = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
});

export function validateProofFile(file) {
  if (!file) return 'Pilih file bukti pembayaran.';
  if (!Object.hasOwn(EXT, file.type)) {
    return 'Format file harus JPG, PNG, WebP, atau AVIF.';
  }
  if (!(file.size > 0)) return 'File kosong.';
  if (file.size > MAX_PROOF_BYTES) return 'Ukuran file maksimal 5 MB.';
  return '';
}

export function proofPath(tenantId, uid, type, id) {
  if (!Object.hasOwn(EXT, type)) {
    throw new Error('Tipe file bukti pembayaran tidak didukung.');
  }

  return `tenants/${tenantId}/payment-proofs/${uid}/${id}.${EXT[type]}`;
}
