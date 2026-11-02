import { imageUrl } from './media.js';

// Menerapkan identitas brand ke halaman: gaya header (terang/gelap) dan favicon.
export function applyBrand(tenant, doc = document) {
  doc.documentElement.dataset.header = tenant.headerStyle === 'dark' ? 'dark' : 'light';
  const fav = imageUrl(tenant.faviconImage);
  if (!fav) return;
  let link = doc.querySelector('link[rel="icon"]');
  if (!link) { link = doc.createElement('link'); link.rel = 'icon'; doc.head.append(link); }
  link.href = fav;
}
