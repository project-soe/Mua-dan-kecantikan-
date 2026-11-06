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
    const quantity = h('div', { class: 'cart-quantity', 'aria-label': 'Atur jumlah produk' },
      h('button', {
        class: 'cart-quantity__button', type: 'button', text: '−',
        'aria-label': `Kurangi jumlah ${item.name}`,
        disabled: item.quantity <= 1,
        onclick: () => { setCartQuantity(item.productId, item.quantity - 1); render(); },
      }),
      h('span', { class: 'cart-quantity__value', 'aria-live': 'polite', text: String(item.quantity) }),
      h('button', {
        class: 'cart-quantity__button', type: 'button', text: '+',
        'aria-label': `Tambah jumlah ${item.name}`,
        disabled: item.quantity >= 20,
        onclick: () => { setCartQuantity(item.productId, item.quantity + 1); render(); },
      }),
    );

    const body = h('div', { class: 'cart-item__body' },
      h('div', { class: 'cart-item__heading' },
        h('strong', { class: 'cart-item__name', text: item.name }),
        h('button', {
          class: 'cart-item__remove', type: 'button', text: 'Hapus',
          'aria-label': `Hapus ${item.name} dari keranjang`,
          onclick: () => { removeCartItem(item.productId); render(); },
        }),
      ),
      h('p', { class: 'cart-item__price', text: rupiah(item.price) }),
      h('div', { class: 'cart-item__footer' },
        quantity,
        h('strong', { class: 'cart-item__line-total', text: rupiah(item.price * item.quantity) }),
      ),
    );
    return h('article', { class: 'cart-item' },
      item.image ? h('img', { class: 'cart-item__image', src: imageUrl(item.image), alt: item.name, loading: 'lazy' }) : null,
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
