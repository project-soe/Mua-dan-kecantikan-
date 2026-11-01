import { db, collection, getDocs, query, where, orderBy, limit } from './firebase.js';
import { bootPage } from './page.js';
import { h } from './dom.js';
import { rupiah } from './format.js';
import { ensureUser } from './auth.js';
import { tenantHref } from './tenant.js';
import { bookingStatusText, bookingAction, orderStatusText } from './status.js';

const $ = (id) => document.getElementById(id);
const PAGE = 30;
const fmtDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('id-ID', { dateStyle: 'long', timeZone: 'UTC' });
const fmtTs = (ts) => (ts?.toDate ? ts.toDate().toLocaleDateString('id-ID', { dateStyle: 'long' }) : '');

async function load(tenantId, uid, name) {
  const q = query(collection(db, 'tenants', tenantId, name),
    where('customerId', '==', uid), orderBy('createdAt', 'desc'), limit(PAGE));
  return (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
}

function bookingItem(b) {
  const act = bookingAction(b);
  return h('article', { class: 'hist' },
    h('div', { class: 'hist__head' }, h('strong', { text: b.bookingNumber }), h('span', { class: 'badge', text: bookingStatusText(b) })),
    h('p', { text: (b.serviceItems ?? []).map((i) => i.name).join(', ') }),
    h('p', { class: 'meta', text: `${fmtDate(b.bookingDate)}, ${b.startTime}` }),
    h('p', { class: 'price', text: rupiah(b.totalAmount) }),
    h('a', { class: act.primary ? 'btn btn--small' : 'btn btn--ghost btn--small',
      href: tenantHref(`/pembayaran/?booking=${encodeURIComponent(b.id)}`), text: act.label }));
}

function orderItem(o) {
  return h('article', { class: 'hist' },
    h('div', { class: 'hist__head' }, h('strong', { text: o.orderNumber }), h('span', { class: 'badge', text: orderStatusText(o) })),
    h('ul', { class: 'meta', style: 'margin:0;padding-left:1.1rem' }, (o.items ?? []).map((i) => h('li', { text: `${i.quantity}× ${i.productName}` }))),
    h('p', { class: 'meta', text: fmtTs(o.createdAt) }),
    h('p', { class: 'price', text: o.totalAmount == null ? `Subtotal ${rupiah(o.subtotal)} · ongkir menyusul` : rupiah(o.totalAmount) }));
}

async function fill(tenant, uid, { id, name, render, empty }) {
  const box = $(id);
  try {
    const items = await load(tenant.id, uid, name);
    if (!items.length) { box.replaceChildren(h('p', { class: 'empty', text: empty })); return; }
    box.replaceChildren(...items.map(render));
    if (items.length === PAGE) box.append(h('p', { class: 'meta', text: `Menampilkan ${PAGE} terbaru.` }));
  } catch (e) {
    console.error(`Gagal memuat ${name}`, e);
    box.replaceChildren(h('p', { class: 'alert', role: 'alert', text: 'Data belum dapat dimuat. Muat ulang halaman.' }));
  } finally {
    box.removeAttribute('aria-busy');
  }
}

async function main() {
  const tenant = await bootPage('Riwayat');
  if (!tenant) return;
  let uid;
  try { uid = (await ensureUser()).uid; }
  catch { $('hist-root').replaceChildren(h('p', { class: 'alert', role: 'alert', text: 'Sesi belum siap. Muat ulang halaman.' })); return; }

  $('hist-root').replaceChildren(h('div', { class: 'history' },
    h('section', { 'aria-labelledby': 'h-book' }, h('h2', { id: 'h-book', text: 'Booking' }),
      h('div', { id: 'bookings', class: 'hist-list', 'aria-busy': 'true' }, h('div', { class: 'skeleton', style: 'height:8rem' }))),
    h('section', { 'aria-labelledby': 'h-ord' }, h('h2', { id: 'h-ord', text: 'Pesanan produk' }),
      h('div', { id: 'orders', class: 'hist-list', 'aria-busy': 'true' }, h('div', { class: 'skeleton', style: 'height:8rem' })))));

  await Promise.all([
    fill(tenant, uid, { id: 'bookings', name: 'bookings', render: bookingItem, empty: 'Belum ada booking di sesi ini.' }),
    fill(tenant, uid, { id: 'orders', name: 'orders', render: orderItem, empty: 'Belum ada pesanan produk. Fitur belanja produk sedang dibangun.' }),
  ]);
}

main();
