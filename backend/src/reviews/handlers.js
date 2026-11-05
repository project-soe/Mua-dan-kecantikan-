import { FieldValue } from 'firebase-admin/firestore';
import { AppError } from '../errors.js';
import { rejectUnknown, str, int, optBool, bool, idOf, storagePath } from '../validate.js';
import { auditEntry } from '../audit.js';
import { auditRef, assertExists } from '../common.js';

const bad = (m) => new AppError('invalid-argument', m);
const KEYS = ['clientName', 'categoryId', 'eventLabel', 'rating', 'quote', 'source', 'photo', 'featured', 'consentConfirmed', 'sortOrder'];
const reviewRef = (db, t, id) => db.doc(`tenants/${t}/reviews/${id}`);

function parse(body, t, requireAll) {
  const opt = !requireAll;
  const f = {};
  const put = (k, v) => { if (v !== undefined) f[k] = v; };
  put('clientName', str(body.clientName, 'clientName', { min: 2, max: 80, optional: opt }));
  put('categoryId', body.categoryId === undefined ? undefined : idOf(body.categoryId, 'categoryId'));
  put('eventLabel', str(body.eventLabel, 'eventLabel', { max: 80, optional: true }));
  put('rating', int(body.rating, 'rating', { min: 1, max: 5, optional: opt }));
  put('quote', str(body.quote, 'quote', { min: 10, max: 600, optional: opt }));
  put('source', str(body.source, 'source', { max: 40, optional: true }));
  put('photo', storagePath(body.photo, 'photo', `tenants/${t}/reviews/`, { optional: true }));
  put('featured', optBool(body.featured, 'featured'));
  put('consentConfirmed', optBool(body.consentConfirmed, 'consentConfirmed'));
  put('sortOrder', int(body.sortOrder, 'sortOrder', { max: 100000, optional: true }));
  return f;
}

// Audit log hanya mencatat nama field, tidak isi testimoni/nama klien (data pribadi).
export function createReview(db) {
  return async (req, res) => {
    const t = req.tenant.id;
    rejectUnknown(req.body, ['tenantId', ...KEYS]);
    const f = parse(req.body, t, true);
    const ref = db.collection(`tenants/${t}/reviews`).doc();
    await db.runTransaction(async (tx) => {
      await assertExists(tx, db, t, 'serviceCategories', f.categoryId, 'Kategori');
      const now = FieldValue.serverTimestamp();
      tx.set(ref, {
        ...f, featured: f.featured ?? false, consentConfirmed: f.consentConfirmed ?? false, sortOrder: f.sortOrder ?? 0,
        published: false, publishedAt: null, createdAt: now, updatedAt: now,
      });
      tx.set(auditRef(db, t), auditEntry({
        actorUid: req.user.uid, tenantId: t, action: 'createReview', resourceType: 'review', resourceId: ref.id,
      }));
    });
    res.json({ ok: true, data: { reviewId: ref.id, publicationStatus: 'draft' } });
  };
}

export function updateReview(db) {
  return async (req, res) => {
    const t = req.tenant.id;
    rejectUnknown(req.body, ['tenantId', 'reviewId', ...KEYS]);
    const reviewId = idOf(req.body.reviewId, 'reviewId');
    const f = parse(req.body, t, false);
    if (!Object.keys(f).length) throw bad('Tidak ada field yang diubah');
    const ref = reviewRef(db, t, reviewId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new AppError('resource-not-found', 'Testimoni tidak ditemukan');
      const cur = snap.data();
      if (cur.published && f.consentConfirmed === false) {
        throw new AppError('failed-precondition', 'Batalkan publikasi sebelum mencabut izin klien');
      }
      if (f.categoryId !== undefined && f.categoryId !== cur.categoryId) {
        await assertExists(tx, db, t, 'serviceCategories', f.categoryId, 'Kategori');
      }
      tx.update(ref, { ...f, updatedAt: FieldValue.serverTimestamp() });
      tx.set(auditRef(db, t), auditEntry({
        actorUid: req.user.uid, tenantId: t, action: 'updateReview', resourceType: 'review', resourceId: reviewId,
        summary: { fields: Object.keys(f) },
      }));
    });
    res.json({ ok: true, data: { reviewId, updatedFields: Object.keys(f) } });
  };
}

export function publishReview(db) {
  return async (req, res) => {
    const t = req.tenant.id;
    rejectUnknown(req.body, ['tenantId', 'reviewId', 'published']);
    const reviewId = idOf(req.body.reviewId, 'reviewId');
    const published = bool(req.body.published, 'published');
    const ref = reviewRef(db, t, reviewId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new AppError('resource-not-found', 'Testimoni tidak ditemukan');
      if (published && snap.data().consentConfirmed !== true) {
        throw new AppError('failed-precondition', 'Izin klien untuk menampilkan testimoni belum dikonfirmasi');
      }
      tx.update(ref, { published, publishedAt: published ? FieldValue.serverTimestamp() : null, updatedAt: FieldValue.serverTimestamp() });
      tx.set(auditRef(db, t), auditEntry({
        actorUid: req.user.uid, tenantId: t, action: published ? 'publishReview' : 'unpublishReview',
        resourceType: 'review', resourceId: reviewId,
      }));
    });
    res.json({ ok: true, data: { reviewId, publicationStatus: published ? 'published' : 'draft' } });
  };
}

// Boleh menghapus yang sudah terbit: bila klien menarik izin, testimoni harus bisa hilang seketika.
export function deleteReview(db) {
  return async (req, res) => {
    const t = req.tenant.id;
    rejectUnknown(req.body, ['tenantId', 'reviewId']);
    const reviewId = idOf(req.body.reviewId, 'reviewId');
    const ref = reviewRef(db, t, reviewId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new AppError('resource-not-found', 'Testimoni tidak ditemukan');
      tx.delete(ref);
      tx.set(auditRef(db, t), auditEntry({
        actorUid: req.user.uid, tenantId: t, action: 'deleteReview', resourceType: 'review', resourceId: reviewId,
      }));
    });
    res.json({ ok: true, data: { reviewId, deleted: true } });
  };
}
