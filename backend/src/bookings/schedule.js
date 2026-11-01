// Fungsi murni untuk jadwal. Zona waktu Indonesia tidak memakai DST, jadi offset tetap.
export const TZ_OFFSETS = Object.freeze({ 'Asia/Jakarta': 420, 'Asia/Makassar': 480, 'Asia/Jayapura': 540 });
export const WEEKDAYS = Object.freeze(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
export const UNIT = 15; // granularitas slot (menit), tetap agar data slot konsisten

export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
export function dayIndex(s) {
  const [y, m, d] = s.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
export const weekdayOf = (s) => WEEKDAYS[new Date(dayIndex(s) * 86400000).getUTCDay()];

export function parseTime(s) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
export function formatTime(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export function tenantNow(tz, nowMs) {
  const shifted = new Date(nowMs + TZ_OFFSETS[tz] * 60000);
  return {
    date: shifted.toISOString().slice(0, 10),
    minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}
export const absMinutes = (date, minute) => dayIndex(date) * 1440 + minute;

export const blockLength = (durationTotal, prepTotal) => Math.ceil((durationTotal + prepTotal) / UNIT) * UNIT;
export function unitMinutes(start, block) {
  return Array.from({ length: Math.ceil(block / UNIT) }, (_, i) => start + i * UNIT);
}
export const slotId = (date, minute) => `${date}_${formatTime(minute).replace(':', '')}`;

export function windowsFor(settings, date) {
  if ((settings.closedDates ?? []).includes(date)) return [];
  return (settings.weekly?.[weekdayOf(date)] ?? []).map((w) => ({ open: parseTime(w.open), close: parseTime(w.close) }));
}
export const fits = (windows, start, block) => windows.some((w) => start >= w.open && start + block <= w.close);
export function candidateStarts(windows, interval, block) {
  const out = [];
  for (const w of windows) for (let s = w.open; s + block <= w.close; s += interval) out.push(s);
  return out;
}

// holds: { [bookingId]: kedaluwarsaMs | null }  (null = permanen)
export function activeCount(holds, nowMs, exceptId) {
  return Object.entries(holds ?? {}).filter(([id, exp]) => id !== exceptId && (exp === null || exp > nowMs)).length;
}
export function prunedHolds(holds, nowMs) {
  return Object.fromEntries(Object.entries(holds ?? {}).filter(([, exp]) => exp === null || exp > nowMs));
}
