import { FieldValue } from 'firebase-admin/firestore';
import { AppError } from '../errors.js';
import {
  rejectUnknown, str, int, optBool, bool, idOf, storagePath, storagePaths,
} from '../validate.js';
import { auditEntry } from '../audit.js';
import { auditRef, uniqueRef, slugKey, pickSlug, assertExists } from '../common.js';

const bad = (m) => new AppError('invalid-argument', m);
const KEYS = ['title', 'description', 'modelName', 'artistName', 'categoryId', 'coverImage',
  'thumbnailImage', 'beforeImage', 'afterImage', 'gallery', 'featured', 'consentConfirmed',
  'sortOrder', 'seoTitle', 'seoDescription', 'shareImage'];
const itemRef = (db, t, id) => db.doc(`tenants/${t}/portfolio/${id}`);

function parse(body, t, requireAll) {
  const opt = !requireAll;
  const prefix = `tenants/${t}/portfolio/`;
  const f = {};
  const put = (k, v) => { if (v !== undefined) f[k] = v; };
  put('title', str(body.title, 'title', { min: 2, max: 120, optional: opt }));
  put('description', str(body.description, 'description', { max: 5000, optional: true }));
  put('modelName', str(body.modelName, 'modelName', { max: 80, optional: true }));
  put('artistName', str(body.artistName, 'artistName', { max: 80, optional: true }));
  put('categoryId', body.categoryId === undefined ? undefined : idOf(body.categoryId, 'categoryId'));
  for (const k of ['coverImage', 'thumbnailImage', 'beforeImage', 'afterImage', 'shareImage']) {
    put(k, storagePath(body[k], k, prefix, { optional: true }));
  }
  put('gallery', storagePaths(body.gallery, 'gallery', prefix, { max: 12, optional: true }));
  put('featured', optBool(body.featured, 'featured'));
  put('consentConfirmed', optBool(body.consentConfirmed, 'consentConfirmed'));
  put('sortOrder', int(body.sortOrder, 'sortOrder', { max: 100000, optional: true }));
  put('seoTitle', str(body.seoTitle, 'seoTitle', { max: 70, optional: true }));
  put('seoDescription', str(body.seoDescription, 'seoDescription', { max: 160, optional: true }));
  return f;
}

export function createPortfolio(db) {
  return async (req, res) => {
    const t = req.tenant.id;
    rejectUnknown(req.body, ['tenantId', ...KEYS]);
    const f = parse(req.body, t, true);

    const ref = db.collection(`tenants/${t}/portfolio`).doc();
    let slug;
    await db.runTransaction(async (tx) => {
      slug = await pickSlug(tx, db, t, 'portfolio', f.title, ref.id.slice(0, 6));
      await assertExists(tx, db, t, 'serviceCategories', f.categoryId, 'Kategori');
      const now = FieldValue.serverTimestamp();
      tx.set(ref, {
        ...f, slug,
        gallery: f.gallery ?? [],
        featured: f.featured ?? false,
        consentConfirmed: f.consentConfirmed ?? false,
        sortOrder: f.sortOrder ?? 0,
        published: false, publishedAt: null, createdAt: now, updatedAt: now,
      });
      tx.set(uniqueRef(db, t, slugKey('portfolio', slug)), { portfolioId: ref.id, createdAt: now });
      tx.set(auditRef(db, t), auditEntry({
        actorUid: req.user.uid, tenantId: t, action: 'createPortfolio',
        resourceType: 'portfolio', resourceId: ref.id,
      }));
    });
    res.json({ ok: true, data: { portfolioId: ref.id, slug, publicationStatus: 'draft' } });
  };
}

export function updatePortfolio(db) {
  return async (req, res) => {
    const t = req.tenant.id;
    rejectUnknown(req.body, ['tenantId', 'portfolioId', ...KEYS]);
    const portfolioId = idOf(req.body.portfolioId, 'portfolioId');
    const f = parse(req.body, t, false);
    if (!Object.keys(f).length) throw bad('Tidak ada field yang diubah');

    const ref = itemRef(db, t, portfolioId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new AppError('resource-not-found', 'Portfolio tidak ditemukan');
      const cur = snap.data();
      if (cur.published && f.consentConfirmed === false) {
        throw new AppError('failed-precondition', 'Batalkan publikasi sebelum mencabut persetujuan model');
      }
      if (f.categoryId !== undefined && f.categoryId !== cur.categoryId) {
        await assertExists(tx, db, t, 'serviceCategories', f.categoryId, 'Kategori');
      }
      tx.update(ref, { ...f, updatedAt: FieldValue.serverTimestamp() });
      tx.set(auditRef(db, t), auditEntry({
        actorUid: req.user.uid, tenantId: t, action: 'updatePortfolio',
        resourceType: 'portfolio', resourceId: portfolioId, summary: { fields: Object.keys(f) },
      }));
    });
    res.json({ ok: true, data: { portfolioId, updatedFields: Object.keys(f) } });
  };
}

export function publishPortfolio(db) {
  return async (req, res) => {
    const t = req.tenant.id;
    rejectUnknown(req.body, ['tenantId', 'portfolioId', 'published']);
    const portfolioId = idOf(req.body.portfolioId, 'portfolioId');
    const published = bool(req.body.published, 'published');
    const ref = itemRef(db, t, portfolioId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new AppError('resource-not-found', 'Portfolio tidak ditemukan');
      const d = snap.data();
      if (published) {
        if (!d.coverImage) throw new AppError('failed-precondition', 'Portfolio belum punya coverImage');
        if (d.consentConfirmed !== true) {
          throw new AppError('failed-precondition', 'Persetujuan penggunaan foto model belum dikonfirmasi');
        }
        if (Boolean(d.beforeImage) !== Boolean(d.afterImage)) {
          throw new AppError('failed-precondition', 'Foto before dan after harus berpasangan');
        }
      }
      tx.update(ref, {
        published, publishedAt: published ? FieldValue.serverTimestamp() : null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(auditRef(db, t), auditEntry({
        actorUid: req.user.uid, tenantId: t, action: published ? 'publishPortfolio' : 'unpublishPortfolio',
        resourceType: 'portfolio', resourceId: portfolioId,
      }));
    });
    res.json({ ok: true, data: { portfolioId, publicationStatus: published ? 'published' : 'draft' } });
  };
}
