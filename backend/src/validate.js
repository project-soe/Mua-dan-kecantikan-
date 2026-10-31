import { AppError } from './errors.js';

const bad = (msg) => new AppError('invalid-argument', msg);
const missing = (v) => v === undefined || v === null;

export function tenantIdOf(body) {
  const v = body?.tenantId;
  if (typeof v !== 'string' || !/^[a-z0-9][a-z0-9-]{1,40}$/.test(v)) throw bad('tenantId tidak valid');
  return v;
}

export function oneOf(value, list, name) {
  if (!list.includes(value)) throw bad(`${name} tidak valid`);
  return value;
}

export function rejectUnknown(body, allowed) {
  for (const k of Object.keys(body ?? {})) {
    if (!allowed.includes(k)) throw bad(`Field tidak dikenal: ${k}`);
  }
}

export function str(v, name, { min = 0, max = 200, optional = false } = {}) {
  if (missing(v)) { if (optional) return undefined; throw bad(`${name} wajib diisi`); }
  if (typeof v !== 'string') throw bad(`${name} harus berupa teks`);
  const s = v.trim();
  if (s.length < min || s.length > max) throw bad(`${name} harus ${min}-${max} karakter`);
  return s;
}

export function int(v, name, { min = 0, max = 1_000_000_000, optional = false } = {}) {
  if (missing(v)) { if (optional) return undefined; throw bad(`${name} wajib diisi`); }
  if (!Number.isSafeInteger(v) || v < min || v > max) {
    throw bad(`${name} harus bilangan bulat ${min}-${max}`);
  }
  return v;
}

export function bool(v, name) {
  if (typeof v !== 'boolean') throw bad(`${name} harus true atau false`);
  return v;
}

export function httpsUrl(v, name, { optional = false, max = 500 } = {}) {
  const s = str(v, name, { min: 1, max, optional });
  if (s === undefined) return undefined;
  let u;
  try { u = new URL(s); } catch { throw bad(`${name} bukan URL yang valid`); }
  if (u.protocol !== 'https:') throw bad(`${name} harus memakai https`);
  return s;
}

const PATH_RE = /^[A-Za-z0-9._\/-]+$/;

export function storagePath(v, name, prefix, { optional = false } = {}) {
  const s = str(v, name, { min: 1, max: 300, optional });
  if (s === undefined) return undefined;
  if (!s.startsWith(prefix) || s.includes('..') || !PATH_RE.test(s)) {
    throw bad(`${name} harus berada di ${prefix}`);
  }
  return s;
}

export function storagePaths(v, name, prefix, { max = 12, optional = false } = {}) {
  if (missing(v)) { if (optional) return undefined; throw bad(`${name} wajib diisi`); }
  if (!Array.isArray(v) || v.length > max) throw bad(`${name} harus berupa daftar maksimal ${max} item`);
  return v.map((p, i) => storagePath(p, `${name}[${i}]`, prefix));
}

export function idOf(v, name) {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(v)) throw bad(`${name} tidak valid`);
  return v;
}

export function slugify(s) {
  const out = String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return out || 'item';
}

export function optBool(v, name) {
  return v === undefined ? undefined : bool(v, name);
}
