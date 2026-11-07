# Integrasi media ImageKit

## Arsitektur
- Firebase Spark tetap menangani Firebase Auth dan Firestore. Tidak ada Cloud Functions, Blaze, atau billing Firebase yang diperlukan oleh integrasi ini.
- Media publik berupa foto produk, portfolio, layanan, branding, testimoni, dan QRIS diunggah langsung dari browser ke ImageKit.
- Video portfolio diunggah ke folder tenant `videos`, dibatasi maksimal 3 video per item dan 100 MB per file. Format yang diterima: MP4, WebM, dan MOV.
- Backend Express memverifikasi Firebase ID token + membership tenant, lalu menerbitkan kredensial upload ImageKit berumur 5 menit. Private API key hanya dibaca backend.
- Firestore menyimpan URL HTTPS ImageKit pada field media yang sudah ada. URL lama berbentuk path Firebase Storage tetap dapat dibaca selama masa migrasi.
- Bukti pembayaran menggunakan ImageKit Private Files. Browser hanya menerima token upload terbatas; backend memeriksa metadata file melalui API privat ImageKit, memverifikasi folder tenant + UID pelanggan, MIME, ukuran, dan status privat sebelum menyimpan referensinya ke pembayaran.
- Admin finance melihat bukti melalui endpoint backend yang mengeluarkan signed URL berumur 180 detik. URL privat tidak disimpan di Firestore dan tidak dikirim ke halaman publik.
- Pembayaran lama yang masih menyimpan path Firebase Storage tetap memiliki jalur pembacaan legacy di panel admin.

## Konfigurasi
Isi tiga environment variable pada proses backend:
- `IMAGEKIT_PUBLIC_KEY`
- `IMAGEKIT_PRIVATE_KEY` (rahasia; jangan commit atau kirim lewat chat)
- `IMAGEKIT_URL_ENDPOINT` (contoh format: `https://ik.imagekit.io/ID_MEDIA_LIBRARY`)

Backend harus dijalankan ulang setelah environment variable diisi. Tanpa konfigurasi lengkap, endpoint upload menolak permintaan dengan jelas. Upload menggunakan endpoint HTTPS resmi ImageKit.

## Batasan keamanan
- Upload-auth memerlukan sesi Firebase terautentikasi dan tenant aktif.
- Upload QRIS hanya dapat diminta owner/finance_manager; media publik lain dibatasi owner/admin/content_manager.
- Upload bukti pembayaran hanya tersedia untuk pelanggan terautentikasi dan disimpan di folder yang memuat tenant ID serta UID pelanggan.
- Endpoint penyerahan bukti memeriksa fileId melalui ImageKit API; tidak mempercayai filePath atau URL dari browser.
- Endpoint melihat bukti hanya tersedia untuk peran finance yang berwenang, memeriksa kepemilikan folder, dan mengirim signed URL singkat dengan `Cache-Control: no-store`.
- Server membatasi MIME, ukuran, area, dan folder tenant. Validasi referensi media publik hanya menerima origin ImageKit yang dikonfigurasi dan path folder tenant yang tepat.
- QRIS, foto produk, portfolio, layanan, branding, testimoni, dan video bersifat publik karena memang ditampilkan kepada pengunjung. Jangan unggah dokumen identitas atau data pelanggan melalui helper publik.
- Bukti transaksi tidak boleh diunggah melalui helper publik atau URL biasa. File bukti harus tetap privat.

## Kuota aplikasi
- Gambar publik: maksimal 25 MB sebelum optimasi browser.
- Video: maksimal 100 MB per file.
- Bukti pembayaran: maksimal 5 MB.
Batas aplikasi bukan jaminan kuota akun ImageKit; batas paket/kuota akun tetap berlaku dan dapat berubah. Pantau pemakaian di dashboard ImageKit.
