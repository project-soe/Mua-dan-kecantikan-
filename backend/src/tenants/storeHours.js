import { FieldValue } from 'firebase-admin/firestore';
import { rejectUnknown, str } from '../validate.js';
import { auditEntry } from '../audit.js';
import { auditRef } from '../common.js';
import { isValidDate } from '../bookings/schedule.js';
import { bad } from '../bookings/common.js';
import { parseWeekly } from '../bookings/hours.js';

// Jam toko produk: informasi tampilan di situs (belum membatasi pesanan).
export function updateStoreHours(db) {
  return async (req, res) => {
    const t = req.tenant.id;
    rejectUnknown(req.body, ['tenantId', 'weekly', 'closedDates']);
    const weekly = parseWeekly(req.body.weekly, 15);
    const raw = req.body.closedDates ?? [];
    if (!Array.isArray(raw) || raw.length > 366) throw bad('closedDates maksimal 366 tanggal');
    const closedDates = [...new Set(raw.map((d, i) => {
      const s = str(d, `closedDates[${i}]`, { min: 10, max: 10 });
      if (!isValidDate(s)) throw bad(`closedDates[${i}] bukan tanggal yang valid`);
      return s;
    }))].sort();

    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.set(db.doc(`tenants/${t}/settings/storeHours`), { weekly, closedDates, updatedAt: now });
    batch.set(db.doc(`publicTenants/${t}`), { storeHours: { weekly, closedDates }, updatedAt: now }, { merge: true });
    batch.set(auditRef(db, t), auditEntry({
      actorUid: req.user.uid, tenantId: t, action: 'updateStoreHours', resourceType: 'settings', resourceId: 'storeHours',
    }));
    await batch.commit();
    res.json({ ok: true, data: { storeHours: { weekly, closedDates } } });
  };
}
