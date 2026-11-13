import { FieldValue } from 'firebase-admin/firestore';
import { PAYMENT_METHODS } from '../../../shared/constants/index.js';
import { AppError } from '../errors.js';
import { rejectUnknown, str, oneOf, bool, imageKitUrl } from '../validate.js';
import { auditEntry } from '../audit.js';
import { auditRef } from '../common.js';
import { config } from '../config.js';
import { isRecentAuth } from './recentAuth.js';
import { bad, publicPayRef } from './common.js';

const NUM_RE = /^[0-9][0-9 -]{3,28}[0-9]$/;

function parseMethod(m, t, i) {
  const p = `methods[${i}]`;
  if (typeof m !== 'object' || m === null || Array.isArray(m)) throw bad(`${p} tidak valid`);
  rejectUnknown(m, ['method', 'enabled', 'accountName', 'bankName', 'accountNumber', 'qrImage']);
  const method = oneOf(m.method, PAYMENT_METHODS, `${p}.method`);
  const enabled = bool(m.enabled, `${p}.enabled`);
  const out = { method, enabled };
  const put = (k, v) => { if (v !== undefined) out[k] = v; };
  put('accountName', str(m.accountName, `${p}.accountName`, { min: 2, max: 80, optional: !enabled }));
  put('bankName', str(m.bankName, `${p}.bankName`, { min: 2, max: 40, optional: !(enabled && method === 'bank_transfer') }));
  const num = str(m.accountNumber, `${p}.accountNumber`, { max: 30, optional: !(enabled && method !== 'qris') });
  if (num !== undefined && !NUM_RE.test(num)) throw bad(`${p}.accountNumber hanya boleh angka, spasi, dan -`);
  put('accountNumber', num);
  put('qrImage', imageKitUrl(m.qrImage, `${p}.qrImage`, `/tenants/${t}/payment-methods/`,
    { optional: !(enabled && method === 'qris') }));
  return out;
}

export function updatePaymentSettings(db) {
  return async (req, res) => {
    const t = req.tenant.id;
    // Mengubah tujuan pembayaran = perubahan berisiko tinggi: wajib login baru-baru ini.
    // Memakai jam asli (bukan jam uji) karena ini pemeriksaan keamanan.
    if (!isRecentAuth(req.user.auth_time, Date.now(), config.recentAuthSeconds)) {
      throw new AppError('permission-denied', 'Login ulang diperlukan untuk mengubah pengaturan pembayaran');
    }
    rejectUnknown(req.body, ['tenantId', 'methods', 'instructionsText', 'internalNotes']);
    const list = req.body.methods;
    if (!Array.isArray(list) || list.length < 1 || list.length > PAYMENT_METHODS.length) {
      throw bad('methods harus berisi 1-6 metode');
    }
    const methods = list.map((m, i) => parseMethod(m, t, i));
    if (new Set(methods.map((m) => m.method)).size !== methods.length) throw bad('methods tidak boleh duplikat');
    const instructionsText = str(req.body.instructionsText, 'instructionsText', { max: 500, optional: true }) ?? '';
    const internalNotes = str(req.body.internalNotes, 'internalNotes', { max: 500, optional: true }) ?? '';

    const ts = FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.set(publicPayRef(db, t), { methods, instructionsText, updatedBy: req.user.uid, updatedAt: ts });
    batch.set(db.doc(`tenants/${t}/settings/paymentPrivate`), { internalNotes, updatedBy: req.user.uid, updatedAt: ts });
    batch.set(auditRef(db, t), auditEntry({
      actorUid: req.user.uid, tenantId: t, action: 'updatePaymentSettings',
      resourceType: 'settings', resourceId: 'payment',
      summary: { enabledMethods: methods.filter((m) => m.enabled).map((m) => m.method) }, // tanpa nomor rekening
    }));
    await batch.commit();
    res.json({ ok: true, data: { enabledMethods: methods.filter((m) => m.enabled).map((m) => m.method) } });
  };
}
