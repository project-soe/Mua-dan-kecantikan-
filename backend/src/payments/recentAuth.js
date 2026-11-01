// auth_time = detik saat pengguna terakhir login (klaim token Firebase).
export function isRecentAuth(authTimeSec, nowMs, maxAgeSec) {
  if (!Number.isFinite(authTimeSec)) return false;
  const age = nowMs / 1000 - authTimeSec;
  return age >= -60 && age <= maxAgeSec;
}
