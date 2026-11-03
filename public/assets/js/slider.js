import { h } from './dom.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Baris kartu yang bisa digeser (sentuh/scroll) dengan tombol sebelumnya/berikutnya.
export function createSlider({ label, items, render }) {
  const track = h('div', { class: 'slider__track', tabindex: '0', role: 'region', 'aria-label': label }, items.map(render));
  const prev = h('button', { class: 'slider__btn', type: 'button', 'aria-label': `${label}: geser ke sebelumnya`, onclick: () => go(-1) }, '‹');
  const next = h('button', { class: 'slider__btn', type: 'button', 'aria-label': `${label}: geser ke berikutnya`, onclick: () => go(1) }, '›');
  const bar = h('div', { class: 'slider__bar' }, prev, next);

  const go = (dir) => track.scrollBy({ left: dir * track.clientWidth * 0.85, behavior: reduced() ? 'auto' : 'smooth' });
  const update = () => {
    const max = track.scrollWidth - track.clientWidth;
    bar.hidden = max <= 2; // semua kartu muat: tombol tidak diperlukan
    prev.disabled = track.scrollLeft <= 2;
    next.disabled = track.scrollLeft >= max - 2;
  };
  let raf = 0;
  track.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); }, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(update).observe(track);
  requestAnimationFrame(update);

  return h('div', { class: 'slider' }, bar, track);
}
