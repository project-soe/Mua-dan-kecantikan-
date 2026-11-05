// Fungsi murni untuk gambar (tanpa DOM) agar bisa dites.
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
export const extOf = (type) => (Object.hasOwn(EXT, type) ? EXT[type] : null);

export function planSize(width, height, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// Produk/portfolio: versi "optimized" dan "thumbnails" (dibaca publik). Layanan: langsung di folder services.
export function imagePaths(tenantId, area, id, ext, thumbExt = ext) {
  if (area === 'services') return { full: `tenants/${tenantId}/services/${id}.${ext}`, thumb: `tenants/${tenantId}/services/thumbs/${id}.${thumbExt}` };
  if (area === 'branding') return { full: `tenants/${tenantId}/branding/${id}.${ext}`, thumb: null };
  if (area === 'payment-methods') return { full: `tenants/${tenantId}/payment-methods/${id}.${ext}`, thumb: null };
  if (area === 'products' || area === 'portfolio') {
    return {
      full: `tenants/${tenantId}/${area}/optimized/${id}.${ext}`,
      thumb: `tenants/${tenantId}/${area}/thumbnails/${id}.${thumbExt}`,
    };
  }
  throw new Error(`Area tidak dikenal: ${area}`);
}
