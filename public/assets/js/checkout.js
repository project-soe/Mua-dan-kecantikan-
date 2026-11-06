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

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const summary = h('aside', { class: 'checkout-summary' },
    h('p', { class: 'eyebrow', text: 'Ringkasan belanja' }),
    h('h2', { class: 'checkout-summary__title', text: 'Pesanan Anda' }),
    h('div', { class: 'checkout-summary__items' },
      ...items.map((item) => h('div', { class: 'checkout-summary__item' },
        h('span', { text: `${item.quantity} × ${item.name}` }),
        h('strong', { text: money(item.price * item.quantity) }),
      )),
    ),
    h('div', { class: 'checkout-summary__total' },
      h('span', { text: 'Subtotal produk' }),
      h('strong', { text: money(subtotal) }),
    ),
    h('p', { class: 'checkout-summary__note', text: 'Ongkos kirim belum termasuk. Admin akan menghitung ongkir berdasarkan alamat tujuan.' }),
    h('div', { class: 'checkout-payment-note' },
      h('span', { class: 'checkout-payment-note__icon', 'aria-hidden': 'true', text: '✦' }),
      h('div', {},
        h('strong', { text: 'Pembayaran setelah ongkir disetujui' }),
        h('p', { text: 'Pilih transfer bank, e-wallet, atau QRIS setelah admin mengirim ongkir dan Anda menyetujui total akhir.' }),
      ),
    ),
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
  const submit = h('button', { class: 'btn checkout-submit', type: 'submit', text: 'Konfirmasi pesanan' });
  const idempotencyKey = crypto.randomUUID();

  const form = h('form', { class: 'form checkout-form' },
    h('div', { class: 'checkout-progress', 'aria-label': 'Tahapan pemesanan' },
      h('div', { class: 'checkout-progress__step is-active' }, h('span', { text: '01' }), h('strong', { text: 'Data & alamat' })),
      h('div', { class: 'checkout-progress__line' }),
      h('div', { class: 'checkout-progress__step' }, h('span', { text: '02' }), h('strong', { text: 'Konfirmasi ongkir' })),
      h('div', { class: 'checkout-progress__line' }),
      h('div', { class: 'checkout-progress__step' }, h('span', { text: '03' }), h('strong', { text: 'Pembayaran' })),
    ),
    h('fieldset', { class: 'checkout-fieldset' },
      h('legend', { text: 'Informasi penerima' }),
      ...fields.map(([name, label]) => h('div', { class: 'field' },
        h('label', { for: name, text: label }),
        Object.assign(controls[name], { id: name }),
      )),
    ),
    h('fieldset', { class: 'checkout-fieldset' },
      h('legend', { text: 'Catatan tambahan' }),
      h('div', { class: 'field' },
        h('label', { for: 'customerNotes', text: 'Catatan pesanan' }),
        Object.assign(notes, { id: 'customerNotes' }),
      ),
    ),
    h('div', { class: 'checkout-form__footer' },
      h('p', { class: 'meta', text: 'Dengan melanjutkan, Anda mengirim pesanan untuk dikonfirmasi. Belum ada pembayaran yang ditagihkan pada tahap ini.' }),
      error,
      submit,
    ),
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
    } catch (cause) {
      error.replaceChildren(h('p', {
        class: 'alert', role: 'alert',
        text: cause instanceof ApiError ? cause.message : 'Pesanan belum dapat dibuat. Periksa data dan coba lagi.',
      }));
      submit.disabled = false;
      submit.textContent = 'Coba buat pesanan lagi';
    }
  });

  root.replaceChildren(h('div', { class: 'checkout-layout' }, h('div', { class: 'checkout-main' }, form), summary));
}

main().catch((error) => {
  console.error('Gagal memuat checkout:', error);
  showError('Checkout belum dapat dimuat. Muat ulang halaman. Jika masalah berlanjut, periksa koneksi ke Firebase Emulator.');
});
