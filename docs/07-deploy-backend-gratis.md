# Deployment backend gratis — Render

## Keputusan tahap awal

Backend Express Mua Putri disiapkan untuk Render Web Service paket Free di region Singapore. Firebase Authentication, Firestore, dan ImageKit tetap menjadi layanan data/media; Render hanya menjalankan API Express.

Konfigurasi Blueprint ada di `render.yaml`:
- Runtime Node.js, mengikuti `engines.node` pada `package.json`.
- Build: `npm install`.
- Start: `npm start`.
- Health check: `/api/health`.
- Branch: `setup/firebase-imagekit-mua-and-beauty`.
- Environment production mengarah ke Firebase project `mua-and-beauty`.
- Firebase Admin credential dibaca dari Secret File, bukan dari repository.

## Langkah yang perlu dilakukan di akun Render

1. Login ke Render dan hubungkan GitHub account yang memiliki akses ke `project-soe/Mua-dan-kecantikan-`.
2. Buka **New → Blueprint** dan pilih repository serta branch `setup/firebase-imagekit-mua-and-beauty`.
3. Render membaca `render.yaml`. Pastikan service `mua-putri-api` memakai plan **Free** dan region **Singapore**.
4. Saat diminta, isi tiga nilai ImageKit:
   - `IMAGEKIT_PUBLIC_KEY`
   - `IMAGEKIT_PRIVATE_KEY`
   - `IMAGEKIT_URL_ENDPOINT`
5. Buat Secret File pada service melalui **Environment → Secret Files**:
   - Filename: `firebase-admin.json`
   - Contents: isi JSON service account Firebase Admin SDK untuk project `mua-and-beauty`.
   - Path yang akan dipasang Render: `/etc/secrets/firebase-admin.json`.
6. Jangan memasukkan isi JSON service account ke GitHub, issue, log, atau chat. Jangan membuat environment variable berisi private key jika Secret File tersedia.
7. Jalankan deploy. Tunggu status **Live** dan pastikan health check berhasil.
8. Catat URL HTTPS service, misalnya format `https://mua-putri-api.onrender.com`. Jangan menganggap URL contoh ini sudah aktif.
9. Uji endpoint `/api/health`; respons yang diharapkan adalah JSON `{"ok":true}`.
10. Setelah URL backend diverifikasi, ubah `apiBase` pada `public/assets/js/firebase-config.js` menjadi URL HTTPS tersebut tanpa slash akhir. Tambahkan commit terpisah dan deploy frontend Firebase Hosting setelah pengujian API.
11. Pastikan CORS hanya memuat origin frontend resmi. Bila domain aktual berbeda, perbarui `ALLOWED_ORIGINS` di Render Environment dan redeploy.

## Kompromi paket Free — wajib dipahami

Render Free bukan hosting produksi dengan uptime terjamin. Batasan resmi yang memengaruhi aplikasi:

- Service tidur setelah 15 menit tanpa trafik masuk. Request pertama setelah tidur dapat memerlukan sekitar satu menit untuk membangunkan server.
- Maksimal 750 jam instance gratis per workspace per bulan; jika kuota habis, service gratis dapat disuspend sampai bulan berikutnya.
- Instance dapat direstart oleh platform kapan saja.
- Filesystem bersifat ephemeral dan tidak boleh digunakan untuk menyimpan upload, database, atau data transaksi. Mua Putri sudah menggunakan Firestore dan ImageKit untuk itu.
- Tidak ada persistent disk, SSH/shell dashboard, scaling multi-instance, atau one-off jobs pada paket Free.
- Kapasitas instance terbatas (512 MB RAM dan CPU kecil); pantau log dan penggunaan resource.
- Render menyatakan paket Free ditujukan untuk eksperimen/hobi dan tidak direkomendasikan untuk aplikasi produksi.

### Dampak pada expiry worker

Backend menjalankan expiry worker dalam proses Node setiap 60 detik. Pada paket Free, timer hanya berjalan ketika instance hidup. Saat service tidur, sweep booking/order tertunda. Worker melakukan sweep saat startup berikutnya dan kembali berkala ketika proses aktif, tetapi **tidak ada jaminan expiry tepat waktu setiap menit**.

Jangan mengandalkan timer dalam proses sebagai scheduler yang selalu aktif pada hosting gratis. Sebelum menerima pembayaran/booking secara operasional, aturan bisnis harus tetap memvalidasi kedaluwarsa pada saat transaksi dibaca/diubah, atau worker dipindahkan ke scheduler/worker yang selalu aktif. Perubahan arsitektur expiry tersebut belum termasuk dalam konfigurasi deployment ini.

### Dampak bagi pelanggan

- Pengunjung pertama setelah 15 menit idle bisa melihat loading lama atau request timeout.
- Jangan menganggap status booking/order berubah tepat pada detik expiry.
- Hindari mengumumkan API ini sebagai layanan 24/7.
- Data transaksi tidak hilang saat service tidur karena sumber data tetap Firestore; tetapi proses backend tidak tersedia sementara dan timer berhenti.

## Checklist setelah deploy

- [ ] Render service berstatus Live.
- [ ] Secret File Firebase Admin terpasang pada path yang tepat.
- [ ] Tiga kredensial ImageKit tersedia sebagai environment variables.
- [ ] `GET /api/health` mengembalikan HTTP 200.
- [ ] Login/token Firebase dapat diverifikasi oleh backend.
- [ ] Endpoint API dapat membaca Firestore project `mua-and-beauty`.
- [ ] Upload media publik ke ImageKit berhasil.
- [ ] Upload bukti pembayaran tetap private.
- [ ] CORS menolak origin yang tidak diizinkan.
- [ ] `apiBase` frontend hanya diisi setelah URL HTTPS backend benar-benar diketahui.
- [ ] Uji create booking/order, cancel, submit proof, dan verifikasi pembayaran di staging.

## Kapan harus keluar dari paket Free

Upgrade ke always-on service atau pindahkan backend ke VPS sebelum Mua Putri menerima transaksi riil yang membutuhkan respons konsisten, expiry otomatis tepat waktu, dan ketersediaan API yang dapat diandalkan. Render mencantumkan paket web service berbayar mulai sekitar US$7/bulan pada halaman harga saat dokumen ini ditulis; cek harga dashboard sebelum upgrade.
