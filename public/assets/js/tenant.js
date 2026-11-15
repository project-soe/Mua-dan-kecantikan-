import { db, doc, getDoc } from './firebase.js';
import { isLocal } from './env.js';

const ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
export const diag = { reason: '', stage: '', code: '', projectId: '', databaseId: '(default)' };

// Domain -> tenant. Domain hanya identitas; hak akses tetap diatur Rules/backend.
// Mengembalikan null hanya bila dokumen memang tidak ada/tidak aktif.
// Kegagalan akses Firestore diteruskan agar tidak disamarkan sebagai "situs tidak ditemukan".
export async function resolveTenant() {
  diag.reason = '';
  diag.stage = '';
  diag.code = '';
  diag.projectId = db.app.options.projectId;

  let tenantId = null;
  const override = new URLSearchParams(location.search).get('tenant');
  if (isLocal && override && ID_RE.test(override)) {
    tenantId = override; // pintasan dev, hanya di localhost
  } else {
    const domain = location.hostname.toLowerCase().replace(/^www\./, '');
    diag.stage = 'platformDomains';
    try {
      const snap = await getDoc(doc(db, 'platformDomains', domain));
      if (!snap.exists()) {
        diag.reason = `Dokumen platformDomains/${domain} tidak ditemukan.`;
        return null;
      }
      const data = snap.data();
      if (data.status !== 'active') {
        diag.reason = `Domain ${domain} memiliki status tidak aktif: ${String(data.status)}.`;
        return null;
      }
      if (typeof data.tenantId !== 'string' || !ID_RE.test(data.tenantId)) {
        diag.reason = `Field tenantId pada platformDomains/${domain} tidak valid.`;
        return null;
      }
      tenantId = data.tenantId;
    } catch (e) {
      diag.code = e?.code ?? 'unknown';
      diag.reason = `Gagal membaca platformDomains/${domain}: ${e?.code ?? e?.message ?? String(e)}`;
      throw e;
    }
  }

  diag.stage = 'publicTenants';
  try {
    const pub = await getDoc(doc(db, 'publicTenants', tenantId));
    if (!pub.exists()) {
      diag.reason = `Dokumen publicTenants/${tenantId} tidak ditemukan pada database (default).`;
      return null;
    }
    const data = pub.data();
    if (data.status !== 'active') {
      diag.reason = `Tenant ${tenantId} memiliki status tidak aktif: ${String(data.status)}.`;
      return null;
    }
    return { id: tenantId, ...data };
  } catch (e) {
    diag.code = e?.code ?? 'unknown';
    diag.reason = `Gagal membaca publicTenants/${tenantId}: ${e?.code ?? e?.message ?? String(e)}`;
    throw e;
  }
}

// Tautan internal yang mempertahankan ?tenant= saat di localhost.
export function tenantHref(path) {
  const u = new URL(path, location.origin);
  const o = new URLSearchParams(location.search).get('tenant');
  if (isLocal && o && ID_RE.test(o)) u.searchParams.set('tenant', o);
  return u.pathname + u.search + u.hash;
}
