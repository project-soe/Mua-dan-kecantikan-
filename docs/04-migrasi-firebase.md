# Migrasi Firebase — mua-and-beauty

## Target proyek

- Firebase project ID: `mua-and-beauty`
- Auth domain: `mua-and-beauty.firebaseapp.com`
- Storage bucket: `mua-and-beauty.firebasestorage.app`
- Web app ID: `1:808959175845:web:9e0a00399944c6afdd714c`
- Konfigurasi web diletakkan di `public/assets/js/firebase-config.js`.
- Alias Firebase CLI disetel di `.firebaserc`.

## Perubahan kode dalam migrasi

1. Frontend publik dan panel admin memakai satu konfigurasi web terpusat. Panel admin tetap memakai Firebase app bernama `admin`, tetapi sekarang menunjuk proyek target yang sama.
2. Backend Express memakai `FIREBASE_PROJECT_ID` / `GCLOUD_PROJECT` dan bucket target. Kredensial Admin SDK tidak disimpan di repository.
3. File Rules, indeks Firestore, dan konfigurasi Hosting tetap menjadi sumber konfigurasi deployment.
4. Skrip emulator dan pengujian tetap memakai project demo `demo-mua-putri`; jangan mengubahnya menjadi proyek produksi.

## Wajib diselesaikan di Firebase Console sebelum produksi

- Pastikan proyek `mua-and-beauty` aktif dan aplikasi Web dengan app ID di atas tersedia.
- Buat database Cloud Firestore (Native mode) pada lokasi yang dipilih. Lokasi database tidak dapat diubah setelah dibuat.
- Pastikan bucket Storage `mua-and-beauty.firebasestorage.app` tersedia.
- Aktifkan Authentication: Anonymous untuk pelanggan, Email/Password untuk admin. Tambahkan domain website produksi ke Authorized domains.
- Pastikan akun admin dan membership tenant dibuat pada proyek target. Pengguna Firebase Auth dari proyek lama tidak otomatis ikut berpindah.
- Siapkan service account untuk backend; simpan JSON di server/secret manager, bukan di Git.
- Deploy Firestore Rules, Storage Rules, indeks, dan Hosting dari branch migrasi setelah konfigurasi proyek diverifikasi.
- Deploy backend Express secara terpisah. Setelah URL backend diketahui, isi `apiBase` pada `public/assets/js/firebase-config.js` dan pastikan origin frontend tercantum pada `ALLOWED_ORIGINS`.

## Data dan identitas lama

Mengganti konfigurasi hanya memindahkan koneksi aplikasi; ini **tidak** menyalin data Firestore, file Storage, pengguna Authentication, atau konfigurasi provider dari `kolom-komentar-bfa86`. Sebelum memutus proyek lama:

1. Buat backup/export Firestore dan salin objek Storage yang masih dibutuhkan.
2. Ekspor/import pengguna Authentication dengan prosedur Firebase Admin yang sesuai; UID harus dipertahankan agar relasi dokumen dan membership tetap valid.
3. Salin dokumen tenant, membership, public projection, domain, katalog, booking, order, pembayaran, ulasan, dan data terkait dengan mempertahankan ID dokumen serta referensi Storage yang telah dipetakan.
4. Periksa kembali seluruh URL/path gambar, QRIS, dan bukti pembayaran setelah salin Storage.
5. Jalankan tes Rules dan smoke test pada proyek target sebelum mengalihkan domain/traffic.

Jangan hapus atau menonaktifkan proyek lama sampai backup, validasi jumlah data, login admin, booking, upload gambar, dan alur pembayaran di proyek target berhasil.

## Perintah validasi lokal

```bash
npm ci
npm run check:frontend
npm test
```

Untuk deployment setelah persiapan Console dan backend selesai:

```bash
firebase use mua-and-beauty
firebase deploy --only firestore,storage,hosting
```

Catatan: `apiBase` sengaja belum diisi karena URL hosting backend belum tersedia. Jangan menganggap migrasi produksi selesai sampai API backend terpasang dan diuji.
