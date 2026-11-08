# Deploy backend Express ke Render Free

Dokumen ini menyiapkan backend API Express agar dapat dijalankan di Render tanpa Firebase Cloud Functions atau Cloud Run.

## Konfigurasi yang sudah disiapkan

- Blueprint `render.yaml` membuat satu Web Service dengan paket compute `free`, region Singapore, perintah build `npm ci`, dan start `npm start`.
- Health check menggunakan `/api/health`.
- Server Express bind ke `0.0.0.0` dan membaca port dari `PORT` yang disediakan Render.
- Firebase Admin memakai Application Default Credentials melalui secret file; tidak ada service-account JSON di Git.
- ImageKit credentials dan CORS origins dimasukkan sebagai environment variables rahasia di dashboard.

## Peringatan biaya — wajib dibaca

Render Free memiliki biaya compute $0, tetapi bukan jaminan tanpa biaya dalam semua keadaan. Dokumentasi Render menyatakan pemakaian outbound bandwidth di atas kuota yang disertakan dapat ditagihkan sebagai supplementary usage. Free web service juga tidur setelah 15 menit tanpa trafik, memiliki 750 jam instance per workspace per bulan, dan dapat dibatasi/dihentikan ketika kuota tertentu habis.

Karena keputusan proyek adalah tidak memakai layanan berbayar:
1. Jangan memilih paket selain **Free**.
2. Jangan memasukkan atau menghubungkan kartu/metode pembayaran.
3. Periksa halaman Billing/Usage sebelum dan sesudah deploy.
4. Pantau outbound bandwidth. Jika akun mengharuskan metode pembayaran atau berisiko menimbulkan tagihan, jangan lanjutkan deploy.
5. Jangan meng-upgrade service/workspace ketika kuota habis. Hentikan service sampai kuota reset atau sampai ada keputusan baru.

Render sendiri menyatakan Free services ditujukan untuk eksperimen/hobi, bukan aplikasi produksi. Ini hanya backend MVP sementara.

## Langkah di dashboard Render

1. Buka https://dashboard.render.com/ dan masuk ke akun.
2. Pilih **New → Blueprint**.
3. Hubungkan GitHub, pilih repository `project-soe/Mua-dan-kecantikan-` dan branch `deploy/render-free`.
4. Render membaca `render.yaml`. Pastikan service bernama `mua-putri-api` dan compute plan tetap **Free**.
5. Saat diminta, isi environment variables berikut:
   - `ALLOWED_ORIGINS`: sudah ditetapkan pada Blueprint menjadi `https://mua-putri.id,https://www.mua-putri.id`. Jangan masukkan URL API Render di sini.
   - `IMAGEKIT_PUBLIC_KEY`: Public Key dari ImageKit.
   - `IMAGEKIT_PRIVATE_KEY`: Private Key dari ImageKit. Rahasia; masukkan hanya di dashboard Render.
   - `IMAGEKIT_URL_ENDPOINT`: URL endpoint ImageKit, misalnya `https://ik.imagekit.io/ID_MEDIA_LIBRARY`.
6. Sebelum deploy, buka pengaturan Environment service dan tambahkan **Secret File**:
   - Filename: `firebase-admin.json`
   - Contents: isi file service-account JSON Firebase Admin milik proyek `kolom-komentar-bfa86`, langsung dari file lokal yang tersimpan aman. Jangan commit file ini, jangan mengirimkannya lewat chat, dan jangan menaruhnya ke variabel publik.
   - Render akan memasangnya di `/etc/secrets/firebase-admin.json`, sesuai environment variable `GOOGLE_APPLICATION_CREDENTIALS` yang telah disiapkan.
7. Pastikan region Singapore dan plan Free. Lanjutkan hanya jika tidak ada kewajiban memasukkan metode pembayaran dan tidak ada risiko tagihan yang tidak disetujui.
8. Setelah deploy berhasil, salin URL `https://mua-putri-api.onrender.com` yang benar-benar diberikan Render. Jangan menebak nama/URL; nama subdomain dapat berubah jika sudah dipakai.
9. Tes endpoint health secara manual melalui browser: `https://URL-AKTUAL-RENDER/api/health`. Respons yang diharapkan: `{"ok":true}`.

## Environment variables

| Key | Sumber |
|---|---|
| `NODE_ENV` | Disetel oleh Blueprint ke `production` |
| `GCLOUD_PROJECT` | Disetel ke `kolom-komentar-bfa86` |
| `FIREBASE_PROJECT_ID` | Disetel ke `kolom-komentar-bfa86` |
| `STORAGE_BUCKET` | Disetel ke bucket proyek Firebase |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path secret file Render |
| `ALLOWED_ORIGINS` | Diisi manual berdasarkan origin frontend |
| `IMAGEKIT_PUBLIC_KEY` | Diisi dari ImageKit |
| `IMAGEKIT_PRIVATE_KEY` | Diisi dari ImageKit; rahasia |
| `IMAGEKIT_URL_ENDPOINT` | Diisi dari ImageKit |

## Setelah backend aktif

Frontend sudah diarahkan ke `https://mua-putri-api.onrender.com` melalui `public/assets/js/firebase-config.js`. Origin CORS yang diizinkan adalah `https://mua-putri.id` dan `https://www.mua-putri.id`. Alias proyek Firebase default berada di `.firebaserc` dengan project ID `kolom-komentar-bfa86`.

Untuk menerbitkan frontend, dari direktori repo jalankan `firebase deploy --only hosting --project kolom-komentar-bfa86` setelah memastikan Firebase CLI login ke akun yang memiliki akses. Perintah ini menerbitkan isi folder `public` ke Firebase Hosting; jalankan hanya setelah memeriksa perubahan yang akan diterbitkan. Domain kustom harus sudah berstatus Connected di Firebase Hosting. Jangan mengubah DNS berdasarkan tebakan; gunakan record yang ditampilkan wizard Firebase.

## Batasan operasional

- Free web service dapat tidur setelah 15 menit idle; request pertama setelah tidur dapat memerlukan sekitar satu menit untuk bangun.
- Filesystem Render Free bersifat ephemeral. Backend tidak boleh menyimpan upload atau data persisten di disk lokal.
- Firebase Authentication dan Firestore tetap memakai Firebase Spark. Jangan mengaktifkan Blaze.
- ImageKit tetap memiliki kuota akun sendiri; pantau pemakaiannya di dashboard ImageKit.
- Firebase Storage bukan tempat upload baru pada arsitektur ini; media baru menggunakan ImageKit.
