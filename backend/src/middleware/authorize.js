import { PLATFORM_ROLES } from '../../../shared/constants/index.js';
import { AppError } from '../errors.js';
import { tenantIdOf } from '../validate.js';

export function loadTenant(db) {
  return async (req, res, next) => {
    try {
      const id = tenantIdOf(req.body);
      const snap = await db.doc(`tenants/${id}/profile/business`).get();
      if (!snap.exists) throw new AppError('tenant-not-found', 'Tenant tidak tersedia');
      req.tenant = { id, status: snap.data().status };
      next();
    } catch (e) { next(e); }
  };
}

export function requireMembership(db, roles, { anyTenantStatus = false } = {}) {
  return async (req, res, next) => {
    try {
      if (req.user.email_verified !== true) throw new AppError('permission-denied', 'Email belum terverifikasi');
      const snap = await db.doc(`tenants/${req.tenant.id}/memberships/${req.user.uid}`).get();
      const m = snap.exists ? snap.data() : null;
      if (!m || m.status !== 'active' || !roles.includes(m.role)) {
        throw new AppError('permission-denied', 'Akses ditolak');
      }
      // Status tenant diperiksa setelah membership, agar non-anggota tidak tahu statusnya.
      if (!anyTenantStatus && req.tenant.status !== 'active') {
        throw req.tenant.status === 'suspended'
          ? new AppError('tenant-suspended', 'Tenant ditangguhkan')
          : new AppError('tenant-not-found', 'Tenant tidak tersedia');
      }
      req.membership = m;
      next();
    } catch (e) { next(e); }
  };
}

export function requireSuperAdmin(db) {
  return async (req, res, next) => {
    try {
      if (req.user.email_verified !== true) throw new AppError('permission-denied', 'Email belum terverifikasi');
      const snap = await db.doc(`platformUsers/${req.user.uid}`).get();
      const d = snap.exists ? snap.data() : null;
      if (!d || d.role !== PLATFORM_ROLES.SUPER_ADMIN || d.status === 'disabled') {
        throw new AppError('permission-denied', 'Akses ditolak');
      }
      next();
    } catch (e) { next(e); }
  };
}
