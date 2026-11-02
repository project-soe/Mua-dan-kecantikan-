import { adminDb, doc, getDoc } from './admin-firebase.js';
import { adminCall } from './admin-api.js';
import { h } from './dom.js';
import { DAY_ORDER, DAY_LABELS } from './format.js';
import { toast, apiErrText } from './admin-ui.js';

const TZ = [['Asia/Jakarta', 'WIB (Jakarta)'], ['Asia/Makassar', 'WITA (Makassar)'], ['Asia/Jayapura', 'WIT (Jayapura)']];
const MAX_WINDOWS = 3;

function weeklyEditor(initial = {}) {
  const data = {};
  for (const d of DAY_ORDER) data[d] = (initial[d] ?? []).map((w) => ({ open: w.open, close: w.close }));
  const node = h('div', { class: 'week' });
  const draw = () => node.replaceChildren(...DAY_ORDER.map((d) => h('div', { class: 'day' },
    h('strong', { text: DAY_LABELS[d] }),
    data[d].length
      ? data[d].map((w, i) => h('div', { class: 'win' },
        h('input', { class: 'input', type: 'time', value: w.open, 'aria-label': `${DAY_LABELS[d]} jam buka ${i + 1}`, onchange: (e) => { w.open = e.target.value; } }),
        h('span', { class: 'meta', text: 's/d' }),
        h('input', { class: 'input', type: 'time', value: w.close, 'aria-label': `${DAY_LABELS[d]} jam tutup ${i + 1}`, onchange: (e) => { w.close = e.target.value; } }),
        h('button', { class: 'btn btn--ghost btn--small', type: 'button', text: 'Hapus', onclick: () => { data[d].splice(i, 1); draw(); } })))
      : h('span', { class: 'meta', text: 'Tutup' }),
    data[d].length < MAX_WINDOWS
      ? h('button', { class: 'btn btn--ghost btn--small', type: 'button', style: 'justify-self:start',
        text: data[d].length ? 'Tambah jam' : 'Buka hari ini', onclick: () => { data[d].push({ open: '09:00', close: '17:00' }); draw(); } })
      : null)));
  draw();
  return {
    node,
    value: () => Object.fromEntries(DAY_ORDER.map((d) => [d, data[d].map((w) => ({ open: w.open, close: w.close }))])),
    check: () => {
      for (const d of DAY_ORDER) {
        for (const w of data[d]) {
          if (!w.open || !w.close) return `${DAY_LABELS[d]}: isi jam buka dan jam tutup.`;
          if (w.open >= w.close) return `${DAY_LABELS[d]}: jam buka harus sebelum jam tutup.`;
        }
      }
      return '';
    },
  };
}

function datesEditor(initial = []) {
  let dates = [...initial].sort();
  const list = h('div', { class: 'chips' });
  const input = h('input', { class: 'input', type: 'date', 'aria-label': 'Tanggal libur', style: 'max-width:12rem' });
  const draw = () => list.replaceChildren(...(dates.length
    ? dates.map((d) => h('span', { class: 'chip' }, d,
      h('button', { type: 'button', 'aria-label': `Hapus ${d}`, text: '×', onclick: () => { dates = dates.filter((x) => x !== d); draw(); } })))
    : [h('span', { class: 'meta', text: 'Belum ada tanggal libur khusus.' })]));
  const add = h('button', { class: 'btn btn--ghost btn--small', type: 'button', text: 'Tambah tanggal libur', onclick: () => {
    if (!input.value) return;
    if (!dates.includes(input.value)) dates = [...dates, input.value].sort();
    input.value = '';
    draw();
  } });
  draw();
  return { node: h('div', { class: 'field' }, list, h('div', { class: 'toolbar' }, input, add)), value: () => [...dates] };
}

function numberField(id, label, value, hint, min, max) {
  const input = h('input', { class: 'input', id, type: 'number', step: '1', inputmode: 'numeric', min: String(min), max: String(max) });
  input.value = String(value);
  return {
    node: h('div', { class: 'field' }, h('label', { for: id, text: label }), input, hint ? h('p', { class: 'meta', text: hint }) : null),
    read: () => {
      const n = Number(input.value);
      if (input.value === '' || !Number.isInteger(n) || n < min || n > max) throw new Error(`${label}: isi angka bulat ${min}–${max}.`);
      return n;
    },
  };
}

function errBox() {
  const node = h('div', {});
  return { node, show: (t) => { node.replaceChildren(t ? h('p', { class: 'alert', role: 'alert', text: t }) : ''); if (t) node.scrollIntoView({ block: 'center', behavior: 'smooth' }); } };
}

export async function mountHours(root, ctx) {
  const t = ctx.tenant.id;
  let mua = {}; let store = {};
  try {
    const [a, b] = await Promise.all([
      getDoc(doc(adminDb, 'tenants', t, 'settings', 'businessHours')),
      getDoc(doc(adminDb, 'tenants', t, 'settings', 'storeHours')),
    ]);
    mua = a.exists() ? a.data() : {};
    store = b.exists() ? b.data() : {};
  } catch (e) {
    console.error(e);
    root.replaceChildren(h('p', { class: 'alert', role: 'alert', text: 'Pengaturan jam belum dapat dimuat.' }));
    return;
  }

  // ---- Jam layanan MUA (menentukan jam booking) ----
  const muaWeek = weeklyEditor(mua.weekly);
  const muaDates = datesEditor(mua.closedDates);
  const tz = h('select', { class: 'input', id: 'h-tz' }, TZ.map(([v, l]) => h('option', { value: v, text: l })));
  tz.value = mua.timezone ?? 'Asia/Jakarta';
  const interval = h('select', { class: 'input', id: 'h-int' }, [15, 30, 60].map((v) => h('option', { value: String(v), text: `${v} menit` })));
  interval.value = String(mua.slotIntervalMinutes ?? 30);
  const nums = {
    capacity: numberField('h-cap', 'Booking bersamaan', mua.capacity ?? 1, 'Berapa booking boleh berjalan di jam yang sama (jumlah MUA/kursi).', 1, 20),
    lead: numberField('h-lead', 'Jeda minimal sebelum booking (menit)', mua.minLeadTimeMinutes ?? 120, 'Pelanggan tidak bisa memesan lebih dekat dari ini.', 0, 10080),
    adv: numberField('h-adv', 'Batas pemesanan ke depan (hari)', mua.maxAdvanceDays ?? 90, '', 1, 365),
    hold: numberField('h-hold', 'Lama jadwal ditahan menunggu pembayaran (menit)', mua.holdMinutes ?? 120, '', 15, 2880),
    cut: numberField('h-cut', 'Batas pembatalan oleh pelanggan (jam sebelum jadwal)', mua.cancelCutoffHours ?? 24, 'Berlaku untuk booking yang sudah terkonfirmasi.', 0, 720),
  };
  const muaErr = errBox();
  const muaBtn = h('button', { class: 'btn', type: 'button', text: 'Simpan jam layanan MUA', onclick: async () => {
    muaErr.show('');
    const problem = muaWeek.check();
    if (problem) return muaErr.show(problem);
    let body;
    try {
      body = {
        tenantId: t, timezone: tz.value, slotIntervalMinutes: Number(interval.value), weekly: muaWeek.value(), closedDates: muaDates.value(),
        capacity: nums.capacity.read(), minLeadTimeMinutes: nums.lead.read(), maxAdvanceDays: nums.adv.read(),
        holdMinutes: nums.hold.read(), cancelCutoffHours: nums.cut.read(),
      };
    } catch (e) { return muaErr.show(e.message); }
    muaBtn.disabled = true;
    try { await adminCall('updateBusinessHours', body); toast('Jam layanan MUA tersimpan'); }
    catch (e) { muaErr.show(apiErrText(e)); }
    muaBtn.disabled = false;
  } });

  // ---- Jam toko produk (tampilan di situs) ----
  const storeWeek = weeklyEditor(store.weekly);
  const storeDates = datesEditor(store.closedDates);
  const storeErr = errBox();
  const storeBtn = h('button', { class: 'btn', type: 'button', text: 'Simpan jam toko produk', onclick: async () => {
    storeErr.show('');
    const problem = storeWeek.check();
    if (problem) return storeErr.show(problem);
    storeBtn.disabled = true;
    try { await adminCall('updateStoreHours', { tenantId: t, weekly: storeWeek.value(), closedDates: storeDates.value() }); toast('Jam toko produk tersimpan'); }
    catch (e) { storeErr.show(apiErrText(e)); }
    storeBtn.disabled = false;
  } });

  root.replaceChildren(h('div', { class: 'form', style: 'max-width:44rem;gap:3rem' },
    h('section', { class: 'form' },
      h('h2', { class: 'card__title', text: 'Jam layanan MUA' }),
      h('p', { class: 'notice', text: 'Jam ini menentukan jam booking yang bisa dipilih pelanggan. Mengubah interval atau jumlah booking bersamaan saat sudah ada booking mendatang dapat memengaruhi jadwal yang sudah ada.' }),
      h('fieldset', {}, h('legend', { text: 'Jam buka per hari' }), muaWeek.node),
      h('fieldset', {}, h('legend', { text: 'Tanggal libur khusus' }), muaDates.node),
      h('fieldset', {}, h('legend', { text: 'Aturan jadwal' }),
        h('div', { class: 'field' }, h('label', { for: 'h-tz', text: 'Zona waktu' }), tz),
        h('div', { class: 'field' }, h('label', { for: 'h-int', text: 'Jarak antar jam mulai' }), interval),
        Object.values(nums).map((n) => n.node)),
      muaErr.node, muaBtn),
    h('section', { class: 'form' },
      h('h2', { class: 'card__title', text: 'Jam toko produk' }),
      h('p', { class: 'notice', text: 'Ditampilkan di bagian bawah situs. Belum membatasi pembelian produk.' }),
      h('fieldset', {}, h('legend', { text: 'Jam buka per hari' }), storeWeek.node),
      h('fieldset', {}, h('legend', { text: 'Tanggal libur khusus' }), storeDates.node),
      storeErr.node, storeBtn)));
}
