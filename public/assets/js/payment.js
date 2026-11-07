import { h } from './dom.js';
import { call, ApiError } from './api.js';
import { ensureUser } from './auth.js';
import { auth } from './firebase.js';
import { validateProofFile } from './proof.js';
import { rupiah } from './format.js';

const METHOD_LABEL = {
  bank_transfer: 'Transfer bank',
  dana: 'DANA',
  ovo: 'OVO',
  gopay: 'GoPay',
  shopeepay: 'ShopeePay',
  qris: 'QRIS',
};

async function uploadPrivateProof(file, tenantId) {
  const authData = await call('getPaymentProofUploadAuth', { tenantId, area: 'payment-proofs', contentType: file.type, size: file.size });
  const form = new FormData();
  const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' })[file.type];
  form.append('file', file); form.append('fileName', `proof-${crypto.randomUUID()}.${ext}`);
  form.append('token', authData.token); form.append('expire', String(authData.expire));
  form.append('signature', authData.signature); form.append('publicKey', authData.publicKey);
  form.append('folder', authData.folder); form.append('useUniqueFileName', 'true'); form.append('isPrivateFile', 'true');
  const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', { method: 'POST', body: form });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.fileId || !result.filePath) throw new Error(result.message || 'Upload bukti ke ImageKit gagal.');
  return { fileId: result.fileId, filePath: result.filePath };
}
const errorMessage = (e) =>
  e instanceof ApiError ? e.message : 'Terjadi kesalahan. Silakan coba lagi.';

function amountChoices(data) {
  const entries = Object.entries(data.amountOptions ?? {});
  const unique = new Map();

  for (const [key, value] of entries) {
    if (!Number.isSafeInteger(value) || value <= 0) continue;

    const label = key === 'deposit'
      ? 'Bayar deposit'
      : key === 'full'
        ? 'Bayar penuh'
        : 'Bayar sisa pembayaran';

    if (!unique.has(value) || key === 'full') {
      unique.set(value, { key, value, label });
    }
  }

  return [...unique.values()];
}

function paymentDetails(method) {
  const nodes = [
    h('h4', { text: METHOD_LABEL[method.method] ?? method.method }),
  ];

  if (method.bankName) {
    nodes.push(h('p', { text: `Bank: ${method.bankName}` }));
  }

  if (method.accountName) {
    nodes.push(h('p', { text: `Atas nama: ${method.accountName}` }));
  }

  if (method.accountNumber) {
    nodes.push(
      h('div', { class: 'copy-row' },
        h('span', { class: 'mono', text: method.accountNumber }),
        h('button', {
          type: 'button',
          class: 'btn btn--ghost btn--small',
          text: 'Salin nomor',
          onclick: async (e) => {
            try {
              await navigator.clipboard.writeText(method.accountNumber);
              e.currentTarget.textContent = 'Tersalin';
            } catch {
              e.currentTarget.textContent = 'Tidak dapat menyalin';
            }
          },
        }),
      ),
    );
  }

  const box = h('div', { class: 'payment-method-detail' }, ...nodes);

  if (method.method === 'qris' && method.qrImage) {
    const qr = h('p', { class: 'meta', text: 'Memuat kode QRIS…' });
    box.append(qr);

    Promise.resolve(method.qrImage)
      .then((url) => {
        qr.replaceWith(h('img', {
          class: 'qr',
          src: url,
          alt: 'Kode QRIS pembayaran Mua Putri',
          loading: 'lazy',
        }));
      })
      .catch(() => {
        qr.textContent = 'Gambar QRIS tidak dapat dimuat. Hubungi admin.';
      });
  }

  return box;
}

export function renderPaymentPanel({ container, tenantId, booking, order, statusNode }) {
  const transaction = order ?? booking;
  const isOrder = Boolean(order);
  const transactionId = isOrder ? order.orderId : booking.bookingId;
  const button = h('button', {
    type: 'button',
    class: 'btn',
    text: 'Lanjut Pembayaran',
  });

  const panel = h('section', {
    class: 'payment-panel payment-panel--intro',
    'aria-label': isOrder ? 'Pembayaran pesanan produk' : 'Pembayaran booking',
  },
    h('div', { class: 'payment-panel__intro' },
      h('p', { class: 'eyebrow', text: 'Pembayaran aman' }),
      h('h3', { class: 'card__title', text: 'Selesaikan pembayaran Anda' }),
      h('p', { class: 'meta', text: 'Metode pembayaran mengikuti pengaturan resmi Mua Putri.' }),
    ),
    button,
  );

  container.append(panel);

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Memuat instruksi pembayaran…';

    try {
      const data = await call('getPaymentInstructions', {
        tenantId,
        ...(isOrder ? { orderId: transactionId } : { bookingId: transactionId }),
      });

      const choices = amountChoices(data);
      const methods = data.supportedMethods ?? [];

      if (!choices.length || !methods.length) {
        throw new Error('Pilihan nominal atau metode pembayaran belum tersedia.');
      }

      let selectedAmount = choices[0].value;
      let selectedMethod = methods[0].method;
      let uploadedProof = null;
      let submitted = false;

      const amountBox = h('div', { class: 'payment-options' });
      const methodBox = h('div', {
        class: 'payment-method-options',
        role: 'radiogroup',
        'aria-label': 'Pilih metode pembayaran',
      });

      const detailBox = h('div', { class: 'payment-details' });
      const fileInput = h('input', {
        class: 'input',
        type: 'file',
        accept: 'image/jpeg,image/png,image/webp,image/avif',
        'aria-label': 'Bukti pembayaran',
      });

      const errorBox = h('div', { 'aria-live': 'polite' });
      const submitButton = h('button', {
        type: 'button',
        class: 'btn',
        text: 'Kirim Bukti Pembayaran',
      });

      choices.forEach((choice, index) => {
        const radio = h('input', {
          type: 'radio',
          name: 'payment-amount',
          value: String(choice.value),
          checked: index === 0,
        });

        radio.addEventListener('change', () => {
          selectedAmount = choice.value;
        });

        amountBox.append(h('label', { class: 'choice' },
          radio,
          h('span', { class: 'choice__body' },
            h('strong', { text: choice.label }),
            h('span', { class: 'pay-amount', text: rupiah(choice.value) }),
          ),
        ));
      });

      let detailSequence = 0;

      const updateMethod = async () => {
        const sequence = ++detailSequence;
        const method = methods.find((m) => m.method === selectedMethod);
        detailBox.replaceChildren(paymentDetails(method));
        if (sequence !== detailSequence) return;
      };

      methods.forEach((method, index) => {
        const radio = h('input', {
          type: 'radio',
          name: `payment-method-${transactionId}`,
          value: method.method,
          checked: index === 0,
        });
        radio.addEventListener('change', () => {
          selectedMethod = method.method;
          updateMethod();
        });
        methodBox.append(h('label', { class: 'choice payment-method-choice' },
          radio,
          h('span', { class: 'choice__body' },
            h('strong', { text: METHOD_LABEL[method.method] ?? method.method }),
            h('span', { class: 'meta', text: method.method === 'qris' ? 'Bayar dengan kode QR' : 'Pembayaran manual' }),
          ),
        ));
      });

      await updateMethod();

      fileInput.addEventListener('change', () => {
        // File baru membutuhkan upload dan identitas file baru.
        uploadedProof = null;
        errorBox.replaceChildren();
      });

      const instructions = h('div', { class: 'notice' },
        data.instructionsText || 'Ikuti instruksi pembayaran berikut.',
      );

      const deadline = data.paymentDeadline
        ? h('p', {
            class: 'meta',
            text: `Batas pembayaran: ${new Date(data.paymentDeadline).toLocaleString('id-ID', {
              dateStyle: 'long',
              timeStyle: 'short',
              timeZone: 'Asia/Jakarta',
            })}`,
          })
        : null;

      panel.classList.remove('payment-panel--intro');
      panel.replaceChildren(
        h('div', { class: 'payment-panel__heading' },
          h('p', { class: 'eyebrow', text: 'Tahap pembayaran' }),
          h('h3', { class: 'card__title', text: 'Instruksi Pembayaran' }),
          h('p', { class: 'meta', text: isOrder ? `Pesanan ${order.orderNumber}` : `Booking ${booking.bookingNumber}` }),
        ),
        h('div', { class: 'payment-panel__total' },
          h('span', { text: 'Total transaksi' }),
          h('strong', { class: 'pay-amount', text: rupiah(transaction.totalAmount) }),
        ),
        instructions,
        deadline,
        h('div', { class: 'payment-panel__section' },
          h('h4', { text: '01 · Pilih nominal pembayaran' }),
          amountBox,
        ),
        h('div', { class: 'payment-panel__section' },
          h('h4', { text: '02 · Pilih metode pembayaran' }),
          methodBox,
        ),
        detailBox,
        h('div', { class: 'field' },
          h('label', { for: 'payment-proof-file', text: 'Unggah bukti pembayaran' }),
          fileInput,
          h('p', { class: 'meta', text: 'JPG, PNG, WebP, atau AVIF. Maksimal 5 MB.' }),
        ),
        errorBox,
        submitButton,
      );

      submitButton.addEventListener('click', async () => {
        if (submitted || submitButton.disabled) return;

        const file = fileInput.files?.[0];
        const problem = validateProofFile(file);

        if (problem) {
          errorBox.replaceChildren(h('p', {
            class: 'alert',
            role: 'alert',
            text: problem,
          }));
          return;
        }

        submitButton.disabled = true;
        submitButton.textContent = 'Mengirim bukti…';
        errorBox.replaceChildren();

        try {
          const user = await ensureUser();

          if (!auth.currentUser || auth.currentUser.uid !== user.uid) {
            throw new Error('Sesi pelanggan berubah. Muat ulang halaman.');
          }

          // Upload hanya sekali. Jika API gagal setelah upload,
          // percobaan berikutnya memakai path yang sama.
          if (!uploadedProof) uploadedProof = await uploadPrivateProof(file, tenantId);

          const result = await call('submitPaymentProof', {
            tenantId,
            ...(isOrder ? { orderId: transactionId } : { bookingId: transactionId }),
            paymentMethod: selectedMethod,
            proofFileId: uploadedProof.fileId,
            amount: selectedAmount,
          });

          submitted = true;
          statusNode.textContent = 'Menunggu verifikasi pembayaran';
          panel.replaceChildren(
            h('h3', { class: 'card__title', text: 'Bukti pembayaran berhasil dikirim' }),
            h('p', { class: 'notice', text: 'Pembayaran Anda sedang menunggu verifikasi admin. Simpan nomor transaksi untuk referensi.' }),
            h('p', { class: 'meta', text: `Status pembayaran: ${result.paymentStatus}` }),
            h('p', { class: 'meta', text: `${isOrder ? 'Nomor pesanan' : 'Nomor booking'}: ${isOrder ? order.orderNumber : booking.bookingNumber}` }),
          );
        } catch (e) {
          errorBox.replaceChildren(h('p', {
            class: 'alert',
            role: 'alert',
            text: errorMessage(e),
          }));
          submitButton.disabled = false;
          submitButton.textContent = uploadedProof
            ? 'Coba Kirim Ulang'
            : 'Kirim Bukti Pembayaran';
        }
      });
    } catch (e) {
      panel.replaceChildren(
        h('p', { class: 'alert', role: 'alert', text: errorMessage(e) }),
        h('button', {
          type: 'button',
          class: 'btn btn--ghost',
          text: 'Coba Lagi',
          onclick: () => {
            panel.replaceChildren(button);
            button.disabled = false;
            button.textContent = 'Lanjut Pembayaran';
          },
        }),
      );
    }
  });

  return panel;
}
