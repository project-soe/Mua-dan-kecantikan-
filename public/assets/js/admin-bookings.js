import { adminDb, collection, getDocs, query, orderBy, limit } from './admin-firebase.js';
import { adminCall } from './admin-api.js';
import { h } from './dom.js';
import { rupiah } from './format.js';
import { bookingStatusText } from './status.js';
import { askDialog, toast, apiErrText } from './admin-ui.js';

const FILTERS = [['all', 'Semua'], ['pending', 'Perlu konfirmasi'], ['awaiting_payment', 'Menunggu bayar'],
  ['payment_verification', 'Verifikasi bayar'], ['confirmed', 'Terkonfirmasi'], ['cancelled', 'Dibatalkan']];
const ACT_ROLES = ['owner', 'admin'];
const SEE_PHONE = ['owner', 'admin', 'finance_manager']; // pembatasan tampilan saja, bukan penegakan keamanan
const CANCELLABLE = ['pending', 'awaiting_payment', 'payment_verification', 'confirmed'];
const MODE = { studio: 'Di studio', customer_location: 'Di lokasi pelanggan' };
const fmtDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('id-ID', { dateStyle: 'full', timeZone: 'UTC' });

export async function mountBookings(root, ctx) {
  const state = { filter: 'all', items: [] };
  const list = h('div', { class: 'hist-list', 'aria-live': 'polite' });
  const select = h('select', { class: 'input', id: 'bk-filter', style: 'max-width:16rem',
    onchange: (e) => { state.filter = e.target.value; draw(); } },
  FILTERS.map(([v, l]) => h('option', { value: v, text: l })));
  root.replaceChildren(
    h('div', { class: 'toolbar' },
      h('label', { for: 'bk-filter', class: 'meta', text: 'Tampilkan' }), select,
      h('button', { class: 'btn btn--ghost btn--small', type: 'button', text: 'Muat ulang', onclick: () => load() })),
    list);

  async function load() {
    list.replaceChildren(h('div', { class: 'skeleton', style: 'height:8rem' }));
    try {
      const snap = await getDocs(query(collection(adminDb, 'tenants', ctx.tenant.id, 'bookings'), orderBy('createdAt', 'desc'), limit(50)));
      state.items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      draw();
    } catch (e) {
      console.error(e);
      list.replaceChildren(h('p', { class: 'alert', role: 'alert', text: 'Data booking belum dapat dimuat.' }));
    }
  }

  function draw() {
    const items = state.items.filter((b) => state.filter === 'all' || b.bookingStatus === state.filter);
    list.replaceChildren(...(items.length ? items.map(card) : [h('p', { class: 'empty', text: 'Tidak ada booking pada filter ini.' })]));
  }

  async function run(fn, okText) {
    try { await fn(); toast(okText); } catch (e) { toast(apiErrText(e)); }
    await load();
  }

  async function confirmIt(b) {
    const ok = await askDialog({ title: 'Konfirmasi booking',
      text: `Konfirmasi ${b.bookingNumber} atas nama ${b.customerName}? Jadwal akan ditahan permanen.`, confirmLabel: 'Konfirmasi' });
    if (!ok) return;
    await run(() => adminCall('confirmBooking', { tenantId: ctx.tenant.id, bookingId: b.id }), 'Booking dikonfirmasi');
  }

  async function cancelIt(b) {
    const money = b.paymentStatus !== 'unpaid' || b.pendingPaymentId;
    const r = await askDialog({ title: 'Batalkan booking',
      text: `Batalkan ${b.bookingNumber}? Jadwal akan dilepas.${money ? ' Pembayaran sudah masuk atau sedang diverifikasi; booking akan ditandai perlu refund.' : ''}`,
      fields: [{ name: 'reason', label: 'Alasan pembatalan', type: 'textarea', required: true }], confirmLabel: 'Batalkan booking' });
    if (!r) return;
    await run(() => adminCall('cancelBooking', { tenantId: ctx.tenant.id, bookingId: b.id, reason: r.reason }), 'Booking dibatalkan');
  }

  function card(b) {
    const canAct = ACT_ROLES.includes(ctx.role);
    const actions = [];
    if (canAct && b.bookingStatus === 'pending') actions.push(h('button', { class: 'btn btn--small', type: 'button', text: 'Konfirmasi', onclick: () => confirmIt(b) }));
    if (canAct && CANCELLABLE.includes(b.bookingStatus)) actions.push(h('button', { class: 'btn btn--ghost btn--small', type: 'button', text: 'Batalkan', onclick: () => cancelIt(b) }));
    const loc = b.location ? `${MODE[b.location.mode] ?? b.location.mode}${b.location.address ? ` — ${b.location.address}` : ''}` : '';
    return h('article', { class: 'hist' },
      h('div', { class: 'hist__head' }, h('strong', { text: b.bookingNumber }), h('span', { class: 'badge', text: bookingStatusText(b) })),
      h('p', {}, h('strong', { text: b.customerName }), SEE_PHONE.includes(ctx.role) ? h('span', { class: 'meta', text: ` · ${b.customerPhone}` }) : null),
      h('p', { text: (b.serviceItems ?? []).map((i) => i.name).join(', ') }),
      h('p', { class: 'meta', text: `${fmtDate(b.bookingDate)}, ${b.startTime}–${b.endTime}` }),
      loc ? h('p', { class: 'meta', text: loc }) : null,
      b.notes ? h('p', { class: 'meta', text: `Catatan: ${b.notes}` }) : null,
      h('p', { class: 'price', text: `${rupiah(b.totalAmount)} · dibayar ${rupiah(b.paidAmount ?? 0)}` }),
      actions.length ? h('div', { class: 'hist__actions' }, actions) : null);
  }

  await load();
}
