import { db, doc, getDoc } from './firebase.js';
import { isLocal } from './env.js';

const ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
export const diag = { reason: '' }; // hanya ditampilkan di localhost

// Domain -> tenant. Pada domain Firebase default, ?tenant= dapat memilih tenant
// karena satu project Hosting dapat menyajikan beberapa brand melalui URL.
export async function resolveTenant() {
  let tenantId = null;
  const override = new URLSearchParams(location.search).get('tenant');
  const validOverride = override && ID_RE.test(override);
  const hostname = location.hostname.toLowerCase();
  const isFirebaseDefaultHost =
    hostname === 'kolom-komentar-bfa86.web.app' ||
    hostname === 'kolom-komentar-bfa86.firebaseapp.com';

  if (validOverride && (isLocal || isFirebaseDefaultHost)) {
    tenantId = override;
  } else {
    const domain = hostname.replace(/^www\\./, '');
    try {
      const snap = await getDoc(doc(db, 'platformDomains', domain));
      if (!snap.exists() || snap.data().status !== 'active') {
        diag.reason = `domain "${domain}" tidak terdaftar/aktif`;
        return null;
      }
      tenantId = snap.data().tenantId;
    } catch (e) {
      if (e?.code === 'permission-denied') {
        diag.reason = `domain "${domain}" ditolak Rules (tidak terdaftar)`;
        return null;
      }
      throw e;
    }
  }

  const pub = await getDoc(doc(db, 'publicTenants', tenantId));
  if (!pub.exists()) {
    diag.reason = `dokumen publicTenants/${tenantId} tidak ada (jalankan npm run seed)`;
    return null;
  }
  if (pub.data().status !== 'active') {
    diag.reason = `tenant "${tenantId}" berstatus "${pub.data().status}"`;
    return null;
  }
  return { id: tenantId, ...pub.data() };
}

// Tautan internal mempertahankan ?tenant= pada localhost dan domain Firebase default.
export function tenantHref(path) {
  const u = new URL(path, location.origin);
  const o = new URLSearchParams(location.search).get('tenant');
  const hostname = location.hostname.toLowerCase();
  const isFirebaseDefaultHost =
    hostname === 'kolom-komentar-bfa86.web.app' ||
    hostname === 'kolom-komentar-bfa86.firebaseapp.com';
  if ((isLocal || isFirebaseDefaultHost) && o && ID_RE.test(o)) {
    u.searchParams.set('tenant', o);
  }
  return u.pathname + u.search + u.hash;
}
