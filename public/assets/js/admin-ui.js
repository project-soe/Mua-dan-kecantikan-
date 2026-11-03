import { h } from './dom.js';
import { ApiError } from './api.js';

let toastTimer;
export function toast(text) {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
  t.textContent = text;
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), 3500);
}

export function apiErrText(e) {
  if (e instanceof ApiError) {
    if (e.code === 'permission-denied') return 'Akses ditolak untuk peran Anda.';
    if (e.code === 'unauthenticated') return 'Sesi berakhir. Muat ulang halaman dan masuk lagi.';
    return e.message;
  }
  return 'Terjadi kesalahan tak terduga.';
}

// Dialog bawaan <dialog> (aksesibel: fokus terkunci, Esc menutup). Mengembalikan objek nilai atau null bila dibatalkan.
// fields: [{ name, label, type: 'text' | 'number' | 'textarea', value?, required? }]
export function askDialog({ title, text = '', fields = [], confirmLabel = 'Lanjut' }) {
  return new Promise((resolve) => {
    let values = null;
    const err = h('p', { class: 'alert', role: 'alert', hidden: true });
    const controls = fields.map((f) => {
      const attrs = { class: 'input', id: `dlg-${f.name}` };
      if (f.type === 'number') Object.assign(attrs, { type: 'number', min: String(f.min ?? 1), step: '1', inputmode: 'numeric' });
      else if (f.type !== 'textarea') attrs.type = f.type === 'password' ? 'password' : 'text';
      const el = h(f.type === 'textarea' ? 'textarea' : 'input', attrs);
      if (f.value !== undefined) el.value = f.value;
      return [f, el];
    });
    const dlg = h('dialog', { class: 'dlg', 'aria-labelledby': 'dlg-title' });
    const form = h('form', { class: 'form', novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      const out = {};
      for (const [f, el] of controls) {
        const v = f.type === 'password' ? el.value : el.value.trim();
        if (f.required && !v) { err.hidden = false; err.textContent = `${f.label} wajib diisi.`; el.focus(); return; }
        out[f.name] = v;
      }
      values = out;
      dlg.close('ok');
    } },
    h('h2', { id: 'dlg-title', class: 'card__title', text: title }),
    text ? h('p', { text }) : null,
    controls.map(([f, el]) => h('div', { class: 'field' }, h('label', { for: `dlg-${f.name}`, text: f.label }), el)),
    err,
    h('div', { class: 'hist__actions' },
      h('button', { class: 'btn', type: 'submit', text: confirmLabel }),
      h('button', { class: 'btn btn--ghost', type: 'button', text: 'Batal', onclick: () => dlg.close('cancel') })));
    dlg.append(form);
    dlg.addEventListener('close', () => { dlg.remove(); resolve(dlg.returnValue === 'ok' ? values : null); });
    document.body.append(dlg);
    dlg.showModal();
    controls[0]?.[1].focus();
  });
}

export function showImage(title, url) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'dlg', 'aria-labelledby': 'img-title' },
      h('h2', { id: 'img-title', class: 'card__title', text: title }),
      h('img', { src: url, alt: title, style: 'max-width:100%;max-height:70vh;margin-block:1rem' }),
      h('button', { class: 'btn btn--ghost', type: 'button', text: 'Tutup', onclick: () => dlg.close() }));
    dlg.addEventListener('close', () => { dlg.remove(); resolve(); });
    document.body.append(dlg);
    dlg.showModal();
  });
}
