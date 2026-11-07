// Membangun muatan API dari isian formulir (murni, tanpa DOM).
// Saat ubah: hanya field yang berubah yang dikirim. API tidak punya "hapus nilai", jadi isian kosong = tidak berubah.
const isEmpty = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

export function buildPayload(fields, draft, original, isNew) {
  const out = {};
  const errors = [];
  for (const f of fields) {
    if (f.createOnly && !isNew) continue;
    const raw = draft[f.name];
    const prev = original?.[f.name];
    switch (f.type) {
      case 'number': {
        if (isEmpty(raw)) { if (isNew && f.required) errors.push(`${f.label} wajib diisi.`); break; }
        const n = Number(raw);
        if (!Number.isInteger(n)) { errors.push(`${f.label} harus bilangan bulat.`); break; }
        if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) {
          errors.push(`${f.label} di luar batas yang diizinkan.`); break;
        }
        if (isNew || n !== prev) out[f.name] = n;
        break;
      }
      case 'checkbox': {
        // undefined/null berarti field tidak disertakan, bukan false.
        // Nilai false eksplisit tetap diproses saat checkbox dimatikan.
        if (raw === undefined || raw === null) break;
        const b = Boolean(raw);
        if (isNew || b !== Boolean(prev)) out[f.name] = b;
        break;
      }
      case 'gallery':\n      case 'videoGallery': {
        const arr = Array.isArray(raw) ? raw : [];
        const before = Array.isArray(prev) ? prev : [];
        if (isNew ? arr.length > 0 : JSON.stringify(arr) !== JSON.stringify(before)) out[f.name] = arr;
        break;
      }
      case 'image': {
        if (isEmpty(raw)) { if (isNew && f.required) errors.push(`${f.label} wajib diisi.`); break; }
        if (raw !== prev) out[f.name] = raw;
        break;
      }
      default: {
        if (isEmpty(raw)) { if (isNew && f.required) errors.push(`${f.label} wajib diisi.`); break; }
        const s = String(raw).trim();
        if (isNew || s !== (prev ?? '')) out[f.name] = s;
      }
    }
  }
  return { out, errors };
}
