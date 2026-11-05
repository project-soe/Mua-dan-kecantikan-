import { mountCrud } from './admin-crud.js';
import { adminCall } from './admin-api.js';
import { h } from './dom.js';
import { askDialog, toast, apiErrText } from './admin-ui.js';
import { stars } from './review-model.js';

const CFG = {
  title: 'Testimoni', singular: 'testimoni', collection: 'reviews', idKey: 'reviewId', titleKey: 'clientName',
  api: { create: 'createReview', update: 'updateReview', publish: 'publishReview' },
  area: 'reviews', categoryCollection: 'serviceCategories', categoryKind: 'service',
  fields: [
    { name: 'clientName', label: 'Nama klien', type: 'text', required: true, hint: 'Tampil di situs. Pakai nama yang disetujui klien (boleh inisial).' },
    { name: 'rating', label: 'Penilaian (1–5)', type: 'number', required: true, min: 1, max: 5, default: '5' },
    { name: 'quote', label: 'Kutipan testimoni', type: 'textarea', required: true, hint: '10–600 karakter. Salin kata-kata klien apa adanya.' },
    { name: 'categoryId', label: 'Jenis acara', type: 'category' },
    { name: 'eventLabel', label: 'Keterangan acara (opsional)', type: 'text', hint: 'Contoh: Akad dan resepsi, Bandar Lampung.' },
    { name: 'source', label: 'Sumber (opsional)', type: 'text', hint: 'Contoh: WhatsApp, Instagram, Google.' },
    { name: 'photo', label: 'Foto klien (opsional)', type: 'image', hint: 'Hanya jika klien mengizinkan fotonya ditampilkan.' },
    { name: 'featured', label: 'Tampilkan lebih dulu', type: 'checkbox' },
    { name: 'consentConfirmed', label: 'Izin klien sudah dikonfirmasi', type: 'checkbox',
      hint: 'Centang hanya jika klien sudah setuju nama, kutipan, dan foto (bila ada) ditampilkan. Wajib untuk menerbitkan.' },
    { name: 'sortOrder', label: 'Urutan (angka kecil tampil lebih dulu)', type: 'number', min: 0, default: '0' },
  ],
  summary: (r) => [stars(r.rating), r.eventLabel, r.consentConfirmed ? 'Izin klien ✓' : 'Izin klien belum dikonfirmasi'].filter(Boolean).join(' · '),
  extraActions: (r, { ctx, reload }) => (['owner', 'admin'].includes(ctx.role) ? [
    h('button', { class: 'btn btn--ghost btn--small', type: 'button', text: 'Hapus', onclick: async () => {
      const ok = await askDialog({ title: `Hapus testimoni: ${r.clientName}`,
        text: 'Testimoni dihapus permanen dan langsung hilang dari situs. Tindakan ini tidak dapat dibatalkan.', confirmLabel: 'Hapus testimoni' });
      if (!ok) return;
      try { await adminCall('deleteReview', { tenantId: ctx.tenant.id, reviewId: r.id }); toast('Testimoni dihapus'); }
      catch (e) { toast(apiErrText(e)); }
      await reload();
    } }),
  ] : []),
};

export const mountReviews = (root, ctx) => mountCrud(root, ctx, CFG);
