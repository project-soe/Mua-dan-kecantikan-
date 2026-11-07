import { createHmac, randomUUID } from 'node:crypto';
import { AppError } from '../errors.js';

const AREAS = new Set(['products', 'portfolio', 'services', 'reviews', 'branding', 'payment-methods', 'videos']);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const IMAGE_LIMIT = 25 * 1024 * 1024;
const VIDEO_LIMIT = 100 * 1024 * 1024;

export function createUploadAuth({ publicKey, privateKey, urlEndpoint, clock = Date.now }) {
  return ({ tenantId, area, contentType, size, role }) => {
    if (!publicKey || !privateKey || !urlEndpoint) {
      throw new AppError('failed-precondition', 'ImageKit belum dikonfigurasi di backend');
    }
    if (!AREAS.has(area)) throw new AppError('invalid-argument', 'Area media tidak valid');
    if (area === 'payment-methods' && !['owner', 'finance_manager'].includes(role)) {
      throw new AppError('permission-denied', 'Hanya owner atau finance manager yang boleh mengunggah QRIS');
    }
    if (area !== 'payment-methods' && !['owner', 'admin', 'content_manager'].includes(role)) {
      throw new AppError('permission-denied', 'Peran ini tidak boleh mengunggah media');
    }
    const isVideo = area === 'videos';
    const types = isVideo ? VIDEO_TYPES : IMAGE_TYPES;
    const maxBytes = isVideo ? VIDEO_LIMIT : IMAGE_LIMIT;
    if (!types.has(contentType)) throw new AppError('invalid-argument', 'Tipe media tidak didukung');
    if (!Number.isSafeInteger(size) || size < 1 || size > maxBytes) {
      throw new AppError('invalid-argument', `Ukuran media melebihi batas ${Math.floor(maxBytes / 1024 / 1024)} MB`);
    }
    const token = randomUUID();
    const expire = Math.floor(clock() / 1000) + 5 * 60;
    const signature = createHmac('sha1', privateKey).update(token + expire).digest('hex');
    return {
      token, expire, signature, publicKey, urlEndpoint,
      folder: `/tenants/${tenantId}/${area}`,
      maxBytes,
    };
  };
}

export function getMediaUploadAuth({ createAuth }) {
  return async (req, res) => {
    const { area, contentType, size } = req.body ?? {};
    const role = req.membership?.role;
    const auth = createAuth({ tenantId: req.tenant.id, area, contentType, size, role });
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, data: auth });
  };
}
