import { adminDb, collection, getDocs, query, orderBy, limit } from './admin-firebase.js';
import { adminCall } from './admin-api.js';
import { h } from './dom.js';
import { rupiah } from './format.js';
import { askDialog, toast, apiErrText } from './admin-ui.js';

const STATUS = { pending: 'Menunggu ongkir', awaiting_payment: 'Menunggu pembayaran', payment_verification: 'Verifikasi pembayaran',
  paid: 'Sudah dibayar', processing: 'Diproses', shipped: 'Dikirim', delivered: 'Diterima', completed: 'Selesai', cancelled: 'Dibatalkan' };
export async function mountOrders(root, ctx) {
  const list = h('div', { class: 'hist-list', 'aria-live': 'polite' });
  const reload = h('button', { class: 'btn btn--ghost btn--small', type: 'button', text: 'Muat ulang', onclick: load });
  root.replaceChildren(h('div', { class: 'toolbar' }, reload), list);
  async function quote(order) {
    const r = await askDialog({ title: 'Tetapkan ongkir',
      text: `Pesanan ${order.orderNumber}. Subtotal produk ${rupiah(order.subtotal)}. Masukkan ongkir final.`,
      fields: [{ name: 'shippingCost', label: 'Ongkir (Rp)', type: 'number', value: '0', required: true },
        { name: 'shippingNotes', label: 'Catatan pengiriman (opsional)', type: 'textarea' }],
      confirmLabel: 'Kirim penawaran' });
    if (!r) return;
    const shippingCost = Number(r.shippingCost);
    if (!Number.isSafeInteger(shippingCost) || shippingCost < 0) return toast('Nominal ongkir tidak valid.');
    try {
      const out = await adminCall('setOrderShippingQuote', { tenantId: ctx.tenant.id, orderId: order.id,
        shippingCost, shippingNotes: r.shippingNotes ?? '' });
      toast(`Penawaran dikirim. Total: ${rupiah(out.totalAmount)}`);
      await load();
    } catch (e) { toast(apiErrText(e)); }
  }
  async function load() {
    list.replaceChildren(h('div', { class: 'skeleton', style: 'height:8rem' }));
    try {
      const snap = await getDocs(query(collection(adminDb, 'tenants', ctx.tenant.id, 'orders'), orderBy('createdAt', 'desc'), limit(50)));
      const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.replaceChildren(...(orders.length ? orders.map((o) => h('article', { class: 'hist' },
        h('div', { class: 'hist__head' }, h('strong', { text: o.orderNumber }),
          h('span', { class: 'badge', text: STATUS[o.orderStatus] ?? o.orderStatus })),
        h('p', { text: o.customerName }),
        h('p', { class: 'meta', text: o.customerPhone }),
        h('ul', { class: 'meta', style: 'margin:0;padding-left:1.1rem' },
          (o.items ?? []).map((i) => h('li', { text: `${i.quantity} × ${i.productName}` }))),
        h('p', { class: 'meta', text: `Subtotal: ${rupiah(o.subtotal)}` }),
        o.totalAmount == null ? h('p', { class: 'notice', text: 'Menunggu ongkir dihitung.' })
          : h('p', { class: 'price', text: `Total: ${rupiah(o.totalAmount)} · Ongkir: ${rupiah(o.shippingCost)}` }),
        o.shippingStatus === 'quote_requested' && o.orderStatus === 'pending'
          ? h('button', { class: 'btn', type: 'button', text: 'Tetapkan ongkir', onclick: () => quote(o) }) : null,
        h('details', {}, h('summary', { text: 'Alamat pengiriman' }),
          h('p', { class: 'meta', text: [o.shippingAddressSnapshot?.street, o.shippingAddressSnapshot?.city,
            o.shippingAddressSnapshot?.province, o.shippingAddressSnapshot?.postalCode].filter(Boolean).join(', ') })))) : [h('p', { class: 'empty', text: 'Belum ada pesanan produk.' })]));
    } catch (e) {
      console.error(e); list.replaceChildren(h('p', { class: 'alert', role: 'alert', text: 'Pesanan belum dapat dimuat.' }));
    }
  }
  await load();
}
