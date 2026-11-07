import { createHmac, randomUUID } from 'node:crypto';
import { AppError } from '../errors.js';

const AREAS = new Set(['products', 'portfolio', 'services', 'reviews', 'branding', 'payment-methods', 'videos', 'payment-proofs']);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const IMAGE_LIMIT = 25 * 1024 * 1024;
const VIDEO_LIMIT = 100 * 1024 * 1024;
const PROOF_LIMIT = 5 * 1024 * 1024;

export function createUploadAuth({ publicKey, privateKey, urlEndpoint, clock = Date.now }) {
  return ({ tenantId, userId, area, contentType, size, role }) => {
    if (!publicKey || !privateKey || !urlEndpoint) throw new AppError('failed-precondition', 'ImageKit belum dikonfigurasi di backend');
    if (!AREAS.has(area)) throw new AppError('invalid-argument', 'Area media tidak valid');
    const isProof = area === 'payment-proofs';
    if (isProof && (!userId || role !== 'customer')) throw new AppError('permission-denied', 'Upload bukti hanya untuk pelanggan terautentikasi');
    if (area === 'payment-methods' && !['owner', 'finance_manager'].includes(role)) throw new AppError('permission-denied', 'Hanya owner atau finance manager yang boleh mengunggah QRIS');
    if (!isProof && area !== 'payment-methods' && !['owner', 'admin', 'content_manager'].includes(role)) throw new AppError('permission-denied', 'Peran ini tidak boleh mengunggah media');
    const isVideo = area === 'videos';
    const maxBytes = isProof ? PROOF_LIMIT : (isVideo ? VIDEO_LIMIT : IMAGE_LIMIT);
    if (!(isVideo ? VIDEO_TYPES : IMAGE_TYPES).has(contentType)) throw new AppError('invalid-argument', 'Tipe media tidak didukung');
    if (!Number.isSafeInteger(size) || size < 1 || size > maxBytes) throw new AppError('invalid-argument', `Ukuran media melebihi batas ${Math.floor(maxBytes / 1024 / 1024)} MB`);
    const token = randomUUID(), expire = Math.floor(clock() / 1000) + 300;
    const signature = createHmac('sha1', privateKey).update(token + expire).digest('hex');
    return { token, expire, signature, publicKey, urlEndpoint,
      folder: isProof ? `/tenants/${tenantId}/payment-proofs/${userId}` : `/tenants/${tenantId}/${area}`,
      maxBytes, isPrivateFile: isProof };
  };
}

export function createSignedMediaUrl({ privateKey, urlEndpoint, clock = Date.now }) {
  return (filePath, expiresIn = 180) => {
    if (!privateKey || !urlEndpoint) throw new AppError('failed-precondition', 'ImageKit belum dikonfigurasi di backend');
    if (typeof filePath !== 'string' || !filePath.startsWith('/') || filePath.includes('..') || filePath.includes('?') || filePath.includes('#')) throw new AppError('invalid-argument', 'Path media privat tidak valid');
    const expiry = Math.floor(clock() / 1000) + expiresIn;
    const signature = createHmac('sha1', privateKey).update(filePath.slice(1) + expiry).digest('hex');
    return `${urlEndpoint.replace(/\/$/, '')}${filePath}?ik-t=${expiry}&ik-s=${signature}`;
  };
}

export function getMediaUploadAuth({ createAuth }) {
  return async (req, res) => {
    const { area, contentType, size } = req.body ?? {};
    const role = area === 'payment-proofs' ? 'customer' : req.membership?.role;
    const auth = createAuth({ tenantId: req.tenant.id, userId: req.user.uid, area, contentType, size, role });
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, data: auth });
  };
}

export function getPaymentProofUrl({ db, createSignedUrl }) {
  return async (req, res) => {
    const paymentId = req.body?.paymentId;
    if (typeof paymentId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(paymentId)) throw new AppError('invalid-argument', 'paymentId tidak valid');
    const snap = await db.doc(`tenants/${req.tenant.id}/payments/${paymentId}`).get();
    if (!snap.exists) throw new AppError('resource-not-found', 'Pembayaran tidak ditemukan');
    const payment = snap.data();
    const prefix = `/tenants/${req.tenant.id}/payment-proofs/${payment.customerId}/`;
    if (payment.proofStorageProvider !== 'imagekit' || typeof payment.proofImagePath !== 'string' || !payment.proofImagePath.startsWith(prefix)) {
      throw new AppError('failed-precondition', 'Bukti pembayaran bukan file privat ImageKit yang valid');
    }
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, data: { url: createSignedUrl(payment.proofImagePath, 180), expiresIn: 180 } });
  };
}
