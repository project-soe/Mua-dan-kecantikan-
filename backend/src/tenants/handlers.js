import { FieldValue } from 'firebase-admin/firestore';
import { TENANT_STATUS } from '../../../shared/constants/index.js';
import { AppError } from '../errors.js';
import { tenantIdOf, oneOf } from '../validate.js';
import { auditEntry } from '../audit.js';

export function getMyAccess(req, res) {
  res.json({
    ok: true,
    data: {
      tenantId: req.tenant.id,
      tenantStatus: req.tenant.status,
      role: req.membership.role,
      permissions: req.membership.permissions ?? [],
    },
  });
}

export function setTenantStatus(db) {
  return async (req, res) => {
    const tenantId = tenantIdOf(req.body);
    const status = oneOf(req.body.status, TENANT_STATUS, 'status');
    const profileRef = db.doc(`tenants/${tenantId}/profile/business`);

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(profileRef);
      if (!snap.exists) throw new AppError('tenant-not-found', 'Tenant tidak tersedia');
      const from = snap.data().status;
      if (from === status) return { changed: false };
      tx.update(profileRef, { status, updatedAt: FieldValue.serverTimestamp() });
      tx.set(db.doc(`publicTenants/${tenantId}`), { status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.set(db.collection(`tenants/${tenantId}/auditLogs`).doc(), auditEntry({
        actorUid: req.user.uid, tenantId, action: 'setTenantStatus',
        resourceType: 'tenant', resourceId: tenantId, summary: { from, to: status },
      }));
      return { changed: true };
    });

    res.json({ ok: true, data: { tenantId, status, ...result } });
  };
}
