import { AppError } from '../errors.js';

export function createImageKitProofInfo({ privateKey, fetchImpl = fetch }) {
  return async ({ fileId, tenantId, userId }) => {
    if (!privateKey) throw new AppError('failed-precondition', 'ImageKit belum dikonfigurasi di backend');
    if (typeof fileId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(fileId)) throw new AppError('invalid-argument', 'ID file ImageKit tidak valid');
    const response = await fetchImpl(`https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}/details`, {
      headers: { Authorization: `Basic ${Buffer.from(`${privateKey}:`).toString('base64')}` },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new AppError('unavailable', 'Metadata file ImageKit tidak dapat diverifikasi');
    const file = await response.json();
    const prefix = `/tenants/${tenantId}/payment-proofs/${userId}/`;
    if (file.isPrivateFile !== true || typeof file.filePath !== 'string' || !file.filePath.startsWith(prefix)) {
      throw new AppError('permission-denied', 'File bukan bukti pembayaran privat milik pelanggan ini');
    }
    return { filePath: file.filePath, size: Number(file.size), contentType: file.mime };
  };
}
