import { bootPage } from './page.js';
import { h } from './dom.js';
import { rupiah } from './format.js';
import { tenantHref } from './tenant.js';
import { getCart, setCartQuantity, removeCartItem } from './cart-store.js';

const root = document.getElementById('cart-root');
function render() {
  const items = getCart();
  if (!items.length) {
    root.replaceChildren(h('div', { class: 'result' },
      h('p', { class: 'empty', text: 'Keranjang masih kosong.' }),
      h('a', { class: 'btn', href: tenantHref('/#produk'), text: 'Jelajahi produk' })));
    return;
  }
  const subtotal = items.reduce((sum, x) => sum + x.price * x.quantity, 0);
  root.replaceChildren(
    h('div', { class: 'cart-list' }, ...items.map((item) => h('article', { class: 'hist cart-item' },
      item.image ? h('img', { src: item.image, alt: item.name, loading: 'lazy' }) : null,
      h('div', { class: 'cart-item__body' },
        h('strong', { text: item.name }),
        h('p', { class: 'meta', text: rupiah(item.price) }),
        h('label', { class: 'field' }, 'Jumlah',
          h('input', { class: 'input', type: 'number', min: '1', max: '20', value: String(item.quantity),
            onchange: (e) => { setCartQuantity(item.productId, e.currentTarget.value); render(); } })),
        h('button', { class: 'btn btn--ghost btn--small', type: 'button', text: 'Hapus',
          onclick: () => { removeCartItem(item.productId); render(); } })))),
    h('div', { class: 'summary' },
      h('p', { class: 'meta', text: 'Subtotal sementara' }),
      h('strong', { class: 'pay-amount', text: rupiah(subtotal) }),
      h('p', { class: 'meta', text: 'Harga dan stok akan divalidasi ulang saat checkout. Ongkir dihitung terpisah.' }),
      h('a', { class: 'btn', href: tenantHref('/checkout/'), text: 'Lanjut ke checkout' })));
}
await bootPage('Keranjang');
render();
