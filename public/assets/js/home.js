import { db, collection, getDocs, query, where, limit } from './firebase.js';
import { resolveTenant, diag, tenantHref } from './tenant.js';
import { isLocal } from './env.js';
import { applyTheme } from './theme.js';
import { applyBrand } from './brand.js';
import { h } from './dom.js';
import { rupiah, formatDuration } from './format.js';
import { imageUrl } from './media.js';
import { renderHeader, renderFooter } from './layout.js';
import { openDetail } from './lightbox.js';
import { priceInfo, stockInfo, sortShowcase } from './detail-model.js';
import { testimonialSection } from './testimonials.js';

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

async function loadCategoryNames(tenantId, name) {
  try {
    const snap = await getDocs(collection(db, 'tenants', tenantId, name));
    return new Map(snap.docs.map((d) => [d.id, d.data().name]));
  } catch (e) { console.error(e); return new Map(); }
}

const media = (path, alt) => {
  const url = imageUrl(path);
  return h('div', { class: 'card__media' }, url ? h('img', { src: url, alt, loading: 'lazy', decoding: 'async' }) : null);
};

const titleOf = (kind, item) => (kind === 'portfolio' ? item.title : item.name) ?? '';

function showcaseBody(kind, item, title) {
  const more = h('span', { class: 'card__more', 'aria-hidden': 'true', text: 'Lihat detail' });
  if (kind === 'product') {
    const price = priceInfo(item);
    const stock = stockInfo(item.stock);
    return [
      item.brand ? h('p', { class: 'meta', text: item.brand }) : null,
      h('h3', { class: 'card__title', text: title }),
      h('p', { class: 'price' }, price.original ? h('s', { text: rupiah(price.original) }) : null, rupiah(price.current)),
      stock.level === 'out' ? h('span', { class: 'badge badge--out', text: stock.label }) : null,
      more,
    ];
  }
  if (kind === 'service') {
    // Ringkasan layanan ditampilkan di dialog agar kartu tetap fokus pada satu foto utama.
    return [
      h('h3', { class: 'card__title', text: title }),
      h('p', { class: 'meta', text: formatDuration(item.durationMinutes) }),
      h('p', { class: 'price', text: rupiah(item.price) }),
      more,
    ];
  }
  return [
    h('h3', { class: 'card__title', text: title }),
    item.modelName ? h('p', { class: 'meta', text: `Model: ${item.modelName}` }) : null,
    more,
  ];
}

// Kartu yang bisa diklik: membuka jendela detail yang tumbuh dari kartu.
function showcaseCard(kind, item, catNames) {
  const title = titleOf(kind, item);
  const card = h('article', { class: 'card card--showcase reveal' },
    media(item.thumbnailImage ?? item.coverImage, title),
    h('div', { class: 'card__body' }, showcaseBody(kind, item, title)),
    h('button', { class: 'card__hit', type: 'button', 'aria-haspopup': 'dialog', 'aria-label': `Lihat detail: ${title}`, onclick: () => {
      card.classList.add('is-lit');
      openDetail({
        kind, item, categoryName: catNames.get(item.categoryId) ?? null, originEl: card,
        ...(kind === 'portfolio' ? { cta: { href: tenantHref('/booking/'), label: 'Booking layanan' } } : {}),
      });
    } }));
  return card;
}

function renderHero(tenant) {
  $('hero-content').replaceChildren(
    h('div', { class: 'reveal' },
      tenant.tagline ? h('p', { class: 'eyebrow', text: tenant.tagline }) : null,
      h('h1', { text: tenant.brandName }),
      tenant.description ? h('p', { class: 'hero__lead', text: tenant.description }) : null,
      h('div', { class: 'hero__actions' },
        h('a', { class: 'btn', href: tenantHref('/booking/'), text: 'Booking sekarang' }),
        h('a', { class: 'btn btn--ghost', href: '#layanan', text: 'Lihat layanan' }),
        h('a', { class: 'btn btn--ghost', href: '#produk', text: 'Lihat produk' }))),
    tenant.brandImage
      ? h('div', { class: 'hero__art hero__art--image reveal' }, h('img', { src: imageUrl(tenant.brandImage), alt: '', decoding: 'async' }))
      : h('div', { class: 'hero__art reveal', 'aria-hidden': 'true', text: [...tenant.brandName][0]?.toUpperCase() ?? '' }));
}

function hideSection(sectionId) {
  $(sectionId).hidden = true;
  document.querySelector(`.nav a[href$="#${sectionId}"]`)?.remove();
}

// Layanan, produk, dan hasil rias: baris yang bisa digeser + jendela detail.
async function fillShowcase(tenant, { kind, name, catCollection, gridId, sectionId, label, emptyText, hideWhenEmpty, moreHref, moreLabel, wide }) {
  const box = $(gridId);
  try {
    const [raw, cats] = await Promise.all([loadPublished(tenant.id, name, 12), loadCategoryNames(tenant.id, catCollection)]);
    const items = sortShowcase(kind, raw);
    if (!items.length) {
      if (hideWhenEmpty) { hideSection(sectionId); return; }
      box.replaceChildren(h('p', { class: 'empty', text: emptyText }));
      return;
    }
    // Beranda menampilkan kartu dengan satu foto utama. Slider galeri dan deskripsi
    // berada di dialog detail setelah kartu dipilih, bukan sebagai slider luar.
    box.className = 'grid';
    box.replaceChildren(...items.map((it) => showcaseCard(kind, it, cats)));
    if (moreHref) box.append(h('p', { class: 'section-more' }, h('a', { class: 'btn btn--ghost', href: tenantHref(moreHref), text: moreLabel })));
  } catch (e) {
    console.error(`Gagal memuat ${name}`, e);
    box.replaceChildren(h('p', { class: 'empty',
      text: 'Konten ini belum dapat dimuat. Coba muat ulang halaman.' + (isLocal ? ` [dev: ${e?.code ?? e?.message ?? e}]` : '') }));
  } finally { box.removeAttribute('aria-busy'); }
}

// Testimoni klien (bagian muncul hanya bila ada testimoni yang terbit)
async function fillTestimonials(tenant) {
  try {
    const reviews = await loadPublished(tenant.id, 'reviews', 12);
    if (!reviews.length) return;
    const cats = await loadCategoryNames(tenant.id, 'serviceCategories');
    const anchor = $('portfolio').hidden ? $('produk') : $('portfolio');
    anchor.after(testimonialSection({ reviews, catNames: cats }));
  } catch (e) { console.error('Gagal memuat testimoni', e); }
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
  catch (e) {
    console.error(e);
    return fatal('Tidak dapat memuat situs', 'Data belum dapat dimuat. Periksa koneksi lalu muat ulang halaman.');
  }
  if (!tenant) {
    return fatal('Situs tidak ditemukan',
      'Alamat ini belum terhubung ke situs mana pun.' + (isLocal && diag.reason ? ` [dev: ${diag.reason}]` : ''));
  }

  applyTheme(tenant.theme);
  applyBrand(tenant);
  document.title = tenant.tagline ? `${tenant.brandName} — ${tenant.tagline}` : tenant.brandName;
  document.querySelector('meta[name="description"]')?.setAttribute('content', tenant.description || tenant.tagline || '');
  renderHeader(tenant);
  renderHero(tenant);
  renderFooter(tenant);

  await Promise.all([
    fillShowcase(tenant, { kind: 'service', name: 'services', catCollection: 'serviceCategories', gridId: 'layanan-grid',
      sectionId: 'layanan', label: 'Layanan makeup', wide: true, emptyText: 'Belum ada layanan yang dipublikasikan.' }),
    fillShowcase(tenant, { kind: 'product', name: 'products', catCollection: 'productCategories', gridId: 'produk-grid',
      sectionId: 'produk', label: 'Produk kecantikan', emptyText: 'Belum ada produk yang dipublikasikan.' }),
    fillShowcase(tenant, { kind: 'portfolio', name: 'portfolio', catCollection: 'serviceCategories', gridId: 'portfolio-grid',
      sectionId: 'portfolio', label: 'Hasil MUA', hideWhenEmpty: true,
      moreHref: '/galeri/', moreLabel: 'Lihat galeri lengkap' }),
  ]);
  await fillTestimonials(tenant);
  observeReveals();
}

main();
