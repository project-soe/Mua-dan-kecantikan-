import { FieldValue } from 'firebase-admin/firestore';
import { AppError } from '../errors.js';
import { rejectUnknown, str, httpsUrl, storagePath, oneOf } from '../validate.js';
import { auditEntry } from '../audit.js';

export function updateBrandProfile(db) {
  return async (req, res) => {
    const t = req.tenant.id;
    rejectUnknown(req.body, ['tenantId', 'brandName', 'tagline', 'description', 'logoUrl', 'faviconUrl',
      'logoImage', 'brandImage', 'faviconImage', 'headerStyle']);
    const branding = `tenants/${t}/branding/`;
    const patch = {};
    const put = (k, v) => { if (v !== undefined) patch[k] = v; };
    put('brandName', str(req.body.brandName, 'brandName', { min: 2, max: 80, optional: true }));
    put('tagline', str(req.body.tagline, 'tagline', { max: 160, optional: true }));
    put('description', str(req.body.description, 'description', { max: 2000, optional: true }));
    put('logoUrl', httpsUrl(req.body.logoUrl, 'logoUrl', { optional: true }));
    put('faviconUrl', httpsUrl(req.body.faviconUrl, 'faviconUrl', { optional: true }));
    // Gambar brand disimpan sebagai path Storage di folder branding tenant sendiri.
    put('logoImage', storagePath(req.body.logoImage, 'logoImage', branding, { optional: true }));
    put('brandImage', storagePath(req.body.brandImage, 'brandImage', branding, { optional: true }));
    put('faviconImage', storagePath(req.body.faviconImage, 'faviconImage', branding, { optional: true }));
    if (req.body.headerStyle !== undefined) put('headerStyle', oneOf(req.body.headerStyle, ['light', 'dark'], 'headerStyle'));
    if (!Object.keys(patch).length) throw new AppError('invalid-argument', 'Tidak ada field yang diubah');

    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.update(db.doc(`tenants/${t}/profile/business`), { ...patch, updatedAt: now });
    // Hanya field publik yang disalin ke proyeksi publik (legalName tidak ikut).
    batch.set(db.doc(`publicTenants/${t}`), { ...patch, updatedAt: now }, { merge: true });
    batch.set(db.collection(`tenants/${t}/auditLogs`).doc(), auditEntry({
      actorUid: req.user.uid, tenantId: t, action: 'updateBrandProfile',
      resourceType: 'tenant', resourceId: t, summary: { fields: Object.keys(patch) },
    }));
    await batch.commit();
    res.json({ ok: true, data: { updatedProfile: patch } });
  };
}
