import { h } from './dom.js';
import { rupiah } from './format.js';
import { imageUrl } from './media.js';
import { tenantHref } from './tenant.js';
import { priceInfo, stockInfo, slideList, factsFor } from './detail-model.js';
import { addCartItem } from './cart-store.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Perbandingan sebelum/sesudah: input range tak kasatmata menggeser garis pembanding (bisa lewat keyboard & sentuh).
function compareNode(before, after, title) {
  const wrap = h('div', { class: 'cmp' });
  const range = h('input', { class: 'cmp__range', type: 'range', min: '0', max: '100', value: '50',
    'aria-label': `Geser untuk membandingkan sebelum dan sesudah: ${title}` });
  const set = () => wrap.style.setProperty('--pos', `${range.value}%`);
  range.addEventListener('input', set);
  set();
  wrap.append(
    h('img', { class: 'cmp__img', src: imageUrl(after), alt: `${title} — sesudah`, decoding: 'async' }),
    h('img', { class: 'cmp__img cmp__img--before', src: imageUrl(before), alt: `${title} — sebelum`, decoding: 'async' }),
    h('span', { class: 'cmp__tag cmp__tag--l', text: 'Sebelum' }),
    h('span', { class: 'cmp__tag cmp__tag--r', text: 'Sesudah' }),
    h('span', { class: 'cmp__line', 'aria-hidden': 'true' }),
    range);
  return wrap;
}

function slideNode(s, title, i) {
  if (s.type === 'compare') return compareNode(s.before, s.after, title);
  if (s.type === 'none') return h('div', { class: 'lb__placeholder', 'aria-hidden': 'true', text: [...title][0]?.toUpperCase() ?? '' });
  return h('img', { src: imageUrl(s.path), alt: `${title} — foto ${i + 1}`, decoding: 'async' });
}

// Jendela detail untuk produk, layanan, dan hasil rias: tumbuh dari kartu yang diklik, galeri geser, deskripsi.
// kind: 'product' | 'service' | 'portfolio'. cta: { href, label } menggantikan tombol booking bawaan.
export function openDetail({ kind, item, categoryName, originEl, cta }) {
  const isProduct = kind === 'product';
  const isService = kind === 'service';
  const title = ((isProduct || isService) ? item.name : item.title) ?? '';
  const slides = slideList(kind, item);
  if (!slides.length) slides.push({ type: 'none' });
  const multi = slides.length > 1;

  const track = h('div', { class: 'lb__track' }, slides.map((s, i) => h('div', { class: 'lb__slide' }, slideNode(s, title, i))));
  const counter = h('p', { class: 'lb__count', 'aria-live': 'polite' });
  const prev = h('button', { class: 'lb__nav lb__nav--prev', type: 'button', 'aria-label': 'Foto sebelumnya', onclick: () => go(-1) }, '‹');
  const next = h('button', { class: 'lb__nav lb__nav--next', type: 'button', 'aria-label': 'Foto berikutnya', onclick: () => go(1) }, '›');
  const media = h('div', { class: 'lb__media' }, track, multi ? [prev, next, counter] : null);

  const go = (d) => track.scrollBy({ left: d * track.clientWidth, behavior: reduced() ? 'auto' : 'smooth' });
  const sync = () => {
    const i = Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / Math.max(1, track.clientWidth))));
    counter.textContent = `${i + 1} / ${slides.length}`;
    prev.disabled = i <= 0;
    next.disabled = i >= slides.length - 1;
  };
  track.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });

  const price = isProduct ? priceInfo(item) : (isService ? { current: item.price, original: null, saving: 0 } : null);
  const stock = isProduct ? stockInfo(item.stock) : null;
  const facts = factsFor(kind, item);
  const bookable = !isProduct && !(isService && item.bookingEnabled === false);
  const bookHref = cta?.href ?? tenantHref(isService ? `/booking/?service=${encodeURIComponent(item.id)}` : '/booking/');
  const bookLabel = cta?.label ?? (isService ? 'Booking layanan ini' : 'Booking layanan');
  const eyebrow = categoryName ?? (isProduct ? 'Produk kecantikan' : (isService ? 'Layanan' : 'Hasil MUA'));
  const info = h('div', { class: 'lb__info' },
    h('p', { class: 'eyebrow', text: eyebrow }),
    h('h2', { id: 'lb-title', class: 'lb__title', text: title }),
    price && Number.isFinite(price.current) ? h('div', { class: 'lb__price' },
      price.original ? h('s', { text: rupiah(price.original) }) : null,
      h('strong', { text: rupiah(price.current) }),
      price.saving ? h('span', { class: 'badge', text: `Hemat ${rupiah(price.saving)}` }) : null) : null,
    stock ? h('span', { class: `badge${stock.level === 'out' ? ' badge--out' : ''}`, text: stock.label }) : null,
    item.description ? h('p', { class: 'lb__desc', text: item.description }) : null,
    facts.length ? h('dl', { class: 'lb__facts' }, facts.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])) : null,
    isProduct ? h('div', { class: 'lb__actions' },
      h('a', { class: 'btn btn--ghost', href: tenantHref('/keranjang/'), text: 'Lihat keranjang' }),
      h('button', { class: 'btn', type: 'button', text: 'Tambah ke keranjang', disabled: stock.level === 'out', onclick: (e) => {
        try { addCartItem(item); e.currentTarget.textContent = 'Ditambahkan ✓'; e.currentTarget.disabled = true; }
        catch { e.currentTarget.textContent = 'Gagal menambahkan'; }
      } })) : null,
    bookable ? h('div', { class: 'lb__actions' }, h('a', { class: 'btn', href: bookHref, text: bookLabel })) : null);

  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    if (reduced()) { dlg.close(); return; }
    dlg.classList.add('is-closing');
    panel.addEventListener('animationend', (e) => { if (e.target === panel) dlg.close(); });
    setTimeout(() => dlg.close(), 450); // pengaman bila animasi tidak berjalan
  };

  const panel = h('div', { class: 'lb__panel' },
    h('button', { class: 'lb__close', type: 'button', 'aria-label': 'Tutup', onclick: close }, '×'), media, info);
  const dlg = h('dialog', { class: `lightbox${originEl && !reduced() ? ' lb--flip' : ''}`, 'aria-labelledby': 'lb-title' }, panel);

  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener('keydown', (e) => {
    if (!multi || e.target.matches?.('input[type="range"]')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
  });
  dlg.addEventListener('close', () => {
    dlg.remove();
    document.documentElement.classList.remove('lb-open');
    originEl?.classList.remove('is-lit');
  });

  document.documentElement.classList.add('lb-open');
  document.body.append(dlg);
  dlg.showModal();
  requestAnimationFrame(sync);

  if (originEl && !reduced()) { // tumbuh dari posisi kartu
    const o = originEl.getBoundingClientRect();
    const r = panel.getBoundingClientRect();
    const s = Math.max(0.18, Math.min(o.width / r.width, o.height / r.height));
    const dx = (o.left + o.width / 2) - (r.left + r.width / 2);
    const dy = (o.top + o.height / 2) - (r.top + r.height / 2);
    panel.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0 },
      { opacity: 1, offset: 0.35 },
      { transform: 'none', opacity: 1 },
    ], { duration: 420, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }
}
