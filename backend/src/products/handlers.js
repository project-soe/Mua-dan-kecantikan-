import { FieldValue } from 'firebase-admin/firestore';
import { AppError } from '../errors.js';
import {
  rejectUnknown, str, int, bool, idOf, slugify, storagePath, storagePaths,
} from '../validate.js';
import { auditEntry } from '../audit.js';

const bad = (m) => new AppError('invalid-argument', m);
const MAX_STOCK = 1_000_000;
const FIELD_KEYS = ['name', 'brand', 'sku', 'categoryId', 'description', 'price', 'discountPrice',
  'weightGrams', 'coverImage', 'thumbnailImage', 'gallery'];

const prefixOf = (t) => `tenants/${t}/products/`;
const keyRef = (db, t, key) => db.doc(`tenants/${t}/uniqueKeys/${key}`);
const skuKey = (sku) => `product-sku_${sku}`;
const slugKey = (slug) => `product-slug_${slug}`;
const auditRef = (db, t) => db.collection(`tenants/${t}/auditLogs`).doc();
const productRef = (db, t, id) => db.doc(`tenants/${t}/products/${id}`);

function parseFields(body, t, requireAll) {
  const opt = !requireAll;
  const f = {};
  const put = (k, v) => { if (v !== undefined) f[k] = v; };
  put('name', str(body.name, 'name', { min: 2, max: 120, optional: opt }));
  put('brand', str(body.brand, 'brand', { max: 80, optional: true }));
  const rawSku = str(body.sku, 'sku', { min: 2, max: 40, optional: opt });
  if (rawSku !== undefined) {
    const s = rawSku.toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(s)) throw bad('sku hanya boleh huruf, angka, - dan _');
    f.sku = s;
  }
  put('categoryId', str(body.categoryId, 'categoryId', { max: 60, optional: true }));
  if (f.categoryId && !/^[A-Za-z0-9_-]{1,60}$/.test(f.categoryId)) throw bad('categoryId tidak valid');
  put('description', str(body.description, 'description', { max: 5000, optional: true }));
  put('price', int(body.price, 'price', { optional: opt }));
  put('discountPrice', int(body.discountPrice, 'discountPrice', { optional: true }));
  put('weightGrams', int(body.weightGrams, 'weightGrams', { max: 1_000_000, optional: true }));
  put('coverImage', storagePath(body.coverImage, 'coverImage', prefixOf(t), { optional: true }));
  put('thumbnailImage', storagePath(body.thumbnailImage, 'thumbnailImage', prefixOf(t), { optional: true }));
  put('gallery', storagePaths(body.gallery, 'gallery', prefixOf(t), { max: 12, optional: true }));
  return f;
}

async function assertCategory(tx, db, t, categoryId) {
  if (!categoryId) return;
  const snap = await tx.get(db.doc(`tenants/${t}/productCategories/${categoryId}`));
  if (!snap.exists) throw new AppError('resource-not-found', 'Kategori tidak ditemukan');
}

export function createProduct(db) {
  return async (req, res) => {
    const t = req.tenant.id;
    rejectUnknown(req.body, ['tenantId', 'stock', ...FIELD_KEYS]);
    const f = parseFields(req.body, t, true);
    const stock = int(req.body.stock, 'stock', { max: MAX_STOCK, optional: true }) ?? 0;
    if (f.discountPrice !== undefined && f.discountPrice > f.price) {
      throw bad('discountPrice tidak boleh lebih tinggi dari price');
    }

    const ref = db.collection(`tenants/${t}/products`).doc();
    let slug;
    await db.runTransaction(async (tx) => {
      // Semua pembacaan dulu, baru penulisan.
      const skuSnap = await tx.get(keyRef(db, t, skuKey(f.sku)));
      if (skuSnap.exists) throw new AppError('already-exists', 'SKU sudah dipakai');
      slug = slugify(f.name);
      let slugSnap = await tx.get(keyRef(db, t, slugKey(slug)));
      if (slugSnap.exists) {
        slug = `${slug}-${slugify(f.sku)}`.slice(0, 90);
        slugSnap = await tx.get(keyRef(db, t, slugKey(slug)));
        if (slugSnap.exists) throw new AppError('already-exists', 'Slug sudah dipakai');
      }
      await assertCategory(tx, db, t, f.categoryId);

      const now = FieldValue.serverTimestamp();
      tx.set(ref, { ...f, slug, stock, variants: [], published: false, createdAt: now, updatedAt: now });
      tx.set(keyRef(db, t, skuKey(f.sku)), { productId: ref.id, createdAt: now });
      tx.set(keyRef(db, t, slugKey(slug)), { productId: ref.id, createdAt: now });
      tx.set(auditRef(db, t), auditEntry({
        actorUid: req.user.uid, tenantId: t, action: 'createProduct',
        resourceType: 'product', resourceId: ref.id, summary: { sku: f.sku },
      }));
    });
    res.json({ ok: true, data: { productId: ref.id, sku: f.sku, slug, productStatus: 'draft' } });
  };
}

export function updateProduct(db) {
  return async (req, res) => {
    const t = req.tenant.id;
    rejectUnknown(req.body, ['tenantId', 'productId', ...FIELD_KEYS]);
    const productId = idOf(req.body.productId, 'productId');
    const f = parseFields(req.body, t, false);
    if (!Object.keys(f).length) throw bad('Tidak ada field yang diubah');

    const ref = productRef(db, t, productId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new AppError('resource-not-found', 'Produk tidak ditemukan');
      const cur = snap.data();

      const price = f.price ?? cur.price;
      const disc = f.discountPrice ?? cur.discountPrice;
      if (disc !== undefined && disc > price) throw bad('discountPrice tidak boleh lebih tinggi dari price');

      const skuChanged = f.sku !== undefined && f.sku !== cur.sku;
      if (skuChanged) {
        const k = await tx.get(keyRef(db, t, skuKey(f.sku)));
        if (k.exists && k.data().productId !== productId) throw new AppError('already-exists', 'SKU sudah dipakai');
      }
      if (f.categoryId !== undefined && f.categoryId !== cur.categoryId) {
        await assertCategory(tx, db, t, f.categoryId);
      }

      const now = FieldValue.serverTimestamp();
      tx.update(ref, { ...f, updatedAt: now });
      if (skuChanged) {
        tx.set(keyRef(db, t, skuKey(f.sku)), { productId, createdAt: now });
        tx.delete(keyRef(db, t, skuKey(cur.sku)));
      }
      tx.set(auditRef(db, t), auditEntry({
        actorUid: req.user.uid, tenantId: t, action: 'updateProduct',
        resourceType: 'product', resourceId: productId, summary: { fields: Object.keys(f) },
      }));
    });
    res.json({ ok: true, data: { productId, updatedFields: Object.keys(f) } });
  };
}

export function updateProductStock(db) {
  return async (req, res) => {
    const t = req.tenant.id;
    rejectUnknown(req.body, ['tenantId', 'productId', 'delta', 'reason']);
    const productId = idOf(req.body.productId, 'productId');
    const delta = int(req.body.delta, 'delta', { min: -MAX_STOCK, max: MAX_STOCK });
    if (delta === 0) throw bad('delta tidak boleh 0');
    const reason = str(req.body.reason, 'reason', { max: 200, optional: true });

    const ref = productRef(db, t, productId);
    let next;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new AppError('resource-not-found', 'Produk tidak ditemukan');
      const from = snap.data().stock ?? 0;
      next = from + delta;
      if (next < 0) throw new AppError('out-of-stock', 'Stok tidak mencukupi');
      if (next > MAX_STOCK) throw bad('Stok melebihi batas');
      tx.update(ref, { stock: next, updatedAt: FieldValue.serverTimestamp() });
      tx.set(auditRef(db, t), auditEntry({
        actorUid: req.user.uid, tenantId: t, action: 'updateProductStock',
        resourceType: 'product', resourceId: productId,
        summary: { from, to: next, delta, ...(reason ? { reason } : {}) },
      }));
    });
    res.json({ ok: true, data: { productId, stock: next } });
  };
}

export function publishProduct(db) {
  return async (req, res) => {
    const t = req.tenant.id;
    rejectUnknown(req.body, ['tenantId', 'productId', 'published']);
    const productId = idOf(req.body.productId, 'productId');
    const published = bool(req.body.published, 'published');

    const ref = productRef(db, t, productId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new AppError('resource-not-found', 'Produk tidak ditemukan');
      if (published && !snap.data().coverImage) {
        throw new AppError('failed-precondition', 'Produk belum punya coverImage');
      }
      tx.update(ref, { published, updatedAt: FieldValue.serverTimestamp() });
      tx.set(auditRef(db, t), auditEntry({
        actorUid: req.user.uid, tenantId: t, action: published ? 'publishProduct' : 'unpublishProduct',
        resourceType: 'product', resourceId: productId,
      }));
    });
    res.json({ ok: true, data: { productId, productStatus: published ? 'published' : 'draft' } });
  };
}
