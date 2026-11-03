import { adminStorage, ref, uploadBytes } from './admin-firebase.js';
import { ALLOWED_TYPES, MAX_INPUT_BYTES, extOf, planSize, imagePaths } from './image-tools.js';

const newId = () => crypto.randomUUID?.() ?? `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

// Mengecilkan gambar di browser: WebP bila didukung, JPEG bila tidak.
async function resize(file, maxSide, quality) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width, height } = planSize(bmp.width, bmp.height, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bmp, 0, 0, width, height);
  bmp.close?.();
  const toBlob = (type) => new Promise((res) => canvas.toBlob(res, type, quality));
  const webp = await toBlob('image/webp');
  return webp && webp.type === 'image/webp' ? webp : toBlob('image/jpeg');
}

// Mengembalikan { path, thumbPath }. Galat berupa Error berpesan Indonesia, atau galat Storage (kode "storage/...").
export async function uploadImage(file, { tenantId, area, thumb }) {
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error('Format file harus JPG, PNG, atau WebP.');
  if (file.size > MAX_INPUT_BYTES) throw new Error('Ukuran file maksimal 25 MB.');
  let full; let small = null;
  try {
    full = await resize(file, 1600, 0.85);
    if (thumb) small = await resize(file, 480, 0.8);
  } catch { throw new Error('Gambar tidak dapat diproses. Coba file lain.'); }
  if (!full) throw new Error('Gambar tidak dapat diproses. Coba file lain.');
  const paths = imagePaths(tenantId, area, newId(), extOf(full.type), small ? extOf(small.type) : extOf(full.type));
  await uploadBytes(ref(adminStorage, paths.full), full, { contentType: full.type });
  let thumbPath = null;
  if (small && paths.thumb) {
    await uploadBytes(ref(adminStorage, paths.thumb), small, { contentType: small.type });
    thumbPath = paths.thumb;
  }
  return { path: paths.full, thumbPath };
}
