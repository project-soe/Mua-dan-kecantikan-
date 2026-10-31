import { FieldValue } from 'firebase-admin/firestore';
import { LOCATION_MODE } from '../../../shared/constants/index.js';
import { AppError } from '../errors.js';
import {
  rejectUnknown, str, int, optBool, bool, idOf, oneOf, storagePath, storagePaths,
} from '../validate.js';
import { auditEntry } from '../audit.js';
import { auditRef, uniqueRef, slugKey, pickSlug, assertExists } from '../common.js';

const bad = (m) => new AppError('invalid-argument', m);
const KEYS = ['name', 'categoryId', 'description', 'price', 'depositAmount', 'durationMinutes',
  'preparationTimeMinutes', 'bookingEnabled', 'locationMode', 'coverImage', 'gallery',
  'seoTitle', 'seoDescription', 'shareImage'];
const serviceRef = (db, t, id) => db.doc(`tenants/${t}/services/${id}`);

function parse(body, t, requireAll) {
  const opt = !requireAll;
  const prefix = `tenants/${t}/services/`;
  const f = {};
  const put = (k, v) => { if (v !== undefined) f[k] = v; };
  put('name', str(body.name, 'name', { min: 2, max: 120, optional: opt }));
  put('categoryId', body.categoryId === undefined ? undefined : idOf(body.categoryId, 'categoryId'));
  put('description', str(body.description, 'description', { max: 5000, optional: true }));
  put('price', int(body.price, 'price', { optional: opt }));
  put('depositAmount', int(body.depositAmount, 'depositAmount', { optional: true }));
  put('durationMinutes', int(body.durationMinutes, 'durationMinutes', { min: 15, max: 1440, optional: opt }));
  put('preparationTimeMinutes', int(body.preparationTimeMinutes, 'preparationTimeMinutes', { max: 480, optional: true }));
  put('bookingEnabled', optBool(body.bookingEnabled, 'bookingEnabled'));
  if (body.locationMode !== undefined) put('locationMode', oneOf(body.locationMode, LOCATION_MODE, 'locationMode'));
  put('coverImage', storagePath(body.coverImage, 'coverImage', prefix, { optional: true }));
  put('gallery', storagePaths(body.gallery, 'gallery', prefix, { max: 12, optional: true }));
  put('seoTitle', str(body.seoTitle, 'seoTitle', { max: 70, optional: true }));
  put('seoDescription', str(body.seoDescription, 'seoDescription', { max: 160, optional: true }));
  put('shareImage', storagePath(body.shareImage, 'shareImage', prefix, { optional: true }));
  return f;
}

export function createService(db) {
  return async (req, res) => {
    const t = req.tenant.id;
    rejectUnknown(req.body, ['tenantId', ...KEYS]);
    const f = parse(req.body, t, true);
    if ((f.depositAmount ?? 0) > f.price) throw bad('depositAmount tidak boleh lebih besar dari price');

    const ref = db.collection(`tenants/${t}/services`).doc();
    let slug;
    await db.runTransaction(async (tx) => {
      slug = await pickSlug(tx, db, t, 'service', f.name, ref.id.slice(0, 6));
      await assertExists(tx, db, t, 'serviceCategories', f.categoryId, 'Kategori');
      const now = FieldValue.serverTimestamp();
      tx.set(ref, {
        ...f, slug,
        depositAmount: f.depositAmount ?? 0,
        preparationTimeMinutes: f.preparationTimeMinutes ?? 0,
        bookingEnabled: f.bookingEnabled ?? true,
        locationMode: f.locationMode ?? 'studio',
        published: false, createdAt: now, updatedAt: now,
      });
      tx.set(uniqueRef(db, t, slugKey('service', slug)), { serviceId: ref.id, createdAt: now });
      tx.set(auditRef(db, t), auditEntry({
        actorUid: req.user.uid, tenantId: t, action: 'createService',
        resourceType: 'service', resourceId: ref.id,
      }));
    });
    res.json({ ok: true, data: { serviceId: ref.id, slug, serviceStatus: 'draft' } });
  };
}

export function updateService(db) {
  return async (req, res) => {
    const t = req.tenant.id;
    rejectUnknown(req.body, ['tenantId', 'serviceId', ...KEYS]);
    const serviceId = idOf(req.body.serviceId, 'serviceId');
    const f = parse(req.body, t, false);
    if (!Object.keys(f).length) throw bad('Tidak ada field yang diubah');

    const ref = serviceRef(db, t, serviceId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new AppError('resource-not-found', 'Layanan tidak ditemukan');
      const cur = snap.data();
      const price = f.price ?? cur.price;
      const deposit = f.depositAmount ?? cur.depositAmount ?? 0;
      if (deposit > price) throw bad('depositAmount tidak boleh lebih besar dari price');
      if (f.categoryId !== undefined && f.categoryId !== cur.categoryId) {
        await assertExists(tx, db, t, 'serviceCategories', f.categoryId, 'Kategori');
      }
      tx.update(ref, { ...f, updatedAt: FieldValue.serverTimestamp() });
      tx.set(auditRef(db, t), auditEntry({
        actorUid: req.user.uid, tenantId: t, action: 'updateService',
        resourceType: 'service', resourceId: serviceId, summary: { fields: Object.keys(f) },
      }));
    });
    res.json({ ok: true, data: { serviceId, updatedFields: Object.keys(f) } });
  };
}

export function publishService(db) {
  return async (req, res) => {
    const t = req.tenant.id;
    rejectUnknown(req.body, ['tenantId', 'serviceId', 'published']);
    const serviceId = idOf(req.body.serviceId, 'serviceId');
    const published = bool(req.body.published, 'published');
    const ref = serviceRef(db, t, serviceId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new AppError('resource-not-found', 'Layanan tidak ditemukan');
      if (published && !snap.data().coverImage) {
        throw new AppError('failed-precondition', 'Layanan belum punya coverImage');
      }
      tx.update(ref, { published, updatedAt: FieldValue.serverTimestamp() });
      tx.set(auditRef(db, t), auditEntry({
        actorUid: req.user.uid, tenantId: t, action: published ? 'publishService' : 'unpublishService',
        resourceType: 'service', resourceId: serviceId,
      }));
    });
    res.json({ ok: true, data: { serviceId, serviceStatus: published ? 'published' : 'draft' } });
  };
}
