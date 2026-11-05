// Logika murni testimoni (tanpa DOM) agar bisa dites.
export const MIN_FOR_AVERAGE = 3; // rata-rata baru ditampilkan bila minimal sebanyak ini

export function stars(rating) {
  const n = Number.isInteger(rating) ? Math.min(5, Math.max(0, rating)) : 0;
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

export const ratingLabel = (rating) => `${rating} dari 5 bintang`;

export function ratingStats(reviews) {
  const rated = reviews.filter((r) => Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5);
  if (!rated.length) return { count: 0, average: null };
  const sum = rated.reduce((a, r) => a + r.rating, 0);
  return { count: rated.length, average: Math.round((sum / rated.length) * 10) / 10 };
}

// Ringkasan jujur: rata-rata hanya muncul bila datanya cukup.
export function summaryText(stats) {
  if (!stats.count) return '';
  if (stats.count < MIN_FOR_AVERAGE) return `${stats.count} testimoni`;
  const avg = stats.average.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `★ ${avg} dari 5 · ${stats.count} testimoni`;
}

// Unggulan dulu, lalu menurut urutan; pengurutan stabil.
export function sortReviews(items) {
  return items.map((x, i) => ({ x, i }))
    .sort((a, b) => Number(b.x.featured === true) - Number(a.x.featured === true)
      || (Number.isFinite(a.x.sortOrder) ? a.x.sortOrder : 0) - (Number.isFinite(b.x.sortOrder) ? b.x.sortOrder : 0)
      || a.i - b.i)
    .map((e) => e.x);
}

export function initials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => [...w][0].toUpperCase()).join('');
}
