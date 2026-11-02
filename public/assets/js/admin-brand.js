import { mountCrud } from './admin-crud.js';

// Layar Brand memakai mesin formulir dalam mode satu dokumen (profil tenant).
const CFG = {
  single: true, title: 'Brand', singular: 'brand',
  docPath: (t) => ['tenants', t, 'profile', 'business'],
  api: { update: 'updateBrandProfile' },
  area: 'branding',
  fields: [
    { name: 'brandName', label: 'Nama brand', type: 'text' },
    { name: 'tagline', label: 'Label / tagline brand', type: 'text', hint: 'Tampil di atas judul beranda dan di judul tab browser.' },
    { name: 'description', label: 'Deskripsi singkat', type: 'textarea', hint: 'Tampil di bawah judul beranda.' },
    { name: 'headerStyle', label: 'Gaya header', type: 'select', default: 'light',
      options: [['light', 'Terang'], ['dark', 'Gelap (untuk logo berlatar gelap atau berwarna emas)']] },
    { name: 'logoImage', label: 'Logo header', type: 'image', hint: 'Ikon kecil di pojok kiri header. Untuk header gelap, pakai ikon berlatar transparan.' },
    { name: 'brandImage', label: 'Gambar brand utama (beranda)', type: 'image', hint: 'Logo lengkap atau foto brand di bagian atas beranda.' },
    { name: 'faviconImage', label: 'Ikon tab browser (favicon, persegi)', type: 'image' },
  ],
};

export const mountBrand = (root, ctx) => mountCrud(root, ctx, CFG);
