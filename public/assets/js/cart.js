import { bootPage } from './page.js';
import { h } from './dom.js';
import { rupiah } from './format.js';
import { tenantHref } from './tenant.js';
import { getCart, setCartQuantity, removeCartItem } from './cart-store.js';
import { imageUrl } from './media.js';

const root = document.getElementById('cart-root');

function showError(message) {
  if (!root) return;
  root.replaceChildren(
    h('div', { class: 'result' },
      h('p', { class: 'alert', role: 'alert', text: message }),
      h('button', { class: 'btn btn--ghost', type: 'button', text: 'Muat ulang halaman', onclick: () => location.reload() }),
    ),
  );
}

function render() {
  if (!root) throw new Error('Elemen #cart-root tidak ditemukan');
  const items = getCart();

  if (!items.length) {
    root.replaceChildren(
      h('div', { class: 'result' },
        h('p', { class: 'empty', text: 'Keranjang masih kosong.' }),
        h('a', { class: 'btn', href: tenantHref('/#produk'), text: 'Jelajahi produk' }),
      ),
    );
    return;
  }

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const rows = items.map((item) => {
    const body = h('div', { class: 'cart-item__body' },
      h('strong', { text: item.name }),
      h('p', { class: 'meta', text: rupiah(item.price) }),
      h('label', { class: 'field' },
        'Jumlah',
        h('input', {
          class: 'input', type: 'number', min: '1', max: '20',
          value: String(item.quantity), inputmode: 'numeric',
          onchange: (event) => {
            setCartQuantity(item.productId, event.currentTarget.value);
            render();
          },
        }),
      ),
      h('button', {
        class: 'btn btn--ghost btn--small', type: 'button', text: 'Hapus',
        onclick: () => { removeCartItem(item.productId); render(); },
      }),
    );
    return h('article', { class: 'hist cart-item' },
      item.image ? h('img', { src: imageUrl(item.image), alt: item.name, loading: 'lazy' }) : null,
      body,
    );
  });

  root.replaceChildren(
    h('div', { class: 'cart-list' }, ...rows),
    h('div', { class: 'summary' },
      h('p', { class: 'meta', text: 'Subtotal sementara' }),
      h('strong', { class: 'pay-amount', text: rupiah(subtotal) }),
      h('p', { class: 'meta', text: 'Harga dan stok akan divalidasi ulang saat checkout. Ongkir dihitung terpisah.' }),
      h('a', { class: 'btn', href: tenantHref('/checkout/'), text: 'Lanjut ke checkout' }),
    ),
  );
}

async function main() {
  if (!root) throw new Error('Elemen #cart-root tidak ditemukan');
  const tenant = await bootPage('Keranjang');
  if (!tenant) return;
  render();
}

main().catch((error) => {
  console.error('Gagal memuat keranjang:', error);
  showError('Keranjang belum dapat dimuat. Muat ulang halaman. Jika masalah berlanjut, periksa koneksi ke Firebase Emulator.');
});
