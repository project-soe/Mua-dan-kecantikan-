import { AppError } from '../errors.js';
import { str, idOf } from '../validate.js';
import { isValidDate, parseTime, activeCount, prunedHolds, slotId } from './schedule.js';

export const bad = (m) => new AppError('invalid-argument', m);
export const MAX_ITEMS = 5;

export function parseDate(v, name) {
  const s = str(v, name, { min: 10, max: 10 });
  if (!isValidDate(s)) throw bad(`${name} harus berformat YYYY-MM-DD yang valid`);
  return s;
}
export function parseStart(v) {
  const m = parseTime(v);
  if (m === null) throw bad('startTime harus berformat HH:MM');
  return m;
}
export function parseServiceIds(v, name = 'serviceIds') {
  if (!Array.isArray(v) || v.length < 1 || v.length > MAX_ITEMS) throw bad(`${name} harus berisi 1-${MAX_ITEMS} layanan`);
  const ids = v.map((x, i) => idOf(x, `${name}[${i}]`));
  if (new Set(ids).size !== ids.length) throw bad(`${name} tidak boleh duplikat`);
  return ids;
}

// snaps: DocumentSnapshot layanan, urut sama dengan input. Harga selalu dari database.
export function summarizeServices(snaps, mode) {
  const items = snaps.map((snap) => {
    if (!snap.exists || snap.data().published !== true) throw new AppError('resource-not-found', 'Layanan tidak tersedia');
    const s = snap.data();
    if (s.bookingEnabled !== true) throw new AppError('failed-precondition', 'Layanan tidak dapat dibooking');
    if (mode && s.locationMode !== 'both' && s.locationMode !== mode) throw bad('Layanan tidak tersedia untuk lokasi ini');
    return {
      serviceId: snap.id, name: s.name, price: s.price, depositAmount: s.depositAmount ?? 0,
      durationMinutes: s.durationMinutes, preparationTimeMinutes: s.preparationTimeMinutes ?? 0,
    };
  });
  const sum = (k) => items.reduce((a, i) => a + i[k], 0);
  const subtotal = sum('price');
  return {
    items, subtotal, deposit: Math.min(sum('depositAmount'), subtotal),
    durationTotal: sum('durationMinutes'), prepTotal: sum('preparationTimeMinutes'),
  };
}

export const settingsRef = (db, t) => db.doc(`tenants/${t}/settings/businessHours`);
export const bookingsCol = (db, t) => db.collection(`tenants/${t}/bookings`);
export const slotRef = (db, t, id) => db.doc(`tenants/${t}/bookingSlots/${id}`);

export function requireSettings(snap) {
  if (!snap.exists) throw new AppError('failed-precondition', 'Jam operasional belum diatur');
  return snap.data();
}

// Baca dulu (sebelum penulisan di transaksi), lalu lepas dengan writeRelease.
export async function readSlots(tx, db, t, keys) {
  if (!keys?.length) return { refs: [], snaps: [] };
  const refs = keys.map((k) => slotRef(db, t, k));
  return { refs, snaps: await tx.getAll(...refs) };
}
export function writeRelease(tx, { refs, snaps }, bookingId, nowMs, ts) {
  snaps.forEach((snap, i) => {
    if (!snap.exists) return;
    const holds = prunedHolds(snap.data().holds, nowMs);
    delete holds[bookingId];
    tx.update(refs[i], { holds, updatedAt: ts });
  });
}
export { activeCount, prunedHolds, slotId };
