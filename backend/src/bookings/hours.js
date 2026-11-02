import { FieldValue } from 'firebase-admin/firestore';
import { rejectUnknown, int, oneOf, str } from '../validate.js';
import { auditEntry } from '../audit.js';
import { auditRef } from '../common.js';
import { TZ_OFFSETS, WEEKDAYS, parseTime, isValidDate } from './schedule.js';
import { bad, settingsRef } from './common.js';

export function parseWeekly(weekly, interval) {
  if (typeof weekly !== 'object' || weekly === null || Array.isArray(weekly)) throw bad('weekly harus berupa objek');
  for (const k of Object.keys(weekly)) if (!WEEKDAYS.includes(k)) throw bad(`Hari tidak dikenal: ${k}`);
  const out = {};
  for (const day of WEEKDAYS) {
    const list = weekly[day] ?? [];
    if (!Array.isArray(list) || list.length > 3) throw bad(`weekly.${day} maksimal 3 jendela`);
    let prevClose = -1;
    out[day] = list.map((w, i) => {
      if (typeof w !== 'object' || w === null) throw bad(`weekly.${day}[${i}] tidak valid`);
      rejectUnknown(w, ['open', 'close']);
      const open = parseTime(w.open); const close = parseTime(w.close);
      if (open === null || close === null) throw bad(`Jam ${day}[${i}] harus berformat HH:MM`);
      if (open >= close) throw bad(`Jam buka ${day}[${i}] harus sebelum jam tutup`);
      if (open % interval || close % interval) throw bad(`Jam ${day}[${i}] harus kelipatan ${interval} menit`);
      if (open < prevClose) throw bad(`Jendela ${day} tumpang tindih atau tidak berurutan`);
      prevClose = close;
      return { open: w.open, close: w.close };
    });
  }
  return out;
}

export function updateBusinessHours(db) {
  return async (req, res) => {
    const t = req.tenant.id;
    rejectUnknown(req.body, ['tenantId', 'timezone', 'slotIntervalMinutes', 'capacity', 'weekly',
      'closedDates', 'minLeadTimeMinutes', 'maxAdvanceDays', 'holdMinutes', 'cancelCutoffHours']);
    const timezone = oneOf(req.body.timezone, Object.keys(TZ_OFFSETS), 'timezone');
    const slotIntervalMinutes = oneOf(req.body.slotIntervalMinutes, [15, 30, 60], 'slotIntervalMinutes');
    const doc = {
      timezone, slotIntervalMinutes,
      capacity: int(req.body.capacity, 'capacity', { min: 1, max: 20 }),
      weekly: parseWeekly(req.body.weekly, slotIntervalMinutes),
      minLeadTimeMinutes: int(req.body.minLeadTimeMinutes, 'minLeadTimeMinutes', { max: 10080, optional: true }) ?? 120,
      maxAdvanceDays: int(req.body.maxAdvanceDays, 'maxAdvanceDays', { min: 1, max: 365, optional: true }) ?? 90,
      holdMinutes: int(req.body.holdMinutes, 'holdMinutes', { min: 15, max: 2880, optional: true }) ?? 120,
      cancelCutoffHours: int(req.body.cancelCutoffHours, 'cancelCutoffHours', { max: 720, optional: true }) ?? 24,
    };
    const closed = req.body.closedDates ?? [];
    if (!Array.isArray(closed) || closed.length > 366) throw bad('closedDates maksimal 366 tanggal');
    doc.closedDates = [...new Set(closed.map((d, i) => {
      const s = str(d, `closedDates[${i}]`, { min: 10, max: 10 });
      if (!isValidDate(s)) throw bad(`closedDates[${i}] bukan tanggal yang valid`);
      return s;
    }))].sort();

    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.set(settingsRef(db, t), { ...doc, updatedAt: now });
    batch.set(db.doc(`publicTenants/${t}`), {
      operatingHours: { timezone, weekly: doc.weekly, closedDates: doc.closedDates }, updatedAt: now,
    }, { merge: true });
    batch.set(auditRef(db, t), auditEntry({
      actorUid: req.user.uid, tenantId: t, action: 'updateBusinessHours',
      resourceType: 'settings', resourceId: 'businessHours',
    }));
    await batch.commit();
    res.json({ ok: true, data: { businessHours: doc } });
  };
}
