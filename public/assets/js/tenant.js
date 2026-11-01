import { db, doc, getDoc } from './firebase.js';
import { isLocal } from './env.js';

const ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;

// Domain -> tenant. Domain hanya identitas; hak akses tetap diatur Rules/backend.
// Mengembalikan null bila tenant tidak ditemukan/tidak aktif; melempar bila data gagal dimuat.
export async function resolveTenant() {
  let tenantId = null;
  const override = new URLSearchParams(location.search).get('tenant');
  if (isLocal && override && ID_RE.test(override)) {
    tenantId = override; // pintasan dev, hanya di localhost
  } else {
    const domain = location.hostname.toLowerCase().replace(/^www\./, '');
    try {
      const snap = await getDoc(doc(db, 'platformDomains', domain));
      if (!snap.exists() || snap.data().status !== 'active') return null;
      tenantId = snap.data().tenantId;
    } catch (e) {
      if (e?.code === 'permission-denied') return null; // domain tidak terdaftar/tidak aktif
      throw e;
    }
  }
  const pub = await getDoc(doc(db, 'publicTenants', tenantId));
  if (!pub.exists() || pub.data().status !== 'active') return null;
  return { id: tenantId, ...pub.data() };
}

// Tautan internal yang mempertahankan ?tenant= saat di localhost.
export function tenantHref(path) {
  const u = new URL(path, location.origin);
  const o = new URLSearchParams(location.search).get('tenant');
  if (isLocal && o && ID_RE.test(o)) u.searchParams.set('tenant', o);
  return u.pathname + u.search + u.hash;
}
