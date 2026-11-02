import { h } from './dom.js';
import { DAY_ORDER, DAY_LABELS, formatWindows } from './format.js';
import { tenantHref } from './tenant.js';
import { imageUrl } from './media.js';

const LINKS = [
  ['/#layanan', 'Layanan'], ['/#produk', 'Produk'], ['/#portfolio', 'Portfolio'],
  ['/booking/', 'Booking'], ['/riwayat/', 'Riwayat'], ['/#jam', 'Jam Operasional'],
];

export function renderHeader(tenant) {
  const root = document.getElementById('site-header');
  const logo = imageUrl(tenant.logoImage)
    ?? (typeof tenant.logoUrl === 'string' && tenant.logoUrl.startsWith('https://') ? tenant.logoUrl : null);
  const brand = h('a', { class: 'brand', href: tenantHref('/'), 'aria-label': `${tenant.brandName} — beranda` },
    logo ? h('img', { src: logo, alt: '' }) : null,
    h('span', { class: logo ? 'brand__text brand__text--beside' : 'brand__text', text: tenant.brandName }));

  const nav = h('nav', { class: 'nav', id: 'site-nav', 'aria-label': 'Navigasi utama' },
    LINKS.map(([href, label]) => h('a', { href: tenantHref(href), onclick: () => close() }, label)));
  const toggle = h('button', { class: 'nav-toggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'site-nav',
    onclick: () => (nav.classList.contains('is-open') ? close() : open()) }, 'Menu');
  function open() { nav.classList.add('is-open'); toggle.setAttribute('aria-expanded', 'true'); toggle.textContent = 'Tutup'; }
  function close() { nav.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); toggle.textContent = 'Menu'; }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  root.replaceChildren(h('div', { class: 'container site-header__inner' }, brand, toggle, nav));
  return nav;
}

const hoursList = (weekly) => h('ul', { class: 'hours' }, DAY_ORDER.map((d) =>
  h('li', {}, h('span', { text: DAY_LABELS[d] }), h('span', { text: formatWindows(weekly[d]) }))));

export function renderFooter(tenant) {
  const mua = tenant.operatingHours?.weekly;
  const store = tenant.storeHours?.weekly;
  const blocks = [];
  if (mua) blocks.push(h('div', { id: 'jam' }, h('h3', { text: 'Jam layanan MUA' }), hoursList(mua)));
  if (store) blocks.push(h('div', {}, h('h3', { text: 'Jam toko produk' }), hoursList(store)));
  if (!blocks.length) blocks.push(h('div', { id: 'jam' }, h('h3', { text: 'Jam operasional' }), h('p', { class: 'meta', text: 'Jam operasional belum diatur.' })));
  document.getElementById('site-footer').replaceChildren(
    h('div', { class: 'site-footer' }, h('div', { class: 'container' },
      h('div', { class: 'site-footer__grid' },
        h('div', {}, h('h2', { text: tenant.brandName }),
          tenant.tagline ? h('p', { class: 'meta', text: tenant.tagline, style: 'color:inherit;opacity:.8;margin-top:.5rem' }) : null),
        blocks),
      h('p', { class: 'copyright', text: `© ${new Date().getFullYear()} ${tenant.brandName}` }))));
}
