import { mountCrud } from './admin-crud.js';
import { adminCall } from './admin-api.js';
import { h } from './dom.js';
import { rupiah, formatDuration } from './format.js';
import { askDialog, toast, apiErrText } from './admin-ui.js';

const CONFIGS = {
  produk: {
    title: 'Produk', singular: 'produk', collection: 'products', idKey: 'productId', titleKey: 'name',
    api: { create: 'createProduct', update: 'updateProduct', publish: 'publishProduct' },
    area: 'products', categoryCollection: 'productCategories', categoryKind: 'product',
    fields: [
      { name: 'name', label: 'Nama produk', type: 'text', required: true },
      { name: 'brand', label: 'Merek', type: 'text' },
      { name: 'sku', label: 'SKU (kode unik)', type: 'text', required: true, hint: 'Huruf, angka, - dan _. Tidak boleh sama dengan produk lain.' },
      { name: 'categoryId', label: 'Kategori', type: 'category' },
      { name: 'description', label: 'Deskripsi', type: 'textarea' },
      { name: 'price', label: 'Harga normal (Rp)', type: 'number', required: true, min: 0 },
      { name: 'discountPrice', label: 'Harga promo (Rp, opsional)', type: 'number', min: 0, hint: 'Tidak boleh lebih tinggi dari harga normal.' },
      { name: 'stock', label: 'Stok awal', type: 'number', min: 0, createOnly: true, default: '0', hint: 'Setelah dibuat, ubah stok lewat tombol "Ubah stok" di daftar.' },
      { name: 'weightGrams', label: 'Berat (gram)', type: 'number', min: 0 },
      { name: 'coverImage', label: 'Foto utama (wajib untuk menerbitkan)', type: 'image', autoThumb: 'thumbnailImage' },
      { name: 'thumbnailImage', type: 'image', hidden: true },
      { name: 'gallery', label: 'Foto tambahan (maks. 12)', type: 'gallery' },
    ],
    summary: (p) => `${rupiah(p.discountPrice ?? p.price)} · stok ${p.stock ?? 0}${p.sku ? ` · ${p.sku}` : ''}`,
    extraActions: (p, { ctx, reload }) => (['owner', 'admin'].includes(ctx.role) ? [
      h('button', { class: 'btn btn--ghost btn--small', type: 'button', text: 'Ubah stok', onclick: async () => {
        const r = await askDialog({ title: `Ubah stok: ${p.name}`,
          text: `Stok saat ini: ${p.stock ?? 0}. Isi angka positif untuk menambah, negatif untuk mengurangi.`,
          fields: [{ name: 'delta', label: 'Perubahan stok', type: 'number', min: -100000, required: true },
            { name: 'reason', label: 'Alasan (opsional)', type: 'text' }], confirmLabel: 'Simpan' });
        if (!r) return;
        const delta = Number(r.delta);
        if (!Number.isInteger(delta) || delta === 0) return toast('Isi angka bulat selain 0.');
        try {
          await adminCall('updateProductStock', { tenantId: ctx.tenant.id, productId: p.id, delta, ...(r.reason ? { reason: r.reason } : {}) });
          toast('Stok diperbarui');
        } catch (e) { toast(apiErrText(e)); }
        await reload();
      } }),
      h('button', { class: 'btn btn--ghost btn--small', type: 'button', text: 'Hapus', onclick: async () => {
        if (p.published) return toast('Batalkan penerbitan produk dulu, baru hapus.');
        const ok = await askDialog({ title: `Hapus produk: ${p.name}`,
          text: 'Produk dihapus permanen dan SKU-nya bisa dipakai lagi. Riwayat pesanan lama tetap aman. Tindakan ini tidak dapat dibatalkan.',
          confirmLabel: 'Hapus produk' });
        if (!ok) return;
        try { await adminCall('deleteProduct', { tenantId: ctx.tenant.id, productId: p.id }); toast('Produk dihapus'); }
        catch (e) { toast(apiErrText(e)); }
        await reload();
      } }),
    ] : []),
  },

  layanan: {
    title: 'Layanan', singular: 'layanan', collection: 'services', idKey: 'serviceId', titleKey: 'name',
    api: { create: 'createService', update: 'updateService', publish: 'publishService' },
    area: 'services', categoryCollection: 'serviceCategories', categoryKind: 'service',
    fields: [
      { name: 'name', label: 'Nama layanan', type: 'text', required: true },
      { name: 'categoryId', label: 'Kategori', type: 'category' },
      { name: 'description', label: 'Deskripsi', type: 'textarea' },
      { name: 'price', label: 'Harga (Rp)', type: 'number', required: true, min: 0 },
      { name: 'depositAmount', label: 'Deposit (Rp)', type: 'number', min: 0, hint: 'Tidak boleh lebih besar dari harga. Isi 0 atau kosongkan bila tanpa deposit.' },
      { name: 'durationMinutes', label: 'Durasi (menit)', type: 'number', required: true, min: 15, max: 1440 },
      { name: 'preparationTimeMinutes', label: 'Waktu persiapan (menit)', type: 'number', min: 0, max: 480, hint: 'Jeda setelah layanan, ikut menahan jadwal.' },
      { name: 'locationMode', label: 'Lokasi layanan', type: 'select', default: 'studio',
        options: [['studio', 'Di studio'], ['customer_location', 'Di lokasi pelanggan'], ['both', 'Studio atau lokasi pelanggan']] },
      { name: 'bookingEnabled', label: 'Bisa dibooking', type: 'checkbox', default: true },
      { name: 'coverImage', label: 'Foto utama (wajib untuk menerbitkan)', type: 'image' },
      { name: 'gallery', label: 'Foto tambahan (maks. 12)', type: 'gallery' },
    ],
    summary: (s) => `${rupiah(s.price)} · ${formatDuration(s.durationMinutes)}${s.bookingEnabled === false ? ' · booking dimatikan' : ''}`,
  },

  portfolio: {
    title: 'Portfolio', singular: 'portfolio', collection: 'portfolio', idKey: 'portfolioId', titleKey: 'title',
    api: { create: 'createPortfolio', update: 'updatePortfolio', publish: 'publishPortfolio' },
    area: 'portfolio', categoryCollection: 'serviceCategories', categoryKind: 'service',
    fields: [
      { name: 'title', label: 'Judul', type: 'text', required: true },
      { name: 'description', label: 'Deskripsi', type: 'textarea' },
      { name: 'modelName', label: 'Nama model', type: 'text' },
      { name: 'artistName', label: 'Nama MUA', type: 'text' },
      { name: 'categoryId', label: 'Kategori (jenis layanan)', type: 'category' },
      { name: 'coverImage', label: 'Foto utama (wajib untuk menerbitkan)', type: 'image', autoThumb: 'thumbnailImage' },
      { name: 'thumbnailImage', type: 'image', hidden: true },
      { name: 'beforeImage', label: 'Foto sebelum (opsional)', type: 'image', hint: 'Foto sebelum dan sesudah harus diisi berpasangan.' },
      { name: 'afterImage', label: 'Foto sesudah (opsional)', type: 'image' },
      { name: 'gallery', label: 'Foto tambahan (maks. 12)', type: 'gallery' },
      { name: 'featured', label: 'Tampilkan sebagai unggulan', type: 'checkbox' },
      { name: 'consentConfirmed', label: 'Izin model sudah dikonfirmasi', type: 'checkbox',
        hint: 'Centang hanya jika model sudah memberi izin tertulis foto ini ditampilkan. Wajib untuk menerbitkan.' },
      { name: 'sortOrder', label: 'Urutan (angka kecil tampil lebih dulu)', type: 'number', min: 0, default: '0' },
    ],
    summary: (p) => [p.modelName ? `Model: ${p.modelName}` : null, p.featured ? 'Unggulan' : null,
      p.consentConfirmed ? 'Izin model ✓' : 'Izin model belum dikonfirmasi'].filter(Boolean).join(' · '),
  },
};

export function mountCatalog(root, ctx, key) {
  return mountCrud(root, ctx, CONFIGS[key]);
}
