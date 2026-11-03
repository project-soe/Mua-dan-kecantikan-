import { adminDb, adminAuth, doc, getDoc, EmailAuthProvider, reauthenticateWithCredential } from './admin-firebase.js';
import { adminCall } from './admin-api.js';
import { ApiError } from './api.js';
import { h } from './dom.js';
import { imageUrl } from './media.js';
import { uploadImage } from './admin-images.js';
import { askDialog, toast, apiErrText } from './admin-ui.js';
import { METHOD_LABEL } from './status.js';
import { ORDER, buildMethods } from './paymethods-model.js';

const HINT = {
  bank_transfer: 'Nomor rekening yang dituju pelanggan saat transfer.',
  dana: 'Nomor ponsel yang terdaftar di DANA.', ovo: 'Nomor ponsel yang terdaftar di OVO.',
  gopay: 'Nomor ponsel yang terdaftar di GoPay.', shopeepay: 'Nomor ponsel yang terdaftar di ShopeePay.',
};

// Perubahan tujuan pembayaran wajib login baru-baru ini (aturan keamanan di backend).
async function reauth() {
  const user = adminAuth.currentUser;
  const r = await askDialog({ title: 'Konfirmasi kata sandi',
    text: 'Demi keamanan, perubahan rekening pembayaran memerlukan login ulang. Masukkan kata sandi akun Anda.',
    fields: [{ name: 'pw', label: 'Kata sandi', type: 'password', required: true }], confirmLabel: 'Konfirmasi' });
  if (!r) throw new Error('Perubahan dibatalkan. Belum ada yang disimpan.');
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, r.pw));
    await user.getIdToken(true);
  } catch { throw new Error('Kata sandi salah. Belum ada yang disimpan.'); }
}

async function saveSettings(body) {
  try { return await adminCall('updatePaymentSettings', body); }
  catch (e) {
    if (e instanceof ApiError && e.code === 'permission-denied' && /login ulang/i.test(e.message)) {
      await reauth();
      return adminCall('updatePaymentSettings', body);
    }
    throw e;
  }
}

export async function mountPayMethods(root, ctx) {
  const t = ctx.tenant.id;
  let pub = { methods: [], instructionsText: '' };
  let priv = { internalNotes: '' };
  try {
    const [a, b] = await Promise.all([
      getDoc(doc(adminDb, 'tenants', t, 'settings', 'paymentPublic')),
      getDoc(doc(adminDb, 'tenants', t, 'settings', 'paymentPrivate')),
    ]);
    if (a.exists()) pub = a.data();
    if (b.exists()) priv = b.data();
  } catch (e) {
    console.error(e);
    root.replaceChildren(h('p', { class: 'alert', role: 'alert', text: 'Pengaturan pembayaran belum dapat dimuat.' }));
    return;
  }

  const byMethod = new Map((pub.methods ?? []).map((m) => [m.method, m]));
  const state = new Map(ORDER.map((m) => [m, { ...(byMethod.get(m) ?? { method: m, enabled: false }) }]));
  let uploading = 0;

  function methodCard(m) {
    const s = state.get(m);
    const id = (k) => `pm-${m}-${k}`;
    const textField = (k, label, hint) => {
      const input = h('input', { class: 'input', id: id(k), type: 'text', autocomplete: 'off', oninput: (e) => { s[k] = e.target.value; } });
      input.value = s[k] ?? '';
      return h('div', { class: 'field' }, h('label', { for: id(k), text: label }), input, hint ? h('p', { class: 'meta', text: hint }) : null);
    };
    const enabled = h('label', { class: 'choice' },
      h('input', { type: 'checkbox', checked: Boolean(s.enabled), onchange: (e) => { s.enabled = e.target.checked; } }),
      h('span', { class: 'choice__body' }, h('strong', { text: 'Aktifkan metode ini' }),
        h('span', { class: 'meta', text: 'Metode aktif ditampilkan ke pelanggan saat membayar.' })));

    const fields = [enabled, textField('accountName', 'Nama pemilik (a.n.)')];
    if (m === 'bank_transfer') fields.push(textField('bankName', 'Nama bank', 'Contoh: BCA, BRI, Mandiri.'));
    if (m !== 'qris') fields.push(textField('accountNumber', m === 'bank_transfer' ? 'Nomor rekening' : 'Nomor e-wallet', HINT[m]));
    if (m === 'qris') {
      const status = h('p', { class: 'meta', 'aria-live': 'polite' });
      const preview = h('div', { class: 'imgprev' });
      const draw = () => preview.replaceChildren(s.qrImage
        ? h('img', { src: imageUrl(s.qrImage), alt: 'Pratinjau kode QRIS' }) : h('p', { class: 'meta', text: 'Belum ada gambar QRIS.' }));
      const input = h('input', { class: 'input', id: id('qr'), type: 'file', accept: 'image/jpeg,image/png,image/webp', onchange: async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        uploading += 1;
        status.textContent = 'Memproses dan mengunggah…';
        try {
          const r = await uploadImage(file, { tenantId: t, area: 'payment-methods', thumb: false });
          s.qrImage = r.path;
          draw();
          status.textContent = 'Gambar terunggah. Klik Simpan untuk menerapkan.';
        } catch (e2) {
          console.error(e2);
          status.textContent = String(e2?.code).startsWith('storage/') ? 'Gagal mengunggah. Periksa koneksi dan izin akun Anda.' : (e2?.message || 'Gagal memproses gambar.');
        } finally { uploading -= 1; e.target.value = ''; }
      } });
      draw();
      fields.push(h('div', { class: 'field' }, h('label', { for: input.id, text: 'Gambar kode QRIS' }), input,
        h('p', { class: 'meta', text: 'Gambar QRIS bersifat publik karena memang untuk dipindai pelanggan.' }), preview, status));
    }
    return h('fieldset', {}, h('legend', { text: METHOD_LABEL[m] ?? m }), fields);
  }

  const instructions = h('textarea', { class: 'input', id: 'pm-instr', maxlength: '500' });
  instructions.value = pub.instructionsText ?? '';
  const notes = h('textarea', { class: 'input', id: 'pm-notes', maxlength: '500' });
  notes.value = priv.internalNotes ?? '';

  const errNode = h('div', {});
  const showError = (text) => {
    errNode.replaceChildren(text ? h('p', { class: 'alert', role: 'alert', text }) : '');
    if (text) errNode.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const saveBtn = h('button', { class: 'btn', type: 'button', text: 'Simpan metode pembayaran', onclick: async () => {
    showError('');
    if (uploading > 0) return showError('Tunggu sampai unggahan gambar selesai.');
    let methods;
    try { methods = buildMethods(state, METHOD_LABEL); } catch (e) { return showError(e.message); }
    saveBtn.disabled = true;
    try {
      await saveSettings({ tenantId: t, methods, instructionsText: instructions.value.trim(), internalNotes: notes.value.trim() });
      toast(methods.some((m) => m.enabled) ? 'Metode pembayaran tersimpan' : 'Tersimpan, tetapi tidak ada metode aktif: pelanggan belum bisa membayar');
    } catch (e) { showError(e instanceof ApiError ? apiErrText(e) : (e.message || 'Terjadi kesalahan tak terduga.')); }
    saveBtn.disabled = false;
  } });

  root.replaceChildren(h('div', { class: 'form' },
    h('p', { class: 'notice', text: 'Rekening hanya ditampilkan kepada pelanggan yang sedang membayar booking miliknya, bukan di halaman publik. Mengubah rekening meminta Anda memasukkan kata sandi lagi.' }),
    ORDER.map(methodCard),
    h('fieldset', {}, h('legend', { text: 'Petunjuk dan catatan' }),
      h('div', { class: 'field' }, h('label', { for: 'pm-instr', text: 'Petunjuk untuk pelanggan (opsional)' }), instructions,
        h('p', { class: 'meta', text: 'Tampil di halaman pembayaran. Contoh: "Transfer sesuai nominal, lalu unggah bukti."' })),
      h('div', { class: 'field' }, h('label', { for: 'pm-notes', text: 'Catatan internal (tidak tampil ke pelanggan)' }), notes)),
    errNode, saveBtn));
}
