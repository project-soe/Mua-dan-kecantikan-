import {
  adminDb, adminStorage, collection, doc, getDoc, getDocs, query, orderBy, limit, ref, getDownloadURL,
} from './admin-firebase.js';
import { adminCall } from './admin-api.js';
import { h } from './dom.js';
import { rupiah } from './format.js';
import { METHOD_LABEL } from './status.js';
import { askDialog, showImage, toast, apiErrText } from './admin-ui.js';

const PURPOSE = { deposit: 'Deposit', full: 'Lunas', balance: 'Pelunasan' };
const STATUS = { submitted: 'Menunggu verifikasi', verified: 'Terverifikasi', rejected: 'Ditolak', refunded: 'Dikembalikan', awaiting_payment: 'Menunggu pembayaran' };
const fmtTs = (ts) => (ts?.toDate ? ts.toDate().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '');

export async function mountPayments(root, ctx) {
  const state = { filter: 'submitted', items: [], bookings: new Map() };
  const list = h('div', { class: 'hist-list', 'aria-live': 'polite' });
  const select = h('select', { class: 'input', id: 'pay-filter', style: 'max-width:16rem',
    onchange: (e) => { state.filter = e.target.value; draw(); } },
  [['submitted', 'Menunggu verifikasi'], ['all', 'Semua']].map(([v, l]) => h('option', { value: v, text: l })));
  root.replaceChildren(
    h('div', { class: 'toolbar' },
      h('label', { for: 'pay-filter', class: 'meta', text: 'Tampilkan' }), select,
      h('button', { class: 'btn btn--ghost btn--small', type: 'button', text: 'Muat ulang', onclick: () => load() })),
    list);

  async function load() {
    list.replaceChildren(h('div', { class: 'skeleton', style: 'height:8rem' }));
    try {
      const snap = await getDocs(query(collection(adminDb, 'tenants', ctx.tenant.id, 'payments'), orderBy('createdAt', 'desc'), limit(50)));
      state.items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const ids = [...new Set(state.items.map((p) => p.bookingId).filter(Boolean))];
      state.bookings = new Map(await Promise.all(ids.map(async (id) => {
        const b = await getDoc(doc(adminDb, 'tenants', ctx.tenant.id, 'bookings', id));
        return [id, b.exists() ? b.data() : null];
      })));
      draw();
    } catch (e) {
      console.error(e);
      list.replaceChildren(h('p', { class: 'alert', role: 'alert', text: 'Data pembayaran belum dapat dimuat.' }));
    }
  }

  function draw() {
    const items = state.items.filter((p) => state.filter === 'all' || p.paymentStatus === state.filter);
    list.replaceChildren(...(items.length ? items.map(card) : [h('p', { class: 'empty', text: 'Tidak ada pembayaran pada filter ini.' })]));
  }

  async function run(fn, okText) {
    try { await fn(); toast(okText); } catch (e) { toast(apiErrText(e)); }
    await load();
  }

  async function viewProof(p) {
    try { await showImage('Bukti pembayaran', await getDownloadURL(ref(adminStorage, p.proofImagePath))); }
    catch (e) { console.error(e); toast('Bukti tidak dapat dimuat.'); }
  }

  async function verifyIt(p) {
    const r = await askDialog({ title: 'Verifikasi pembayaran',
      text: `Pengajuan: ${rupiah(p.amount)}. Pastikan dana sudah benar-benar masuk di rekening sebelum memverifikasi.`,
      fields: [{ name: 'received', label: 'Nominal yang benar-benar diterima (Rp)', type: 'number', value: String(p.amount), required: true }],
      confirmLabel: 'Verifikasi' });
    if (!r) return;
    const received = Number(r.received);
    if (!Number.isInteger(received) || received < 1) return toast('Nominal tidak valid.');
    await run(async () => {
      const out = await adminCall('verifyPayment', { tenantId: ctx.tenant.id, paymentId: p.id, decision: 'verify', receivedAmount: received });
      if (out.updatedTransactionStatus === 'confirmed') toast('Pembayaran diverifikasi, booking terkonfirmasi');
    }, 'Pembayaran diverifikasi');
  }

  async function rejectIt(p) {
    const r = await askDialog({ title: 'Tolak pembayaran',
      text: 'Pelanggan akan diminta mengirim bukti baru. Jadwal ditahan lagi selama batas waktu pembayaran.',
      fields: [{ name: 'reason', label: 'Alasan penolakan', type: 'textarea', required: true }], confirmLabel: 'Tolak pembayaran' });
    if (!r) return;
    await run(() => adminCall('verifyPayment', { tenantId: ctx.tenant.id, paymentId: p.id, decision: 'reject', rejectionReason: r.reason }), 'Pembayaran ditolak');
  }

  function card(p) {
    const b = state.bookings.get(p.bookingId);
    const actions = [h('button', { class: 'btn btn--ghost btn--small', type: 'button', text: 'Lihat bukti', onclick: () => viewProof(p) })];
    if (p.paymentStatus === 'submitted') {
      actions.push(h('button', { class: 'btn btn--small', type: 'button', text: 'Verifikasi', onclick: () => verifyIt(p) }));
      actions.push(h('button', { class: 'btn btn--ghost btn--small', type: 'button', text: 'Tolak', onclick: () => rejectIt(p) }));
    }
    return h('article', { class: 'hist' },
      h('div', { class: 'hist__head' },
        h('strong', { text: b?.bookingNumber ?? 'Booking tidak ditemukan' }),
        h('span', { class: 'badge', text: STATUS[p.paymentStatus] ?? p.paymentStatus })),
      b ? h('p', { text: b.customerName }) : null,
      h('p', { class: 'price', text: rupiah(p.amount) }),
      h('p', { class: 'meta', text: `${PURPOSE[p.purpose] ?? p.purpose} · ${METHOD_LABEL[p.method] ?? p.method} · ${fmtTs(p.submittedAt)}` }),
      p.paymentStatus === 'rejected' && p.rejectionReason ? h('p', { class: 'meta', text: `Alasan penolakan: ${p.rejectionReason}` }) : null,
      h('div', { class: 'hist__actions' }, actions));
  }

  await load();
}
