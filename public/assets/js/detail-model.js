// Logika murni untuk kartu dan jendela detail (tanpa DOM) agar bisa dites.
import { formatDuration, rupiah } from './format.js';

const LOCATION_LABEL = { studio: 'Di studio', customer_location: 'Di lokasi Anda', both: 'Studio atau lokasi Anda' };

export function priceInfo(p) {
  const promo = typeof p.discountPrice === 'number' && p.discountPrice < p.price;
  return { current: promo ? p.discountPrice : p.price, original: promo ? p.price : null, saving: promo ? p.price - p.discountPrice : 0 };
}

export function stockInfo(stock) {
  const n = Number(stock ?? 0);
  if (!(n > 0)) return { label: 'Stok habis', level: 'out' };
  if (n <= 5) return { label: `Tersisa ${n}`, level: 'low' };
  return { label: 'Tersedia', level: 'ok' };
}

// Urutan slide: foto utama, perbandingan sebelum/sesudah (portfolio), lalu galeri. Tanpa duplikat.
export function slideList(kind, item) {
  const out = [];
  const seen = new Set();
  const add = (path) => {
    if (typeof path === 'string' && path && !seen.has(path)) { seen.add(path); out.push({ type: 'image', path }); }
  };
  add(item.coverImage);
  if (kind === 'portfolio' && item.beforeImage && item.afterImage) {
    out.push({ type: 'compare', before: item.beforeImage, after: item.afterImage });
  }
  for (const p of Array.isArray(item.gallery) ? item.gallery : []) add(p);
  if (kind === 'portfolio') {
    for (const path of Array.isArray(item.videos) ? item.videos : []) {
      if (typeof path === 'string' && path) out.push({ type: 'video', path });
    }
  }
  return out;
}

export function factsFor(kind, item) {
  const rows = [];
  if (kind === 'product') {
    if (item.brand) rows.push(['Merek', item.brand]);
    if (Number.isInteger(item.weightGrams) && item.weightGrams > 0) rows.push(['Berat', `${item.weightGrams} g`]);
  } else if (kind === 'service') {
    if (item.durationMinutes > 0) rows.push(['Durasi', formatDuration(item.durationMinutes)]);
    if (item.depositAmount > 0) rows.push(['Deposit', rupiah(item.depositAmount)]);
    if (Object.hasOwn(LOCATION_LABEL, item.locationMode)) rows.push(['Lokasi', LOCATION_LABEL[item.locationMode]]);
  } else {
    if (item.modelName) rows.push(['Model', item.modelName]);
    if (item.artistName) rows.push(['MUA', item.artistName]);
  }
  return rows;
}

// Produk tersedia lebih dulu; layanan yang bisa dibooking lalu menurut nama; portfolio unggulan lalu menurut urutan.
export function sortShowcase(kind, items) {
  if (kind === 'service') {
    return [...items].sort((a, b) => Number(a.bookingEnabled === false) - Number(b.bookingEnabled === false)
      || String(a.name ?? '').localeCompare(String(b.name ?? ''), 'id'));
  }
  const key = kind === 'product'
    ? (x) => [Number(!(Number(x.stock ?? 0) > 0)), 0]
    : (x) => [Number(x.featured !== true), Number.isFinite(x.sortOrder) ? x.sortOrder : 0];
  return items.map((x, i) => ({ x, i, k: key(x) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.i - b.i)
    .map((e) => e.x);
}
