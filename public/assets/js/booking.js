import { db, collection, getDocs, query, where, limit } from './firebase.js';
import { bootPage } from './page.js';
import { h } from './dom.js';
import { rupiah, formatDuration } from './format.js';
import { call, ApiError } from './api.js';
import { ensureUser } from './auth.js';
import { tenantHref } from './tenant.js';

const MODE_LABEL = { studio: 'Di studio', customer_location: 'Di lokasi Anda' };
const MESSAGES = {
  'booking-conflict': 'Jadwal tersebut sudah tidak tersedia. Silakan pilih waktu lain.',
  'rate-limited': 'Anda masih punya beberapa booking yang belum selesai. Selesaikan atau batalkan dulu sebelum membuat yang baru.',
  'tenant-suspended': 'Layanan booking sedang tidak tersedia.',
  unauthenticated: 'Sesi Anda belum siap. Muat ulang halaman lalu coba lagi.',
  network: 'Tidak dapat menghubungi server. Pastikan backend menyala, lalu coba lagi.',
};
const errText = (e) => (e instanceof ApiError ? (MESSAGES[e.code] ?? e.message) : 'Terjadi kesalahan tak terduga.');
const $ = (id) => document.getElementById(id);
const todayLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const newKey = () => crypto.randomUUID?.() ?? `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

const S = { tenant: null, services: [], selected: new Set(), mode: 'studio', date: '', start: '', seq: 0, key: null, keySig: '', busy: false };

function modesFor() {
  const sets = [...S.selected].map((id) => {
    const m = S.services.find((s) => s.id === id)?.locationMode;
    return m === 'both' ? ['studio', 'customer_location'] : [m];
  });
  if (!sets.length) return ['studio', 'customer_location'];
  return sets.reduce((a, b) => a.filter((x) => b.includes(x)));
}

function showError(text) {
  const box = $('form-error');
  box.replaceChildren(text ? h('p', { class: 'alert', role: 'alert', text }) : '');
  if (text) box.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function renderServices() {
  $('services-list').replaceChildren(...S.services.map((s) => h('label', { class: 'choice' },
    h('input', { type: 'checkbox', value: s.id, checked: S.selected.has(s.id), onchange: (e) => {
      if (e.target.checked) {
        if (S.selected.size >= 5) { e.target.checked = false; return; }
        S.selected.add(s.id);
      } else S.selected.delete(s.id);
      onSelectionChange();
    } }),
    h('span', { class: 'choice__body' },
      h('strong', { text: s.name }),
      h('span', { class: 'meta', text: `${formatDuration(s.durationMinutes)} · ${rupiah(s.price)}` })))));
}

function renderModes() {
  const modes = modesFor();
  const box = $('modes');
  if (!modes.length) {
    box.replaceChildren(h('p', { class: 'alert', role: 'alert', text: 'Layanan yang dipilih tidak dapat digabung karena lokasi layanannya berbeda. Kurangi pilihan layanan.' }));
    S.mode = '';
    return;
  }
  if (!modes.includes(S.mode)) S.mode = modes[0];
  box.replaceChildren(...modes.map((m) => h('label', { class: 'choice' },
    h('input', { type: 'radio', name: 'mode', value: m, checked: S.mode === m, onchange: () => { S.mode = m; onModeChange(); } }),
    h('span', { class: 'choice__body' }, h('strong', { text: MODE_LABEL[m] })))));
  $('address-field').hidden = S.mode !== 'customer_location';
}

function renderSummary() {
  const picked = S.services.filter((s) => S.selected.has(s.id));
  const sum = (k) => picked.reduce((a, s) => a + (s[k] ?? 0), 0);
  $('summary').replaceChildren(picked.length
    ? h('div', { class: 'summary' },
        h('p', {}, 'Perkiraan total: ', h('strong', { text: rupiah(sum('price')) })),
        h('p', { class: 'meta', text: `Deposit: ${rupiah(Math.min(sum('depositAmount'), sum('price')))} · Durasi: ${formatDuration(sum('durationMinutes'))}` }),
        h('p', { class: 'meta', text: 'Nominal final dihitung server saat booking dibuat.' }))
    : '');
}

function setSlots(content) { $('slots').replaceChildren(content); }

async function refreshSlots() {
  S.start = '';
  const mySeq = ++S.seq;
  if (!S.selected.size || !S.date || !S.mode) { setSlots(h('p', { class: 'meta', text: 'Pilih layanan dan tanggal untuk melihat jam yang tersedia.' })); return; }
  setSlots(h('p', { class: 'meta', text: 'Memeriksa jadwal…' }));
  try {
    const data = await call('checkBookingAvailability',
      { tenantId: S.tenant.id, serviceIds: [...S.selected], date: S.date, locationMode: S.mode });
    if (mySeq !== S.seq) return; // permintaan lama, abaikan
    if (!data.availableSlots.length) { setSlots(h('p', { class: 'meta', text: 'Tidak ada jam kosong pada tanggal ini. Coba tanggal lain.' })); return; }
    setSlots(h('div', { class: 'slots', role: 'group', 'aria-label': 'Jam tersedia' }, data.availableSlots.map((sl) =>
      h('button', { type: 'button', class: 'slot', 'aria-pressed': 'false', text: sl.startTime, onclick: (e) => {
        S.start = sl.startTime;
        document.querySelectorAll('.slot').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
      } }))));
  } catch (e) {
    if (mySeq !== S.seq) return;
    setSlots(h('p', { class: 'alert', role: 'alert', text: errText(e) }));
  }
}

function onSelectionChange() { showError(''); renderModes(); renderSummary(); refreshSlots(); }
function onModeChange() { $('address-field').hidden = S.mode !== 'customer_location'; refreshSlots(); }

function validate() {
  if (!S.selected.size) return 'Pilih minimal satu layanan.';
  if (!S.mode) return 'Lokasi layanan belum valid.';
  if (S.mode === 'customer_location' && $('address').value.trim().length < 5) return 'Isi alamat lokasi Anda (minimal 5 karakter).';
  if (!S.date) return 'Pilih tanggal.';
  if (!S.start) return 'Pilih jam yang tersedia.';
  if ($('cname').value.trim().length < 2) return 'Isi nama Anda.';
  if (!/^(?:\+62|62|0)8\d{8,12}$/.test($('cphone').value.replace(/[\s-]/g, ''))) return 'Isi nomor ponsel Indonesia yang valid, contoh 081234567890.';
  return '';
}

async function submit(ev) {
  ev.preventDefault();
  if (S.busy) return;
  const problem = validate();
  if (problem) return showError(problem);
  showError('');

  const location = S.mode === 'customer_location' ? { mode: S.mode, address: $('address').value.trim() } : { mode: S.mode };
  const ids = [...S.selected];
  const sig = JSON.stringify([[...ids].sort(), S.date, S.start, location]);
  if (sig !== S.keySig) { S.key = newKey(); S.keySig = sig; } // kunci sama selama isian sama: aman bila diklik ulang
  const notes = $('notes').value.trim();
  const body = {
    tenantId: S.tenant.id, idempotencyKey: S.key,
    serviceItems: ids.map((serviceId) => ({ serviceId })), bookingDate: S.date, startTime: S.start,
    customerName: $('cname').value.trim(), customerPhone: $('cphone').value.trim(), location,
    ...(notes ? { notes } : {}),
  };

  S.busy = true;
  const btn = $('submit-btn');
  btn.disabled = true; btn.textContent = 'Memproses…';
  try {
    renderResult(await call('createBooking', body));
  } catch (e) {
    showError(errText(e));
    if (e instanceof ApiError && e.code === 'booking-conflict') refreshSlots();
  } finally {
    S.busy = false; btn.disabled = false; btn.textContent = 'Buat booking';
  }
}

function renderResult(r) {
  const tz = S.tenant.operatingHours?.timezone ?? 'Asia/Jakarta';
  const when = new Date(r.paymentDeadline).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: tz });
  const needsPay = r.bookingStatus === 'awaiting_payment';
  $('booking-root').replaceChildren(h('section', { class: 'result', 'aria-labelledby': 'res-title' },
    h('h2', { id: 'res-title', class: 'card__title', text: 'Booking dibuat' }),
    h('dl', {},
      h('dt', { text: 'Nomor booking' }), h('dd', { text: r.bookingNumber }),
      h('dt', { text: 'Total' }), h('dd', { text: rupiah(r.totalAmount) }),
      h('dt', { text: 'Deposit' }), h('dd', { text: rupiah(r.depositAmount) }),
      h('dt', { text: 'Status' }), h('dd', { text: needsPay ? 'Menunggu pembayaran' : 'Menunggu konfirmasi admin' })),
    h('p', { class: 'notice', text: needsPay
      ? `Jadwal ditahan sampai ${when}. Simpan nomor booking Anda. Langkah pembayaran (instruksi dan unggah bukti) sedang dibangun dan akan tersedia di halaman berikutnya.`
      : `Jadwal ditahan sampai ${when} menunggu konfirmasi admin. Simpan nomor booking Anda.` }),
    h('a', { class: 'btn btn--ghost', href: tenantHref('/booking/'), text: 'Buat booking lain' })));
  $('res-title').setAttribute('tabindex', '-1');
  $('res-title').focus();
}

function buildForm() {
  const min = todayLocal();
  $('booking-root').replaceChildren(h('form', { class: 'form', novalidate: true, onsubmit: submit },
    h('fieldset', {}, h('legend', { text: '1. Layanan' }),
      h('div', { id: 'services-list', style: 'display:grid;gap:.6rem' }),
      h('p', { class: 'meta', text: 'Bisa memilih lebih dari satu layanan (maksimal 5).' })),
    h('fieldset', {}, h('legend', { text: '2. Lokasi' }),
      h('div', { id: 'modes', style: 'display:grid;gap:.6rem' }),
      h('div', { class: 'field', id: 'address-field', hidden: true },
        h('label', { for: 'address', text: 'Alamat lokasi' }),
        h('textarea', { class: 'input', id: 'address', autocomplete: 'street-address', maxlength: '300' }))),
    h('fieldset', {}, h('legend', { text: '3. Tanggal' }),
      h('div', { class: 'field' },
        h('label', { for: 'date', text: 'Pilih tanggal' }),
        h('input', { class: 'input', id: 'date', type: 'date', min, onchange: (e) => { S.date = e.target.value; refreshSlots(); } }))),
    h('fieldset', {}, h('legend', { text: '4. Jam' }),
      h('div', { id: 'slots', 'aria-live': 'polite' }, h('p', { class: 'meta', text: 'Pilih layanan dan tanggal untuk melihat jam yang tersedia.' }))),
    h('fieldset', {}, h('legend', { text: '5. Data Anda' }),
      h('div', { class: 'field' }, h('label', { for: 'cname', text: 'Nama lengkap' }),
        h('input', { class: 'input', id: 'cname', type: 'text', autocomplete: 'name', maxlength: '80' })),
      h('div', { class: 'field' }, h('label', { for: 'cphone', text: 'Nomor ponsel (WhatsApp)' }),
        h('input', { class: 'input', id: 'cphone', type: 'tel', inputmode: 'tel', autocomplete: 'tel', placeholder: '081234567890', maxlength: '20' })),
      h('div', { class: 'field' }, h('label', { for: 'notes', text: 'Catatan (opsional)' }),
        h('textarea', { class: 'input', id: 'notes', maxlength: '500' }))),
    h('div', { id: 'summary' }),
    h('div', { id: 'form-error' }),
    h('button', { class: 'btn', id: 'submit-btn', type: 'submit', text: 'Buat booking' })));
  renderServices();
  renderModes();
}

async function loadServices() {
  const q = query(collection(db, 'tenants', S.tenant.id, 'services'), where('published', '==', true), limit(50));
  S.services = (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => s.bookingEnabled !== false).sort((a, b) => a.name.localeCompare(b.name, 'id'));
}

async function main() {
  const tenant = await bootPage('Booking');
  if (!tenant) return;
  S.tenant = tenant;
  try {
    await Promise.all([loadServices(), ensureUser()]);
  } catch (e) {
    console.error(e);
    $('booking-root').replaceChildren(h('p', { class: 'alert', role: 'alert', text: 'Halaman booking belum dapat dimuat. Muat ulang halaman, dan pastikan emulator menyala.' }));
    return;
  }
  if (!S.services.length) { $('booking-root').replaceChildren(h('p', { class: 'empty', text: 'Belum ada layanan yang dapat dibooking.' })); return; }
  const pre = new URLSearchParams(location.search).get('service');
  if (pre && S.services.some((s) => s.id === pre)) S.selected.add(pre);
  buildForm();
  renderSummary();
}

main();
