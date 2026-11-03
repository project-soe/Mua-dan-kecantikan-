// Logika murni layar Metode bayar: menyusun daftar metode untuk API dari isian formulir.
export const ORDER = ['bank_transfer', 'dana', 'ovo', 'gopay', 'shopeepay', 'qris'];
export const NUM_RE = /^[0-9][0-9 -]{3,28}[0-9]$/;

// states: Map atau objek { [metode]: { enabled, accountName, bankName, accountNumber, qrImage } }
export function buildMethods(states, labels = {}) {
  const get = (m) => (states instanceof Map ? states.get(m) : states?.[m]) ?? {};
  const methods = [];
  for (const m of ORDER) {
    const s = get(m);
    const name = String(s.accountName ?? '').trim();
    const bank = String(s.bankName ?? '').trim();
    const num = String(s.accountNumber ?? '').trim();
    const qr = String(s.qrImage ?? '').trim();
    const enabled = Boolean(s.enabled);
    if (!enabled && !(name || bank || num || qr)) continue;
    const label = labels[m] ?? m;
    if (enabled) {
      if (name.length < 2) throw new Error(`${label}: isi nama pemilik (minimal 2 karakter).`);
      if (m === 'bank_transfer' && bank.length < 2) throw new Error(`${label}: isi nama bank.`);
      if (m !== 'qris' && !num) throw new Error(`${label}: isi nomor.`);
      if (m === 'qris' && !qr) throw new Error(`${label}: unggah gambar QRIS.`);
    }
    if (m !== 'qris' && num && !NUM_RE.test(num)) throw new Error(`${label}: nomor hanya boleh angka, spasi, dan tanda -.`);
    const out = { method: m, enabled };
    if (name) out.accountName = name;
    if (m === 'bank_transfer' && bank) out.bankName = bank;
    if (m !== 'qris' && num) out.accountNumber = num;
    if (m === 'qris' && qr) out.qrImage = qr;
    methods.push(out);
  }
  if (!methods.length) throw new Error('Isi dan aktifkan minimal satu metode pembayaran.');
  return methods;
}
