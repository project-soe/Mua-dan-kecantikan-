import { FieldValue } from 'firebase-admin/firestore';
import { AppError } from '../errors.js';
import { rejectUnknown, str, int, idOf, oneOf, slugify } from '../validate.js';
import { auditEntry } from '../audit.js';
import { auditRef } from '../common.js';

const KINDS = { product: 'productCategories', service: 'serviceCategories' };

export function createCategory(db) {
  return async (req, res) => {
    const t = req.tenant.id;
    rejectUnknown(req.body, ['tenantId', 'kind', 'name', 'sortOrder']);
    const kind = oneOf(req.body.kind, Object.keys(KINDS), 'kind');
    const name = str(req.body.name, 'name', { min: 2, max: 60 });
    const sortOrder = int(req.body.sortOrder, 'sortOrder', { max: 100000, optional: true }) ?? 0;
    const id = slugify(name);
    const ref = db.doc(`tenants/${t}/${KINDS[kind]}/${id}`);

    await db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) throw new AppError('already-exists', 'Kategori sudah ada');
      const now = FieldValue.serverTimestamp();
      tx.set(ref, { name, sortOrder, createdAt: now, updatedAt: now });
      tx.set(auditRef(db, t), auditEntry({
        actorUid: req.user.uid, tenantId: t, action: 'createCategory',
        resourceType: KINDS[kind], resourceId: id,
      }));
    });
    res.json({ ok: true, data: { categoryId: id, kind } });
  };
}

export function updateCategory(db) {
  return async (req, res) => {
    const t = req.tenant.id;
    rejectUnknown(req.body, ['tenantId', 'kind', 'categoryId', 'name', 'sortOrder']);
    const kind = oneOf(req.body.kind, Object.keys(KINDS), 'kind');
    const id = idOf(req.body.categoryId, 'categoryId');
    const patch = {};
    const name = str(req.body.name, 'name', { min: 2, max: 60, optional: true });
    const sortOrder = int(req.body.sortOrder, 'sortOrder', { max: 100000, optional: true });
    if (name !== undefined) patch.name = name;
    if (sortOrder !== undefined) patch.sortOrder = sortOrder;
    if (!Object.keys(patch).length) throw new AppError('invalid-argument', 'Tidak ada field yang diubah');

    const ref = db.doc(`tenants/${t}/${KINDS[kind]}/${id}`);
    await db.runTransaction(async (tx) => {
      if (!(await tx.get(ref)).exists) throw new AppError('resource-not-found', 'Kategori tidak ditemukan');
      tx.update(ref, { ...patch, updatedAt: FieldValue.serverTimestamp() });
      tx.set(auditRef(db, t), auditEntry({
        actorUid: req.user.uid, tenantId: t, action: 'updateCategory',
        resourceType: KINDS[kind], resourceId: id, summary: { fields: Object.keys(patch) },
      }));
    });
    res.json({ ok: true, data: { categoryId: id, updatedFields: Object.keys(patch) } });
  };
}
