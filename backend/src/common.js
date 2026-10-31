import { AppError } from './errors.js';
import { slugify } from './validate.js';

export const uniqueRef = (db, t, key) => db.doc(`tenants/${t}/uniqueKeys/${key}`);
export const auditRef = (db, t) => db.collection(`tenants/${t}/auditLogs`).doc();
export const slugKey = (kind, slug) => `${kind}-slug_${slug}`;

// Hanya membaca (panggil sebelum penulisan di dalam transaksi).
export async function pickSlug(tx, db, t, kind, name, suffix) {
  let slug = slugify(name);
  let snap = await tx.get(uniqueRef(db, t, slugKey(kind, slug)));
  if (snap.exists) {
    slug = `${slug}-${slugify(suffix)}`.slice(0, 90);
    snap = await tx.get(uniqueRef(db, t, slugKey(kind, slug)));
    if (snap.exists) throw new AppError('already-exists', 'Slug sudah dipakai');
  }
  return slug;
}

export async function assertExists(tx, db, t, collection, id, label) {
  if (!id) return;
  const snap = await tx.get(db.doc(`tenants/${t}/${collection}/${id}`));
  if (!snap.exists) throw new AppError('resource-not-found', `${label} tidak ditemukan`);
}
