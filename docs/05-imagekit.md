# Integrasi media ImageKit

## Arsitektur
- Firebase Spark tetap menangani Firebase Auth dan Firestore. Tidak ada Cloud Functions, Blaze, atau billing Firebase yang diperlukan oleh integrasi ini.
- Foto publik untuk produk, portfolio, layanan, branding, testimoni, dan QRIS diunggah langsung dari browser ke ImageKit.
- Backend Express memverifikasi Firebase ID token + membership tenant, lalu menerbitkan kredensial upload ImageKit berumur 5 menit. Private API key hanya dibaca backend.
- Firestore menyimpan URL HTTPS ImageKit pada field media yang sudah ada. URL lama berbentuk path Firebase Storage tetap dapat dibaca.
- Video didukung oleh helper `uploadVideo()` dengan batas prototipe 100 MB dan folder tenant `videos`.

## Konfigurasi
Isi tiga environment variable pada proses backend:
- `IMAGEKIT_PUBLIC_KEY`
- `IMAGEKIT_PRIVATE_KEY` (rahasia; jangan commit atau kirim lewat chat)
- `IMAGEKIT_URL_ENDPOINT` (contoh format: `https://ik.imagekit.io/ID_MEDIA_LIBRARY`)

Backend harus dijalankan ulang setelah environment variable diisi. Tanpa konfigurasi lengkap, endpoint upload menolak permintaan dengan jelas. Upload menggunakan endpoint HTTPS resmi ImageKit.

## Batasan keamanan
- Upload-auth memerlukan sesi Firebase terautentikasi dan membership tenant aktif.
- QRIS hanya dapat meminta otorisasi upload untuk owner/finance_manager; area media lain dibatasi owner/admin/content_manager.
- Server membatasi MIME, ukuran, area, dan folder tenant yang diberikan kepada UI. Validasi backend atas referensi media hanya menerima origin endpoint ImageKit yang dikonfigurasi dan path folder tenant yang tepat.
- URL produk/portfolio/layanan/branding/testimoni/QRIS bersifat publik karena memang ditampilkan kepada pengunjung. Jangan unggah dokumen identitas, data pelanggan, atau bukti pembayaran melalui helper publik ini.
- Bukti pembayaran tetap memakai Firebase Storage privat dan aturan akses yang sudah ada. Ini disengaja: bukti transaksi tidak boleh disimpan sebagai file publik. Untuk memindahkannya ke ImageKit private files diperlukan alur private delivery bertanda tangan dan migrasi kontrak payment yang terpisah.
- Video upload helper tersedia, tetapi belum ada field video di formulir katalog/portfolio atau komponen pemutar di halaman publik. Jangan menganggap video sudah tampil di situs sampai UI video dirangkai pada tahap berikutnya.

## Kuota
Batas upload aplikasi adalah 25 MB untuk gambar dan 100 MB untuk video. Batas ini bukan jaminan kuota akun ImageKit; batas paket/kuota akun tetap berlaku dan dapat berubah. Pantau pemakaian di dashboard ImageKit.
