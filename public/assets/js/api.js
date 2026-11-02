import { getIdToken } from './auth.js';
import { isLocal } from './env.js';
import { apiBase } from './firebase-config.js';

export class ApiError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}
const base = () => (isLocal ? `http://${location.hostname}:3000` : apiBase);

export function makeCall(getToken) {
  return async function call(name, body) {
    const root = base();
    if (!root) throw new ApiError('internal', 'Alamat server belum dikonfigurasi', 0);
    let token;
    try { token = await getToken(); }
    catch { throw new ApiError('unauthenticated', 'Sesi belum siap', 0); }
    let res;
    try {
      res = await fetch(`${root}/api/${name}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
    } catch { throw new ApiError('network', 'Tidak dapat menghubungi server', 0); }
    let json = null;
    try { json = await res.json(); } catch { /* biarkan null */ }
    if (!res.ok) throw new ApiError(json?.error?.code ?? 'internal', json?.error?.message ?? 'Terjadi kesalahan', res.status);
    return json.data;
  };
}

export const call = makeCall(getIdToken);
