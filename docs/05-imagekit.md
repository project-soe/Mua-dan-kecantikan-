# Integrasi media ImageKit

## Keputusan produksi
- ImageKit adalah satu-satunya penyimpanan binary media produksi.
- Firebase Authentication dan Cloud Firestore tetap digunakan.
- Firebase Storage tidak digunakan oleh runtime produksi, tidak perlu mengaktifkan bucket, dan tidak perlu mengaktifkan paket Blaze untuk kebutuhan media.
- Firebase Storage Rules serta emulator tetap berada di repository hanya untuk pengujian keamanan Rules yang sudah ada.
- Tidak ada Cloud Functions pada arsitektur ini. Backend memakai Express terpisah.

## Arsitektur media
- Foto produk, portfolio, layanan, branding, testimoni, QRIS, dan video portfolio diunggah langsung dari browser ke ImageKit.
- Backend Express memverifikasi Firebase ID token dan membership tenant, lalu menerbitkan kredensial upload ImageKit berumur 5 menit.
- Private API key hanya tersedia pada environment backend.
- Firestore menyimpan URL ImageKit untuk media publik.
- Bukti pembayaran menggunakan ImageKit Private Files. Browser mengirim file ID; backend memeriksa metadata melalui API privat, memastikan folder tenant dan UID pelanggan, MIME, ukuran, serta status private.
- Admin finance melihat bukti melalui endpoint backend yang menerbitkan signed URL berumur 180 detik dengan `Cache-Control: no-store`.
- QRIS wajib berupa URL HTTPS ImageKit yang berada di folder `/tenants/{tenantId}/payment-methods/`.

## Konfigurasi backend
Isi tiga environment variable berikut pada server backend:
- `IMAGEKIT_PUBLIC_KEY`
- `IMAGEKIT_PRIVATE_KEY` — rahasia, jangan commit atau kirim melalui chat.
- `IMAGEKIT_URL_ENDPOINT` — contoh format `https://ik.imagekit.io/ID_MEDIA_LIBRARY`.

Backend harus dijalankan ulang setelah environment diubah. Tanpa konfigurasi lengkap, endpoint upload menolak permintaan dengan jelas.

## Folder tenant
- `/tenants/{tenantId}/products`
- `/tenants/{tenantId}/portfolio`
- `/tenants/{tenantId}/services`
- `/tenants/{tenantId}/branding`
- `/tenants/{tenantId}/reviews`
- `/tenants/{tenantId}/payment-methods`
- `/tenants/{tenantId}/videos`
- `/tenants/{tenantId}/payment-proofs/{customerUid}`

## Batasan dan keamanan
- Upload bukti pembayaran hanya untuk pelanggan terautentikasi dan wajib menjadi Private File.
- Upload QRIS hanya untuk owner/finance_manager; media publik lain dibatasi owner/admin/content_manager.
- File bukti tidak boleh disajikan melalui helper publik atau URL biasa.
- Validasi QRIS/media publik memeriksa origin ImageKit yang dikonfigurasi dan prefix folder tenant.
- Jangan unggah dokumen identitas atau data pelanggan melalui helper media publik.
- Batas aplikasi: gambar 25 MB, video 100 MB, bukti pembayaran 5 MB. Kuota akun ImageKit tetap mengikuti paket akun dan harus dipantau.
- Siapkan kebijakan retensi dan pembersihan file yatim sebelum operasional skala besar.
