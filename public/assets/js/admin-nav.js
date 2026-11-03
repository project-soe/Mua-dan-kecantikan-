// Menu panel admin: urutan, kelompok, dan peran yang melihatnya (murni, tanpa DOM).
// Ini hanya pengaturan tampilan. Penegakan akses sebenarnya ada di backend dan Firestore/Storage Rules.
const STAFF = ['owner', 'admin', 'content_manager', 'finance_manager'];
const CONTENT = ['owner', 'admin', 'content_manager'];
const MONEY = ['owner', 'finance_manager'];
const SETTINGS = ['owner', 'admin'];

export const TABS = [
  { key: 'booking', label: 'Booking', group: 'Operasional', roles: STAFF,
    title: 'Booking', desc: 'Daftar booking pelanggan. Konfirmasi atau batalkan jadwal.' },
  { key: 'pembayaran', label: 'Pembayaran', group: 'Operasional', roles: MONEY,
    title: 'Pembayaran', desc: 'Periksa bukti transfer, lalu verifikasi atau tolak.' },
  { key: 'produk', label: 'Produk', group: 'Katalog', roles: CONTENT,
    title: 'Produk', desc: 'Tambah produk, ubah harga dan stok, kelola foto, terbitkan atau hapus.' },
  { key: 'layanan', label: 'Layanan', group: 'Katalog', roles: CONTENT,
    title: 'Layanan', desc: 'Atur layanan MUA: harga, deposit, durasi, dan foto.' },
  { key: 'portfolio', label: 'Portfolio', group: 'Katalog', roles: CONTENT,
    title: 'Portfolio', desc: 'Foto hasil MUA yang tampil di beranda.' },
  { key: 'brand', label: 'Brand', group: 'Pengaturan', roles: SETTINGS,
    title: 'Brand', desc: 'Nama, label, logo, dan gambar utama situs.' },
  { key: 'jam', label: 'Jam buka', group: 'Pengaturan', roles: SETTINGS,
    title: 'Jam buka', desc: 'Jam layanan MUA (menentukan jam booking) dan jam toko produk.' },
  { key: 'metode', label: 'Metode bayar', group: 'Pengaturan', roles: MONEY,
    title: 'Metode pembayaran', desc: 'Rekening, e-wallet, dan QRIS yang ditampilkan ke pelanggan saat membayar.' },
];

export const tabsFor = (role) => TABS.filter((t) => t.roles.includes(role));
export const defaultTab = (role) => (role === 'finance_manager' ? 'pembayaran' : (tabsFor(role)[0]?.key ?? null));

export function groupTabs(tabs) {
  const out = [];
  for (const t of tabs) {
    let g = out.find((x) => x.group === t.group);
    if (!g) { g = { group: t.group, tabs: [] }; out.push(g); }
    g.tabs.push(t);
  }
  return out;
}
