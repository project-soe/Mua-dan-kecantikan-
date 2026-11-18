// Media publik produksi disajikan langsung dari ImageKit.
export function imageUrl(url) {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return null;
  try { const u = new URL(url); return u.protocol === 'https:' && !u.username && !u.password ? url : null; }
  catch { return null; }
}
