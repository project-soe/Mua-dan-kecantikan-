import { ERROR_CODES } from '../../shared/constants/index.js';

const HTTP = {
  'unauthenticated': 401, 'permission-denied': 403, 'tenant-not-found': 404,
  'tenant-suspended': 403, 'invalid-argument': 400, 'resource-not-found': 404,
  'failed-precondition': 412, 'already-exists': 409, 'out-of-stock': 409,
  'booking-conflict': 409, 'payment-mismatch': 409, 'shipping-unavailable': 422,
  'rate-limited': 429, 'internal': 500,
};

export class AppError extends Error {
  constructor(code, message) {
    if (!ERROR_CODES.includes(code)) throw new Error('Kode error tidak dikenal: ' + code);
    super(message);
    this.code = code;
    this.status = HTTP[code];
  }
}

export function notFound(req, res, next) {
  next(new AppError('resource-not-found', 'Endpoint tidak ditemukan'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
    return res.status(400).json({ error: { code: 'invalid-argument', message: 'Body permintaan tidak valid' } });
  }
  // Jangan bocorkan detail internal ke klien; log seperlunya.
  console.error('[internal]', err?.message);
  return res.status(500).json({ error: { code: 'internal', message: 'Terjadi kesalahan pada server' } });
}

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
