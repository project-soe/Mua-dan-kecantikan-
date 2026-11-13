# Setup Firebase + ImageKit — mua-and-beauty

Dokumen ini adalah checklist setup layanan produksi. Jangan deploy ke produksi sebelum semua tes dan pemeriksaan pada bagian akhir lulus.

## 1. Target layanan

### Firebase
- Project ID: `mua-and-beauty`
- Auth domain: `mua-and-beauty.firebaseapp.com`
- Produk: Firebase Authentication, Cloud Firestore, dan Firebase Hosting.
- Firebase Storage tidak digunakan untuk media produksi; emulator dan Rules tetap dipertahankan hanya untuk tes keamanan.

### ImageKit
- File publik: foto produk, layanan, portfolio, branding, testimoni, QRIS, video portfolio.
- File privat: bukti pembayaran pelanggan.
- Firestore menyimpan URL/path dan metadata file; binary media disimpan di ImageKit.
- Private API key hanya boleh ada di environment backend.

## 2. Setup Firebase Console

1. Masuk ke Firebase Console dan pilih proyek `mua-and-beauty`.
2. Pastikan Project ID tepat. Jangan membuat proyek kedua dengan nama mirip.
3. Buka Authentication → Get started → Sign-in method.
4. Aktifkan **Anonymous** untuk sesi pelanggan tamu.
5. Aktifkan **Email/Password** untuk admin. Verifikasi email harus diwajibkan pada alur admin.
6. Buka Authentication → Settings → Authorized domains. Tambahkan domain produksi yang akan digunakan, misalnya `mua-putri.id` dan `www.mua-putri.id`, setelah domain benar-benar dimiliki dan diarahkan ke Hosting.
7. Buka Firestore Database → Create database. Pilih lokasi yang sesuai dengan kebutuhan pengguna dan latensi. Lokasi database tidak dapat diganti setelah dibuat; tentukan sebelum membuat database.
8. Pilih production mode. Rules dari repository akan dideploy setelah tes emulator lulus.
10. Buka Project settings → General → Your apps. Pastikan aplikasi Web memakai konfigurasi proyek target yang sudah ada di `public/assets/js/firebase-config.js`.
11. Aktifkan Firebase Hosting dan hubungkan domain setelah pengujian staging.

**Penting:** jangan mengaktifkan Cloud Functions. Backend aplikasi memakai Express terpisah; Firebase Admin SDK berjalan di proses backend. Jangan mengaktifkan Blaze hanya karena ada panduan Firebase Functions.

## 3. Service account untuk Express

1. Firebase Console → Project settings → Service accounts.
2. Generate private key untuk service account Admin SDK hanya jika backend hosting memerlukan file key.
3. Simpan JSON langsung ke secret manager atau server backend. Jangan unggah ke GitHub, jangan taruh di folder `public/`, dan jangan kirim file atau isinya melalui chat.
4. Atur environment backend:
   - `FIREBASE_PROJECT_ID=mua-and-beauty`
   - `GOOGLE_APPLICATION_CREDENTIALS=/path/yang/aman/service-account.json`
5. Gunakan service account dengan akses minimum yang dibutuhkan. Batasi akses dashboard dan rotasi key bila pernah terekspos.
6. Pastikan server backend memakai Node.js versi sesuai `package.json`.

Jika platform hosting mendukung Application Default Credentials/service identity, utamakan identitas layanan bawaan daripada mengunggah JSON key.

## 4. Setup ImageKit

1. Login ke ImageKit dan pilih Media Library yang akan dipakai.
2. Buka Developer options/API keys (nama menu dapat berubah).
3. Salin **Public Key**, **Private Key**, dan **URL Endpoint**.
4. Atur environment backend:
   - `IMAGEKIT_PUBLIC_KEY`
   - `IMAGEKIT_PRIVATE_KEY`
   - `IMAGEKIT_URL_ENDPOINT`
5. Private key tidak boleh masuk ke frontend, Firebase config, repository, screenshot publik, atau chat.
6. Pastikan kuota paket cukup. Batas aplikasi saat ini: gambar 25 MB sebelum optimasi browser, video 100 MB, bukti pembayaran 5 MB.
7. Buat kebijakan folder dan retensi. Aplikasi menggunakan folder tenant:
   - `/tenants/{tenantId}/products`
   - `/tenants/{tenantId}/portfolio`
   - `/tenants/{tenantId}/services`
   - `/tenants/{tenantId}/branding`
   - `/tenants/{tenantId}/reviews`
   - `/tenants/{tenantId}/payment-methods`
   - `/tenants/{tenantId}/videos`
   - `/tenants/{tenantId}/payment-proofs/{customerUid}`
8. Bukti pembayaran harus diunggah sebagai Private File. Jangan pernah mengubahnya menjadi file publik.

## 5. Environment backend

Salin `.env.example` ke environment lokal/hosting (jangan commit file `.env`). Isi:
- Firebase project ID.
- Kredensial Admin SDK melalui secret manager atau file di luar repository.
- ImageKit public/private key dan URL endpoint.
- `ALLOWED_ORIGINS` dengan origin frontend yang benar-benar digunakan.

Contoh origin:
- `https://mua-putri.id`
- `https://www.mua-putri.id`

Jangan menambahkan wildcard `*` pada CORS produksi. Setelah backend deploy dan endpoint health berhasil diuji, masukkan URL API ke `apiBase` di `public/assets/js/firebase-config.js` (tanpa slash di akhir), lalu deploy ulang Hosting. Jangan deploy frontend produksi selama `apiBase` masih kosong.

## 6. Migrasi data dari Firebase lama

1. Jangan hapus atau ubah proyek lama `kolom-komentar-bfa86`.
2. Inventarisasi koleksi Firestore, pengguna Authentication, media ImageKit/legacy bila ada, domain, dan konfigurasi pembayaran.
3. Tentukan data yang benar-benar perlu dipindahkan. Jangan menyalin data uji/sampah ke produksi.
4. Ekspor Firestore lama dan buat backup yang dapat dipulihkan sebelum impor.
5. Pertahankan UID Firebase Auth jika memungkinkan. Membership, customer profile, booking, order, dan payment merujuk UID; mengganti UID tanpa pemetaan akan memutus relasi.
6. Salin file media lama ke ImageKit bila diperlukan. Simpan pemetaan path lama → URL/path ImageKit dan perbarui referensi Firestore secara terkontrol.
7. Periksa ulang status consent foto model/portfolio sebelum menjadikannya publik.
8. Uji hasil migrasi pada staging sebelum mengubah domain produksi.

Migrasi Firestore lintas project dan Auth user import memerlukan kredensial Admin SDK yang sah untuk kedua proyek. Prosedur aktual harus disesuaikan dengan lokasi Firestore, ukuran data, dan kemampuan mempertahankan UID. Jangan jalankan perintah impor sebelum backup diverifikasi.

## 7. Checklist verifikasi sebelum produksi

- [ ] Project ID cocok dengan proyek target.
- [ ] Backend Express memiliki hosting Node.js persisten dan URL HTTPS yang dapat dijangkau.
- [ ] Anonymous Auth dan Email/Password aktif.
- [ ] Domain frontend terdaftar di Authorized domains.
- [ ] Firestore database sudah dibuat pada lokasi yang disetujui.
- [ ] Firestore Rules dan indexes lolos tes emulator.
- [ ] ImageKit public key, private key, dan endpoint tersedia di backend.
- [ ] Tidak ada private key/service-account JSON di Git.
- [ ] Upload foto publik berhasil dan URL dapat dibuka.
- [ ] Upload bukti pembayaran menghasilkan Private File.
- [ ] Pengguna biasa tidak dapat melihat bukti pembayaran milik pelanggan lain.
- [ ] Admin finance dapat melihat bukti melalui signed URL yang kedaluwarsa.
- [ ] Backend CORS hanya mengizinkan domain frontend resmi.
- [ ] Login admin, input produk, booking, checkout, dan pembayaran diuji.
- [ ] Backup dan prosedur restore sudah diuji.
- [ ] Domain lama dan project lama tetap tersedia sampai cutover dinyatakan sukses.

## 8. Data yang dibutuhkan untuk melanjutkan setup

Pemilik proyek perlu melakukan sendiri tindakan yang memerlukan login atau akses rahasia di Firebase Console, ImageKit, dan hosting. Kirim hanya status selesai atau nilai non-rahasia yang diminta; jangan kirim password, private key, service account JSON, token, atau file credential ke chat.
