const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
export const rupiah = (n) => idr.format(n);

export function formatDuration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h} jam` : '', m ? `${m} menit` : ''].filter(Boolean).join(' ');
}

export const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_LABELS = { mon: 'Senin', tue: 'Selasa', wed: 'Rabu', thu: 'Kamis', fri: 'Jumat', sat: 'Sabtu', sun: 'Minggu' };

export function formatWindows(list) {
  if (!Array.isArray(list) || list.length === 0) return 'Tutup';
  return list.map((w) => `${w.open}–${w.close}`).join(', ');
}
