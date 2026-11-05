import { h } from './dom.js';
import { imageUrl } from './media.js';
import { createSlider } from './slider.js';
import { sortReviews, ratingStats, summaryText, stars, ratingLabel, initials } from './review-model.js';

function reviewCard(r, catNames) {
  const photo = imageUrl(r.photo);
  const meta = [catNames.get(r.categoryId), r.eventLabel].filter(Boolean).join(' · ');
  return h('article', { class: 't-card' },
    h('p', { class: 't-stars', role: 'img', 'aria-label': ratingLabel(r.rating), text: stars(r.rating) }),
    h('blockquote', { class: 't-quote' }, h('p', { text: r.quote })),
    h('footer', { class: 't-who' },
      photo
        ? h('img', { class: 't-avatar', src: photo, alt: '', loading: 'lazy', decoding: 'async' })
        : h('span', { class: 't-avatar t-avatar--ph', 'aria-hidden': 'true', text: initials(r.clientName) }),
      h('div', {},
        h('strong', { text: r.clientName }),
        meta ? h('span', { class: 'meta', text: meta }) : null,
        r.source ? h('span', { class: 'meta', text: `via ${r.source}` }) : null)));
}

// Bagian "Kata klien": baris kartu yang bisa digeser + ringkasan penilaian dari data nyata.
export function testimonialSection({ reviews, catNames, title = 'Kata klien', id = 'testimoni' }) {
  const items = sortReviews(reviews);
  const summary = summaryText(ratingStats(items));
  return h('section', { class: 'section t-section', id, 'aria-labelledby': `${id}-title` },
    h('div', { class: 'container' },
      h('div', { class: 'section-head' },
        h('p', { class: 'eyebrow', text: 'Testimoni' }),
        h('h2', { class: 'section-title', id: `${id}-title`, text: title }),
        summary ? h('p', { class: 't-summary', text: summary }) : null),
      createSlider({ label: 'Testimoni klien', items, wide: true, render: (r) => reviewCard(r, catNames) })));
}
