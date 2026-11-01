import { db, collection, getDocs, query, where, limit } from './firebase.js';
import { resolveTenant } from './tenant.js';
import { applyTheme } from './theme.js';
import { h } from './dom.js';
import { rupiah, formatDuration } from './format.js';
import { imageUrl } from './media.js';
import { renderHeader, renderFooter } from './layout.js';

const $ = (id) => document.getElementById(id);

function fatal(title, text) {
  document.title = title;
  $('site-header').replaceChildren();
  $('site-footer').replaceChildren();
  $('main').replaceChildren(h('section', { class: 'section' },
    h('div', { class: 'container' }, h('h1', { class: 'section-title', text: title }), h('p', { class: 'empty', text }))));
}

async function loadPublished(tenantId, name, max) {
  const q = query(collection(db, 'tenants', tenantId, name), where('published', '==', true), limit(max));
  return (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
}

const media = (path, alt, wide = false) => {
  const url = imageUrl(path);
  return h('div', { class: `card__media${wide ? ' card__media--wide' : ''}` },
    url ? h('img', { src: url, alt, loading: 'lazy', decoding: 'async' }) : null);
};

function serviceCard(s) {
  return h('article', { class: 'card reveal' }, media(s.coverImage, s.name, true),
    h('div', { class: 'card__body' },
      h('h3', { class: 'card__title', text: s.name }),
      s.description ? h('p', { class: 'card__text', text: s.description }) : null,
      h('p', { class: 'meta', text: formatDuration(s.durationMinutes) }),
      h('p', { class: 'price', text: rupiah(s.price) })));
}

function productCard(p) {
  const promo = typeof p.discountPrice === 'number' && p.discountPrice < p.price;
  return h('article', { class: 'card reveal' }, media(p.thumbnailImage ?? p.coverImage, p.name),
    h('div', { class: 'card__body' },
      p.brand ? h('p', { class: 'meta', text: p.brand }) : null,
      h('h3', { class: 'card__title', text: p.name }),
      h('p', { class: 'price' }, promo ? h('s', { text: rupiah(p.price) }) : null, rupiah(promo ? p.discountPrice : p.price)),
      (p.stock ?? 0) <= 0 ? h('span', { class: 'badge', text: 'Stok habis' }) : null));
}

function portfolioCard(p) {
  return h('article', { class: 'card reveal' }, media(p.thumbnailImage ?? p.coverImage, p.title),
    h('div', { class: 'card__body' }, h('h3', { class: 'card__title', text: p.title })));
}

function renderHero(tenant) {
  $('hero-content').replaceChildren(
    h('div', { class: 'reveal' },
      tenant.tagline ? h('p', { class: 'eyebrow', text: tenant.tagline }) : null,
      h('h1', { text: tenant.brandName }),
      tenant.description ? h('p', { class: 'hero__lead', text: tenant.description }) : null,
      h('div', { class: 'hero__actions' },
        h('a', { class: 'btn', href: '#layanan', text: 'Lihat layanan' }),
        h('a', { class: 'btn btn--ghost', href: '#produk', text: 'Lihat produk' }))),
    h('div', { class: 'hero__art reveal', 'aria-hidden': 'true', text: [...tenant.brandName][0]?.toUpperCase() ?? '' }));
}

async function fillSection(tenant, { name, gridId, sectionId, max, render, sort, emptyText, hideWhenEmpty }) {
  const grid = $(gridId);
  try {
    let items = await loadPublished(tenant.id, name, max);
    if (sort) items = items.sort(sort);
    if (!items.length) {
      if (hideWhenEmpty) { $(sectionId).hidden = true; document.querySelector(`.nav a[href="#${sectionId}"]`)?.remove(); return; }
      grid.replaceChildren(h('p', { class: 'empty', text: emptyText }));
    } else {
      grid.replaceChildren(...items.map(render));
    }
  } catch (e) {
    console.error(`Gagal memuat ${name}`, e);
    grid.replaceChildren(h('p', { class: 'empty', text: 'Konten ini belum dapat dimuat. Coba muat ulang halaman.' }));
  } finally {
    grid.removeAttribute('aria-busy');
  }
}

function observeReveals() {
  const els = document.querySelectorAll('.reveal:not(.is-visible)');
  if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-visible')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
  }, { rootMargin: '0px 0px -8% 0px' });
  els.forEach((e) => io.observe(e));
}

async function main() {
  let tenant;
  try { tenant = await resolveTenant(); }
  catch (e) { console.error(e); return fatal('Tidak dapat memuat situs', 'Data belum dapat dimuat. Periksa koneksi lalu muat ulang halaman.'); }
  if (!tenant) return fatal('Situs tidak ditemukan', 'Alamat ini belum terhubung ke situs mana pun.');

  applyTheme(tenant.theme);
  document.title = tenant.tagline ? `${tenant.brandName} — ${tenant.tagline}` : tenant.brandName;
  document.querySelector('meta[name="description"]')?.setAttribute('content', tenant.description || tenant.tagline || '');
  renderHeader(tenant);
  renderHero(tenant);
  renderFooter(tenant);

  await Promise.all([
    fillSection(tenant, { name: 'services', gridId: 'layanan-grid', sectionId: 'layanan', max: 6, render: serviceCard, emptyText: 'Belum ada layanan yang dipublikasikan.' }),
    fillSection(tenant, { name: 'products', gridId: 'produk-grid', sectionId: 'produk', max: 8, render: productCard,
      sort: (a, b) => Number((b.stock ?? 0) > 0) - Number((a.stock ?? 0) > 0), emptyText: 'Belum ada produk yang dipublikasikan.' }),
    fillSection(tenant, { name: 'portfolio', gridId: 'portfolio-grid', sectionId: 'portfolio', max: 6, render: portfolioCard,
      sort: (a, b) => Number(b.featured === true) - Number(a.featured === true), hideWhenEmpty: true }),
  ]);
  observeReveals();
}

main();
