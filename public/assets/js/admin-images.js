import { adminCall } from './admin-api.js';
import { ALLOWED_TYPES, MAX_INPUT_BYTES, planSize } from './image-tools.js';

const newId = () => crypto.randomUUID?.() ?? `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
async function resize(file, maxSide, quality) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width, height } = planSize(bmp.width, bmp.height, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d').drawImage(bmp, 0, 0, width, height);
  bmp.close?.();
  const toBlob = (type) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  const webp = await toBlob('image/webp');
  return webp?.type === 'image/webp' ? webp : toBlob('image/jpeg');
}

async function uploadToImageKit(file, { tenantId, area, isVideo = false }) {
  const auth = await adminCall('getMediaUploadAuth', {
    tenantId, area, contentType: file.type, size: file.size,
  });
  if (file.size > auth.maxBytes) throw new Error(`Ukuran file maksimal ${Math.floor(auth.maxBytes / 1024 / 1024)} MB.`);
  const form = new FormData();
  form.append('file', file);
  form.append('fileName', `${newId()}-${(file.name || (isVideo ? 'video.mp4' : 'image.webp')).replace(/[^A-Za-z0-9._-]/g, '_')}`);
  form.append('token', auth.token);
  form.append('expire', String(auth.expire));
  form.append('signature', auth.signature);
  form.append('publicKey', auth.publicKey);
  form.append('folder', auth.folder);
  form.append('useUniqueFileName', 'true');
  form.append('isPrivateFile', 'false');
  form.append('tags', `tenant-${tenantId},${area}`);
  const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', { method: 'POST', body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.url || !data.filePath) {
    throw new Error(data.message || 'ImageKit gagal menerima file. Periksa kuota dan konfigurasi akun.');
  }
  return { path: data.url, url: data.url, filePath: data.filePath, fileId: data.fileId };
}

export async function uploadImage(file, { tenantId, area, thumb }) {
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error('Format file harus JPG, PNG, atau WebP.');
  if (file.size > MAX_INPUT_BYTES) throw new Error('Ukuran file maksimal 25 MB.');
  let full; let small = null;
  try { full = await resize(file, 1600, 0.85); if (thumb) small = await resize(file, 480, 0.8); }
  catch { throw new Error('Gambar tidak dapat diproses. Coba file lain.'); }
  if (!full) throw new Error('Gambar tidak dapat diproses. Coba file lain.');
  const main = await uploadToImageKit(full, { tenantId, area });
  let thumbPath = null;
  if (small && ['products', 'portfolio'].includes(area)) {
    const thumbArea = area;
    const thumbUpload = await uploadToImageKit(small, { tenantId, area: thumbArea });
    thumbPath = thumbUpload.path;
  }
  return { path: main.path, thumbPath, fileId: main.fileId };
}

export async function uploadVideo(file, { tenantId }) {
  if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)) {
    throw new Error('Format video harus MP4, WebM, atau MOV.');
  }
  if (!(file.size > 0 && file.size <= 100 * 1024 * 1024)) throw new Error('Ukuran video maksimal 100 MB.');
  return uploadToImageKit(file, { tenantId, area: 'videos', isVideo: true });
}
