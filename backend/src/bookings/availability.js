import { oneOf, rejectUnknown } from '../validate.js';
import {
  tenantNow, dayIndex, absMinutes, blockLength, unitMinutes, windowsFor, candidateStarts, formatTime,
} from './schedule.js';
import {
  parseDate, parseServiceIds, summarizeServices, requireSettings, settingsRef, activeCount,
} from './common.js';

const MODES = ['studio', 'customer_location'];

export function checkBookingAvailability(db, clock) {
  return async (req, res) => {
    const t = req.tenant.id;
    rejectUnknown(req.body, ['tenantId', 'serviceIds', 'date', 'locationMode']);
    const ids = parseServiceIds(req.body.serviceIds);
    const date = parseDate(req.body.date, 'date');
    const mode = req.body.locationMode === undefined ? undefined : oneOf(req.body.locationMode, MODES, 'locationMode');

    const [settingsSnap, ...svcSnaps] = await db.getAll(
      settingsRef(db, t), ...ids.map((id) => db.doc(`tenants/${t}/services/${id}`)));
    const s = requireSettings(settingsSnap);
    const sum = summarizeServices(svcSnaps, mode);
    const block = blockLength(sum.durationTotal, sum.prepTotal);

    const nowMs = clock();
    const now = tenantNow(s.timezone, nowMs);
    const diff = dayIndex(date) - dayIndex(now.date);
    const base = { date, timezone: s.timezone, durationMinutes: sum.durationTotal };
    if (diff < 0 || diff > s.maxAdvanceDays) return res.json({ ok: true, data: { ...base, availableSlots: [] } });

    const earliest = absMinutes(now.date, now.minute) + s.minLeadTimeMinutes;
    const starts = candidateStarts(windowsFor(s, date), s.slotIntervalMinutes, block)
      .filter((st) => absMinutes(date, st) >= earliest);

    const slotSnap = await db.collection(`tenants/${t}/bookingSlots`).where('date', '==', date).get();
    const holdsAt = new Map(slotSnap.docs.map((d) => [d.data().minute, d.data().holds]));
    const available = starts.filter((st) =>
      unitMinutes(st, block).every((m) => activeCount(holdsAt.get(m), nowMs) < s.capacity));

    res.json({ ok: true, data: {
      ...base,
      availableSlots: available.map((st) => ({ startTime: formatTime(st), endTime: formatTime(st + sum.durationTotal) })),
    } });
  };
}
