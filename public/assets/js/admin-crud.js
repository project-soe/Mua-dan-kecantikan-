import { adminDb, collection, doc, getDoc, getDocs, query, orderBy, limit } from './admin-firebase.js';
import { adminCall } from './admin-api.js';
import { h } from './dom.js';
import { imageUrl } from './media.js';
import { askDialog, toast, apiErrText } from './admin-ui.js';
import { uploadImage } from './admin-images.js';
import { buildPayload } from './admin-form.js';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const uploadErr = (e) => (String(e?.code).startsWith('storage/')
  ? 'Gagal mengunggah. Periksa koneksi dan izin akun Anda.' : (e?.message || 'Gagal memproses gambar.'));

// Tampilan kelola data berbasis konfigurasi: daftar + formulir (produk, layanan, portfolio),
// atau satu dokumen saja bila cfg.single (layar Brand).
export async function mountCrud(root, ctx, cfg) {
  const t = ctx.tenant.id;
  const state = { items: [], cats: [], single: {} };

  async function loadCats() {
    if (!cfg.categoryCollection) return;
    try {
      const snap = await getDocs(collection(adminDb, 'tenants', t, cfg.categoryCollection));
      state.cats = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name), 'id'));
    } catch (e) { console.error(e); state.cats = []; }
  }
  async function loadSingle() {
    try {
      const snap = await getDoc(doc(adminDb, ...cfg.docPath(t)));
      state.single = snap.exists() ? snap.data() : {};
    } catch (e) { console.error(e); state.single = {}; }
  }
  async function loadItems() {
    try {
      const snap = await getDocs(query(collection(adminDb, 'tenants', t, cfg.collection), orderBy('createdAt', 'desc'), limit(100)));
      state.items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return true;
    } catch (e) { console.error(e); return false; }
  }

  async function togglePublish(item) {
    try {
      await adminCall(cfg.api.publish, { tenantId: t, [cfg.idKey]: item.id, published: !item.published });
      toast(item.published ? 'Dikembalikan ke draft' : 'Diterbitkan');
    } catch (e) { toast(apiErrText(e)); }
    await showList();
  }

  function card(item) {
    const url = imageUrl(item.thumbnailImage ?? item.coverImage);
    const actions = [
      h('button', { class: 'btn btn--ghost btn--small', type: 'button', text: 'Edit', onclick: () => showEditor(item) }),
      h('button', { class: 'btn btn--small', type: 'button', text: item.published ? 'Batal terbit' : 'Terbitkan', onclick: () => togglePublish(item) }),
      ...(cfg.extraActions?.(item, { ctx, reload: showList }) ?? []),
    ];
    return h('article', { class: 'item' },
      h('div', { class: 'item__img' }, url ? h('img', { src: url, alt: '', loading: 'lazy' }) : null),
      h('div', { class: 'item__body' },
        h('div', { class: 'hist__head' }, h('strong', { text: item[cfg.titleKey] ?? '(tanpa nama)' }), h('span', { class: 'badge', text: item.published ? 'Terbit' : 'Draft' })),
        h('p', { class: 'meta', text: cfg.summary(item) }),
        h('div', { class: 'hist__actions' }, actions)));
  }

  async function showList() {
    root.replaceChildren(h('div', { class: 'skeleton', style: 'height:8rem' }));
    if (cfg.single) {
      await Promise.all([loadSingle(), loadCats()]);
      return showEditor(state.single);
    }
    const [ok] = await Promise.all([loadItems(), loadCats()]);
    const body = !ok ? [h('p', { class: 'alert', role: 'alert', text: 'Data belum dapat dimuat.' })]
      : state.items.length ? state.items.map(card) : [h('p', { class: 'empty', text: `Belum ada ${cfg.singular}.` })];
    root.replaceChildren(
      h('div', { class: 'toolbar toolbar--split' },
        h('p', { class: 'meta', text: `${state.items.length} ${cfg.singular} terdaftar` }),
        h('button', { class: 'btn btn--small', type: 'button', text: `Tambah ${cfg.singular}`, onclick: () => showEditor(null) })),
      h('div', { class: 'hist-list', 'aria-live': 'polite' }, body));
  }

  function showEditor(item) {
    const isNew = !item;
    const draft = {};
    for (const f of cfg.fields) {
      const v = item?.[f.name];
      if (f.type === 'gallery') draft[f.name] = Array.isArray(v) ? [...v] : [];
      else if (f.type === 'checkbox') draft[f.name] = isNew ? (f.default ?? false) : Boolean(v);
      else if (f.type === 'number') draft[f.name] = v === undefined || v === null ? (isNew ? (f.default ?? '') : '') : String(v);
      else draft[f.name] = v ?? (isNew ? (f.default ?? '') : '');
    }
    let uploading = 0;
    const errBox = h('div', {});
    const showError = (text) => {
      errBox.replaceChildren(text ? h('p', { class: 'alert', role: 'alert', text }) : '');
      if (text) errBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };

    function imageNode(f) {
      const status = h('p', { class: 'meta', 'aria-live': 'polite' });
      const preview = h('div', { class: 'imgprev' });
      const draw = () => preview.replaceChildren(draft[f.name]
        ? h('img', { src: imageUrl(draft[f.name]), alt: `Pratinjau ${f.label}` }) : h('p', { class: 'meta', text: 'Belum ada gambar.' }));
      const input = h('input', { class: 'input', id: `f-${f.name}`, type: 'file', accept: ACCEPT, onchange: async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        uploading += 1;
        status.textContent = 'Memproses dan mengunggah…';
        try {
          const r = await uploadImage(file, { tenantId: t, area: cfg.area, thumb: Boolean(f.autoThumb) });
          draft[f.name] = r.path;
          if (f.autoThumb && r.thumbPath) draft[f.autoThumb] = r.thumbPath;
          draw();
          status.textContent = 'Gambar terunggah. Klik Simpan untuk menerapkan.';
        } catch (e2) { console.error(e2); status.textContent = uploadErr(e2); }
        finally { uploading -= 1; e.target.value = ''; }
      } });
      draw();
      return h('div', { class: 'field' }, h('label', { for: input.id, text: f.label }), input, f.hint ? h('p', { class: 'meta', text: f.hint }) : null, preview, status);
    }

    function galleryNode(f) {
      const grid = h('div', { class: 'gallery-row' });
      const status = h('p', { class: 'meta', 'aria-live': 'polite' });
      const draw = () => grid.replaceChildren(...draft[f.name].map((p, i) => h('div', { class: 'gal' },
        h('img', { src: imageUrl(p), alt: `Foto ${i + 1}` }),
        h('button', { class: 'btn btn--ghost btn--small', type: 'button', text: 'Hapus', onclick: () => { draft[f.name].splice(i, 1); draw(); } }))));
      const input = h('input', { class: 'input', id: `f-${f.name}`, type: 'file', multiple: true, accept: ACCEPT, onchange: async (e) => {
        for (const file of [...e.target.files]) {
          if (draft[f.name].length >= 12) { status.textContent = 'Maksimal 12 foto.'; break; }
          uploading += 1;
          status.textContent = `Mengunggah ${file.name}…`;
          try {
            const r = await uploadImage(file, { tenantId: t, area: cfg.area, thumb: false });
            draft[f.name].push(r.path);
            draw();
            status.textContent = '';
          } catch (e2) { console.error(e2); status.textContent = uploadErr(e2); }
          finally { uploading -= 1; }
        }
        e.target.value = '';
      } });
      draw();
      return h('div', { class: 'field' }, h('label', { for: input.id, text: f.label }), input, grid, status);
    }

    function categoryNode(f) {
      const wrap = h('div', { class: 'field' });
      const build = () => {
        const sel = h('select', { class: 'input', id: `f-${f.name}`, onchange: (e) => { draft[f.name] = e.target.value; } },
          [h('option', { value: '', text: '— Tanpa kategori —' }), ...state.cats.map((c) => h('option', { value: c.id, text: c.name }))]);
        sel.value = draft[f.name] ?? '';
        wrap.replaceChildren(h('label', { for: sel.id, text: f.label }), sel,
          h('button', { class: 'btn btn--ghost btn--small', type: 'button', text: 'Tambah kategori baru', onclick: addCat }));
      };
      async function addCat() {
        const r = await askDialog({ title: 'Kategori baru', fields: [{ name: 'name', label: 'Nama kategori', type: 'text', required: true }], confirmLabel: 'Tambah' });
        if (!r) return;
        try {
          const out = await adminCall('createCategory', { tenantId: t, kind: cfg.categoryKind, name: r.name });
          await loadCats();
          draft[f.name] = out.categoryId;
          build();
        } catch (e) { showError(apiErrText(e)); }
      }
      build();
      return wrap;
    }

    function fieldNode(f) {
      if (f.type === 'checkbox') {
        return h('label', { class: 'choice' },
          h('input', { type: 'checkbox', checked: Boolean(draft[f.name]), onchange: (e) => { draft[f.name] = e.target.checked; } }),
          h('span', { class: 'choice__body' }, h('strong', { text: f.label }), f.hint ? h('span', { class: 'meta', text: f.hint }) : null));
      }
      if (f.type === 'image') return imageNode(f);
      if (f.type === 'gallery') return galleryNode(f);
      if (f.type === 'category') return categoryNode(f);
      const id = `f-${f.name}`;
      const bind = { oninput: (e) => { draft[f.name] = e.target.value; } };
      let input;
      if (f.type === 'select') {
        input = h('select', { class: 'input', id, onchange: (e) => { draft[f.name] = e.target.value; } },
          f.options.map(([v, l]) => h('option', { value: v, text: l })));
      } else if (f.type === 'textarea') {
        input = h('textarea', { class: 'input', id, ...bind });
      } else {
        const attrs = { class: 'input', id, ...bind, type: f.type === 'number' ? 'number' : 'text' };
        if (f.type === 'number') Object.assign(attrs, { step: '1', inputmode: 'numeric', ...(f.min !== undefined ? { min: String(f.min) } : {}) });
        input = h('input', attrs);
      }
      input.value = draft[f.name] ?? '';
      return h('div', { class: 'field' }, h('label', { for: id, text: f.label }), input, f.hint ? h('p', { class: 'meta', text: f.hint }) : null);
    }

    const saveLabel = isNew ? `Simpan ${cfg.singular}` : 'Simpan perubahan';
    const saveBtn = h('button', { class: 'btn', type: 'submit', text: saveLabel });

    async function save(ev) {
      ev.preventDefault();
      if (uploading > 0) return showError('Tunggu sampai unggahan gambar selesai.');
      const { out, errors } = buildPayload(cfg.fields, draft, item, isNew);
      if (errors.length) return showError(errors[0]);
      if (!isNew && !Object.keys(out).length) return showError('Tidak ada perubahan untuk disimpan.');
      showError('');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Menyimpan…';
      try {
        await adminCall(isNew ? cfg.api.create : cfg.api.update,
          { tenantId: t, ...(isNew || cfg.single ? {} : { [cfg.idKey]: item.id }), ...out });
        toast(isNew ? `${cfg.title} tersimpan sebagai draft. Terbitkan dari daftar.` : 'Perubahan tersimpan');
        await showList();
      } catch (e) {
        showError(apiErrText(e));
        saveBtn.disabled = false;
        saveBtn.textContent = saveLabel;
      }
    }

    root.replaceChildren(h('form', { class: 'form', novalidate: true, onsubmit: save },
      cfg.single ? null : h('h2', { class: 'card__title', text: isNew ? `Tambah ${cfg.singular}` : `Edit ${cfg.singular}` }),
      cfg.fields.filter((f) => !f.hidden && !(f.createOnly && !isNew)).map(fieldNode),
      errBox,
      h('div', { class: 'hist__actions' }, saveBtn,
        h('button', { class: 'btn btn--ghost', type: 'button', text: cfg.single ? 'Muat ulang' : 'Batal', onclick: () => showList() }))));
  }

  await showList();
}
