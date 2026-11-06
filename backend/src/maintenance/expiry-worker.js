import { expireStaleBookings } from '../bookings/manage.js';
import { expireStaleOrders } from '../orders/handlers.js';

const SYSTEM_ACTOR = 'system:expiry-worker';
const DEFAULT_INTERVAL_MS = 60_000;

/**
 * Menjalankan sweep kedaluwarsa untuk setiap tenant aktif.
 * Handler bisnis yang sama dengan endpoint admin dipakai agar aturan transaksi,
 * audit, dan idempotensi tetap konsisten.
 */
export function createExpiryWorker({ db, clock = Date.now, intervalMs = DEFAULT_INTERVAL_MS, logger = console }) {
  if (!db) throw new TypeError('db wajib tersedia');
  if (!Number.isInteger(intervalMs) || intervalMs < 10_000) {
    throw new TypeError('intervalMs minimal 10000 ms');
  }

  let timer = null;
  let running = false;
  let stopped = false;

  async function runOnce() {
    if (running || stopped) return { skipped: true, tenants: 0, bookings: 0, orders: 0 };
    running = true;
    const totals = { skipped: false, tenants: 0, bookings: 0, orders: 0 };
    try {
      // Setiap tenant menyimpan dokumen profil di tenants/{tenantId}/profile/business.
      const profiles = await db.collectionGroup('profile').where('status', '==', 'active').get();
      for (const profile of profiles.docs) {
        if (stopped) break;
        if (profile.id !== 'business' || profile.ref.parent.id !== 'profile') continue;
        const tenantId = profile.ref.parent.parent?.id;
        if (!tenantId) continue;
        totals.tenants += 1;

        const req = {
          tenant: { id: tenantId },
          user: { uid: SYSTEM_ACTOR },
          body: {},
        };
        const invoke = (handler) => new Promise((resolve, reject) => {
          let settled = false;
          const res = {
            json(value) {
              if (settled) return;
              settled = true;
              resolve(value);
            },
          };
          Promise.resolve(handler(req, res)).catch((error) => {
            if (!settled) reject(error);
          });
        });

        try {
          const [bookingResult, orderResult] = await Promise.all([
            invoke(expireStaleBookings(db, clock)),
            invoke(expireStaleOrders(db, clock)),
          ]);
          totals.bookings += bookingResult?.data?.expired ?? 0;
          totals.orders += orderResult?.data?.expired ?? 0;
        } catch (error) {
          logger.error?.('[expiry-worker] tenant sweep failed', { tenantId, error });
        }
      }
      if (totals.bookings || totals.orders) logger.info?.('[expiry-worker] expired transactions', totals);
      return totals;
    } catch (error) {
      logger.error?.('[expiry-worker] sweep failed', error);
      throw error;
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer || stopped) return;
    // Jalankan saat startup, lalu berkala. Timer tidak menahan proses saat shutdown.
    void runOnce();
    timer = setInterval(() => { void runOnce(); }, intervalMs);
    timer.unref?.();
    logger.info?.(`[expiry-worker] active; interval=${intervalMs}ms`);
  }

  function stop() {
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, runOnce };
}
