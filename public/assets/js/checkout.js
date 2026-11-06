import { bootPage } from './page.js';
import { h } from './dom.js';
import { rupiah } from './format.js';
import { tenantHref } from './tenant.js';
import { getCart, clearCart } from './cart-store.js';
import { call, ApiError } from './api.js';
import { ensureUser } from './auth.js';

const root = document.getElementById('checkout-root');
const money = (amount) => rupiah(amount);

function showError(message) {
  if (!root) return;
  root.replaceChildren(
    h('div', { class: 'result' },
      h('p', { class: 'alert', role: 'alert', text: message }),
      h('button', { class: 'btn btn--ghost', type: 'button', text: 'Muat ulang halaman', onclick: () => location.reload() }),
    ),
  );
}

async function main() {
  if (!root) throw new Error('Elemen #checkout-root tidak ditemukan');
  const tenant = await bootPage('Checkout');
  if (!tenant) return;

  const items = getCart();
  if (!items.length) {
    root.replaceChildren(
      h('p', { class: 'notice', text: 'Keranjang kosong. Tambahkan produk sebelum checkout.' }),
      h('a', { class: 'btn', href: tenantHref('/#produk'), text: 'Pilih produk' }),
    );
    return;
  }

  const summary = h('div', { class: 'summary' },
    ...items.map((item) => h('p', { text: `${item.quantity} × ${item.name}` })),
    h('strong', { class: 'pay-amount', text: money(items.reduce((sum, item) => sum + item.price * item.quantity, 0)) }),
    h('p', { class: 'meta', text: 'Subtotal sementara · ongkir akan dikonfirmasi admin setelah pesanan dibuat.' }),
  );

  const fields = [
    ['recipientName', 'Nama penerima', 'text', 'Nama lengkap'],
    ['phone', 'Nomor WhatsApp', 'tel', '08xxxxxxxxxx'],
    ['street', 'Alamat lengkap', 'text', 'Nama jalan, nomor rumah, RT/RW, kelurahan'],
    ['city', 'Kota/Kabupaten', 'text', 'Kota atau kabupaten'],
    ['province', 'Provinsi', 'text', 'Provinsi'],
    ['postalCode', 'Kode pos', 'text', '5 digit kode pos'],
  ];

  const controls = Object.fromEntries(fields.map(([name, label, type, placeholder]) => [name,
    h('input', {
      class: 'input', name, type, placeholder, required: true,
      maxlength: name === 'postalCode' ? '5' : '200',
      inputmode: name === 'phone' || name === 'postalCode' ? 'numeric' : undefined,
    }),
  ]));

  const notes = h('textarea', {
    class: 'input', name: 'customerNotes', rows: '3', maxlength: '500',
    placeholder: 'Catatan untuk penjual (opsional)',
  });
  const error = h('div', { 'aria-live': 'polite' });
  const submit = h('button', { class: 'btn', type: 'submit', text: 'Buat pesanan' });
  const idempotencyKey = crypto.randomUUID();

  const form = h('form', { class: 'form' },
    h('fieldset', {},
      h('legend', { text: 'Data penerima' }),
      ...fields.map(([name, label]) => h('div', { class: 'field' },
        h('label', { for: name, text: label }),
        Object.assign(controls[name], { id: name }),
      )),
    ),
    h('fieldset', {},
      h('legend', { text: 'Catatan' }),
      h('div', { class: 'field' },
        h('label', { for: 'customerNotes', text: 'Catatan pesanan' }),
        Object.assign(notes, { id: 'customerNotes' }),
      ),
    ),
    summary, error, submit,
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    submit.textContent = 'Membuat pesanan…';
    error.replaceChildren();

    try {
      await ensureUser();
      const data = Object.fromEntries(fields.map(([name]) => [name, controls[name].value.trim()]));
      const result = await call('createOrder', {
        tenantId: tenant.id,
        idempotencyKey,
        items: items.map(({ productId, quantity }) => ({ productId, quantity })),
        shippingAddress: data,
        shippingMethod: 'manual_quote',
        customerNotes: notes.value.trim(),
      });
      clearCart();
      root.replaceChildren(
        h('div', { class: 'result' },
          h('p', { class: 'eyebrow', text: 'Pesanan dibuat' }),
          h('h2', { class: 'section-title', text: result.orderNumber }),
          h('p', { class: 'notice', text: 'Pesanan diterima. Admin akan menghitung ongkir dan mengirim total akhir sebelum pembayaran.' }),
          h('p', { text: `Subtotal: ${money(result.subtotal)}` }),
          h('p', { class: 'meta', text: 'Simpan nomor pesanan ini untuk memantau status di halaman Riwayat.' }),
          h('a', { class: 'btn', href: tenantHref('/riwayat/'), text: 'Lihat riwayat pesanan' }),
        ),
      );
    } catch (error) {
      error.replaceChildren(h('p', {
        class: 'alert', role: 'alert',
        text: error instanceof ApiError ? error.message : 'Pesanan belum dapat dibuat. Periksa data dan coba lagi.',
      }));
      submit.disabled = false;
      submit.textContent = 'Coba buat pesanan lagi';
    }
  });

  root.replaceChildren(form);
}

main().catch((error) => {
  console.error('Gagal memuat checkout:', error);
  showError('Checkout belum dapat dimuat. Muat ulang halaman. Jika masalah berlanjut, periksa koneksi ke Firebase Emulator.');
});
