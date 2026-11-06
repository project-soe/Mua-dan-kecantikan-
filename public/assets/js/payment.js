import { h } from './dom.js';
import { call, ApiError } from './api.js';
import { ensureUser } from './auth.js';
import { auth, storage, ref, uploadBytes, getDownloadURL } from './firebase.js';
import { validateProofFile, proofPath } from './proof.js';
import { rupiah } from './format.js';

const METHOD_LABEL = {
  bank_transfer: 'Transfer bank',
  dana: 'DANA',
  ovo: 'OVO',
  gopay: 'GoPay',
  shopeepay: 'ShopeePay',
  qris: 'QRIS',
};

async function uploadProof(file, tenantId, uid) {
  const path = proofPath(
    tenantId,
    uid,
    file.type,
    crypto.randomUUID(),
  );

  await uploadBytes(ref(storage, path), file, {
    contentType: file.type,
  });

  return path;
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

    getDownloadURL(ref(storage, method.qrImage))
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
    class: 'payment-panel',
    'aria-label': 'Pembayaran booking',
  }, button);

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
      let uploadedPath = null;
      let submitted = false;

      const amountBox = h('div', { class: 'payment-options' });
      const methodSelect = h('select', {
        class: 'input',
        'aria-label': 'Metode pembayaran',
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

      methods.forEach((method) => {
        methodSelect.append(h('option', {
          value: method.method,
          text: METHOD_LABEL[method.method] ?? method.method,
        }));
      });

      let detailSequence = 0;

      const updateMethod = async () => {
        selectedMethod = methodSelect.value;
        const sequence = ++detailSequence;
        const method = methods.find((m) => m.method === selectedMethod);
        detailBox.replaceChildren(paymentDetails(method));

        if (sequence !== detailSequence) return;
      };

      methodSelect.addEventListener('change', updateMethod);
      await updateMethod();

      fileInput.addEventListener('change', () => {
        // File baru memerlukan path baru karena Storage bersifat create-only.
        uploadedPath = null;
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

      panel.replaceChildren(
        h('h3', { class: 'card__title', text: 'Instruksi Pembayaran' }),
        h('p', { class: 'pay-amount', text: rupiah(transaction.totalAmount) }),
        instructions,
        deadline,
        h('h4', { text: 'Pilih nominal pembayaran' }),
        amountBox,
        h('h4', { text: 'Pilih metode pembayaran' }),
        methodSelect,
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
          if (!uploadedPath) {
            uploadedPath = await uploadProof(file, tenantId, user.uid);
          }

          const result = await call('submitPaymentProof', {
            tenantId,
            ...(isOrder ? { orderId: transactionId } : { bookingId: transactionId }),
            paymentMethod: selectedMethod,
            proofStoragePath: uploadedPath,
            amount: selectedAmount,
          });

          submitted = true;
          statusNode.textContent = 'Menunggu verifikasi pembayaran';
          panel.replaceChildren(
            h('h3', { class: 'card__title', text: 'Bukti pembayaran berhasil dikirim' }),
            h('p', { class: 'notice', text: 'Pembayaran Anda sedang menunggu verifikasi admin. Simpan nomor booking untuk referensi.' }),
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
          submitButton.textContent = uploadedPath
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
