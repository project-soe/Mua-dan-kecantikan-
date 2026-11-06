import { bootPage } from './page.js';
import { h } from './dom.js';
import { rupiah } from './format.js';
import { tenantHref } from './tenant.js';
import { getCart, clearCart } from './cart-store.js';
import { call, ApiError } from './api.js';
import { ensureUser } from './auth.js';

const root = document.getElementById('checkout-root');
const tenant = await bootPage('Checkout');
const items = getCart();
const money = (n) => rupiah(n);
if (!tenant) throw new Error('Tenant tidak tersedia');
if (!items.length) {
  root.replaceChildren(h('p', { class: 'notice', text: 'Keranjang kosong. Tambahkan produk sebelum checkout.' }),
    h('a', { class: 'btn', href: tenantHref('/#produk'), text: 'Pilih produk' }));
} else {
  const summary = h('div', { class: 'summary' },
    ...items.map((x) => h('p', { text: `${x.quantity} × ${x.name}` })),
    h('strong', { class: 'pay-amount', text: money(items.reduce((s, x) => s + x.price * x.quantity, 0)) }),
    h('p', { class: 'meta', text: 'Subtotal sementara · ongkir akan dikonfirmasi admin setelah pesanan dibuat.' }));
  const fields = [
    ['recipientName', 'Nama penerima', 'text', 'Nama lengkap'],
    ['phone', 'Nomor WhatsApp', 'tel', '08xxxxxxxxxx'],
    ['street', 'Alamat lengkap', 'text', 'Nama jalan, nomor rumah, RT/RW, kelurahan'],
    ['city', 'Kota/Kabupaten', 'text', 'Kota atau kabupaten'],
    ['province', 'Provinsi', 'text', 'Provinsi'],
    ['postalCode', 'Kode pos', 'text', '5 digit kode pos'],
  ];
  const controls = Object.fromEntries(fields.map(([name, label, type, placeholder]) => [name,
    h('input', { class: 'input', name, type, placeholder, required: true, maxlength: name === 'postalCode' ? '5' : '200',
      inputmode: name === 'phone' || name === 'postalCode' ? 'numeric' : undefined })]));
  const notes = h('textarea', { class: 'input', name: 'customerNotes', rows: '3', maxlength: '500', placeholder: 'Catatan untuk penjual (opsional)' });
  const error = h('div', { 'aria-live': 'polite' });
  const submit = h('button', { class: 'btn', type: 'submit', text: 'Buat pesanan' });
  const idempotencyKey = crypto.randomUUID();
  const form = h('form', { class: 'form' },
    h('fieldset', {}, h('legend', { text: 'Data penerima' }),
      ...fields.map(([name, label]) => h('div', { class: 'field' }, h('label', { for: name, text: label }),
        Object.assign(controls[name], { id: name })))),
    h('fieldset', {}, h('legend', { text: 'Catatan' }), h('div', { class: 'field' }, h('label', { for: 'customerNotes', text: 'Catatan pesanan' }), Object.assign(notes, { id: 'customerNotes' }))),
    summary, error, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true; submit.textContent = 'Membuat pesanan…'; error.replaceChildren();
    try {
      await ensureUser();
      const data = Object.fromEntries(fields.map(([name]) => [name, controls[name].value.trim()]));
      const result = await call('createOrder', {
        tenantId: tenant.id, idempotencyKey,
        items: items.map(({ productId, quantity }) => ({ productId, quantity })),
        shippingAddress: data, shippingMethod: 'manual_quote',
        customerNotes: notes.value.trim(),
      });
      clearCart();
      root.replaceChildren(h('div', { class: 'result' },
        h('p', { class: 'eyebrow', text: 'Pesanan dibuat' }),
        h('h2', { class: 'section-title', text: result.orderNumber }),
        h('p', { class: 'notice', text: 'Pesanan diterima. Admin akan menghitung ongkir dan mengirim total akhir sebelum pembayaran.' }),
        h('p', { text: `Subtotal: ${money(result.subtotal)}` }),
        h('p', { class: 'meta', text: 'Simpan nomor pesanan ini untuk memantau status di halaman Riwayat.' }),
        h('a', { class: 'btn', href: tenantHref('/riwayat/'), text: 'Lihat riwayat pesanan' })));
    } catch (e) {
      error.replaceChildren(h('p', { class: 'alert', role: 'alert',
        text: e instanceof ApiError ? e.message : 'Pesanan belum dapat dibuat. Periksa data dan coba lagi.' }));
      submit.disabled = false; submit.textContent = 'Coba buat pesanan lagi';
    }
  });
  root.replaceChildren(form);
}
