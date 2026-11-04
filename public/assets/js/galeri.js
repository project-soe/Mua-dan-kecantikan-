import { db, collection, getDocs, query, where, limit } from './firebase.js';
import { bootPage } from './page.js';
import { h } from './dom.js';
import { imageUrl } from './media.js';
import { tenantHref } from './tenant.js';
import { openDetail } from './lightbox.js';
import { sortShowcase } from './detail-model.js';
import { categoryChips, filterItems, featureIds, ctaFor, galleryStats } from './gallery-model.js';

const PAGE = 18;
const $ = (id) => document.getElementById(id);

async function loadPublished(tenantId, name, max) {
  const q = query(collection(db, 'tenants', tenantId, name), where('published', '==', true), limit(max));
  return (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function loadCategories(tenantId) {
  const snap = await getDocs(collection(db, 'tenants', tenantId, 'serviceCategories'));
  return snap.docs.map((d) => ({ id: d.id, name: d.data().name, sortOrder: d.data().sortOrder ?? 0 }))
    .sort((a, b) => a.sortOrder - b.sortOrder || String(a.name).localeCompare(String(b.name), 'id'));
}

const bookingButtons = () => h('div', { class: 'g-actions' },
  h('a', { class: 'btn', href: tenantHref('/booking/'), text: 'Booking sekarang' }),
  h('a', { class: 'btn btn--ghost', href: tenantHref('/#layanan'), text: 'Lihat layanan' }));

// Satu foto: tombol yang membuka jendela detail (sebelum/sesudah, deskripsi, ajakan booking).
function tile(item, i, isFeature, catName, services) {
  const title = item.title ?? '';
  const url = imageUrl(isFeature ? (item.coverImage ?? item.thumbnailImage) : (item.thumbnailImage ?? item.coverImage));
  const btn = h('button', {
    class: `g-item${isFeature ? ' g-item--feature' : ''}`, type: 'button', 'aria-haspopup': 'dialog',
    'aria-label': `Lihat detail: ${title}`, style: `--i:${Math.min(i, 12)}`,
    onclick: () => {
      btn.classList.add('is-lit');
      const cta = ctaFor(item, services);
      openDetail({ kind: 'portfolio', item, categoryName: catName, originEl: btn, cta: { href: tenantHref(cta.path), label: cta.label } });
    },
  },
  url ? h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' })
    : h('span', { class: 'g-item__ph', 'aria-hidden': 'true', text: [...title][0]?.toUpperCase() ?? '' }),
  item.beforeImage && item.afterImage ? h('span', { class: 'g-item__tag', text: 'Sebelum · Sesudah' }) : null,
  h('span', { class: 'g-item__cap' },
    h('span', { class: 'g-item__title', text: title }),
    catName ? h('span', { class: 'g-item__cat', text: catName }) : null));
  return btn;
}

function emptyState() {
  return h('section', { class: 'section' }, h('div', { class: 'container g-empty' },
    h('p', { class: 'eyebrow', text: 'Galeri' }),
    h('h1', { class: 'section-title', text: 'Galeri sedang disiapkan' }),
    h('p', { class: 'g-lead', text: 'Foto hasil rias akan segera tampil di sini. Sementara itu, Anda bisa melihat layanan dan jadwal yang tersedia.' }),
    bookingButtons()));
}

async function main() {
  const tenant = await bootPage('Galeri');
  if (!tenant) return;
  document.querySelector('meta[name="description"]')
    ?.setAttribute('content', `Galeri hasil rias ${tenant.brandName}: pengantin dan berbagai acara.`);
  const root = $('g-root');

  let items; let cats; let services;
  try {
    [items, cats, services] = await Promise.all([
      loadPublished(tenant.id, 'portfolio', 200), loadCategories(tenant.id), loadPublished(tenant.id, 'services', 50),
    ]);
  } catch (e) {
    console.error(e);
    root.replaceChildren(h('div', { class: 'container section' }, h('p', { class: 'alert', role: 'alert', text: 'Galeri belum dapat dimuat. Muat ulang halaman.' })));
    return;
  }
  items = sortShowcase('portfolio', items);
  if (!items.length) { root.replaceChildren(emptyState()); return; }

  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const chips = categoryChips(items, cats);
  const stats = galleryStats(items, chips);
  const hash = decodeURIComponent(location.hash.slice(1));
  const S = { filter: chips.some((c) => c.id === hash) ? hash : 'all', shown: PAGE, list: [], feats: new Set() };

  const grid = h('div', { class: 'g-grid' });
  const count = h('p', { class: 'meta g-count', 'aria-live': 'polite' });
  const moreBtn = h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { const from = S.shown; S.shown += PAGE; addTiles(from); } });
  const more = h('div', { class: 'g-more' }, moreBtn);
  const chipBtns = new Map();

  function addTiles(from) {
    const slice = S.list.slice(from, S.shown);
    grid.append(...slice.map((it, i) => tile(it, i, S.feats.has(it.id), catName.get(it.categoryId) ?? null, services)));
    const left = S.list.length - Math.min(S.shown, S.list.length);
    more.hidden = left <= 0;
    moreBtn.textContent = `Tampilkan lebih banyak (${left} lagi)`;
  }

  function render() {
    S.list = filterItems(items, S.filter, cats);
    S.feats = featureIds(S.list);
    grid.replaceChildren();
    count.textContent = `${S.list.length} hasil`;
    addTiles(0);
    for (const [id, b] of chipBtns) b.setAttribute('aria-pressed', String(id === S.filter));
  }

  const filterBar = h('div', { class: 'g-filters' }, h('div', { class: 'container' },
    h('div', { class: 'g-chips', role: 'group', 'aria-label': 'Filter kategori acara' }, chips.map((c) => {
      const b = h('button', { class: 'g-chip', type: 'button', 'aria-pressed': 'false', onclick: () => {
        S.filter = c.id;
        S.shown = PAGE;
        history.replaceState(null, '', c.id === 'all' ? location.pathname + location.search : `#${encodeURIComponent(c.id)}`);
        render();
      } }, c.label, h('span', { class: 'g-chip__n', text: String(c.count) }));
      chipBtns.set(c.id, b);
      return b;
    }))));

  const intro = h('section', { class: 'g-intro' }, h('div', { class: 'container g-intro__grid' },
    h('div', {},
      h('p', { class: 'eyebrow', text: 'Galeri' }),
      h('h1', { text: 'Hasil rias' }),
      h('p', { class: 'g-lead', text: 'Hasil rias pengantin dan berbagai acara. Pilih kategori untuk melihat karya yang sesuai, lalu ketuk foto untuk melihat detailnya.' }),
      bookingButtons()),
    h('ul', { class: 'g-stats' },
      h('li', {}, h('strong', { text: String(stats.results) }), h('span', { text: 'hasil rias' })),
      stats.categories ? h('li', {}, h('strong', { text: String(stats.categories) }), h('span', { text: 'jenis acara' })) : null)));

  const cta = h('section', { class: 'g-cta' }, h('div', { class: 'container g-cta__inner' },
    h('h2', { text: 'Ingin tampil seperti ini di hari spesial Anda?' }),
    h('p', { text: 'Pilih layanan dan jadwal yang tersedia, lalu booking langsung dari situs ini.' }),
    bookingButtons()));

  root.replaceChildren(intro, filterBar,
    h('section', { class: 'section g-body' }, h('div', { class: 'container' }, count, grid, more)), cta);
  render();
}

main();
