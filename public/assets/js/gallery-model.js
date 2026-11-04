// Logika murni halaman Galeri (tanpa DOM) agar bisa dites.

// categories: [{ id, name }] dalam urutan tampil. Foto tanpa kategori yang dikenal masuk "lainnya".
export function bucketOf(item, categories) {
  return item.categoryId && categories.some((c) => c.id === item.categoryId) ? item.categoryId : 'lainnya';
}

export function categoryChips(items, categories) {
  const counts = new Map();
  for (const it of items) {
    const b = bucketOf(it, categories);
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  const chips = [{ id: 'all', label: 'Semua', count: items.length }];
  for (const c of categories) if (counts.get(c.id)) chips.push({ id: c.id, label: c.name, count: counts.get(c.id) });
  if (counts.get('lainnya')) chips.push({ id: 'lainnya', label: 'Lainnya', count: counts.get('lainnya') });
  return chips;
}

export function filterItems(items, filterId, categories) {
  return filterId === 'all' ? items : items.filter((it) => bucketOf(it, categories) === filterId);
}

// Foto unggulan tampil besar, tetapi tidak berdekatan: minimal `gap` foto biasa di antaranya.
export function featureIds(items, gap = 6) {
  const out = new Set();
  let sinceLast = gap; // foto unggulan pertama selalu boleh
  for (const it of items) {
    if (it.featured === true && sinceLast >= gap) { out.add(it.id); sinceLast = 0; }
    else sinceLast += 1;
  }
  return out;
}

// Tepat satu layanan sekategori -> booking langsung memilih layanan itu; selain itu ke halaman booking umum.
export function ctaFor(item, services) {
  const same = (services ?? []).filter((s) => s.bookingEnabled !== false && item.categoryId && s.categoryId === item.categoryId);
  if (same.length === 1) return { path: `/booking/?service=${encodeURIComponent(same[0].id)}`, label: `Booking ${same[0].name}` };
  return { path: '/booking/', label: 'Booking layanan' };
}

export function galleryStats(items, chips) {
  return { results: items.length, categories: chips.filter((c) => c.id !== 'all' && c.id !== 'lainnya').length };
}
