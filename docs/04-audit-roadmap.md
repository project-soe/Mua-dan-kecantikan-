# Audit Struktur & Roadmap Lanjutan

Audit dilakukan pada branch `feature/product-store-checkout` tanggal 2026-11-06 berdasarkan struktur repository, API Express, alur booking/toko, Firestore/Storage Rules, test suite, dan dokumentasi. Audit kode bukan pengganti penetration test atau pengujian browser produksi.

## Ringkasan kondisi

Fondasi aplikasi sudah terbentuk:
- Frontend HTML/CSS/ES Modules tanpa proses build.
- Backend Express dengan Firebase Admin SDK.
- Isolasi tenant melalui hostname/domain → tenant.
- Role owner/admin/content_manager/finance_manager.
- Booking dengan slot 15 menit, hold, validasi transaksi, dan tes integrasi.
- Katalog layanan/produk, portfolio, galeri, testimoni, dan admin.
- Toko produk dengan cart, checkout, stok transaksional, kutipan ongkir manual, persetujuan ongkir, pembayaran manual, bukti pembayaran, dan verifikasi.
- Firestore Rules dan Storage Rules default-deny untuk penulisan klien, beserta pengujian emulator.

## Temuan dan prioritas

### P0 — Wajib sebelum produksi

1. **Otomatisasi pekerjaan kedaluwarsa belum terpasang.**
   - `expireStaleBookings` dan `expireStaleOrders` tersedia sebagai endpoint staf, tetapi belum ada scheduler/cron produksi.
   - Dampak: status booking/pesanan lama dapat tertinggal; stok pesanan yang kedaluwarsa dapat tetap tertahan sampai endpoint dipanggil.
   - Tindakan: pilih scheduler terautentikasi (misalnya Cloud Scheduler ke endpoint backend dengan autentikasi service-to-service) atau worker terjadwal yang aman. Jangan membuka endpoint tanpa autentikasi.

2. **Hosting backend dan penyimpanan produksi belum diputuskan.**
   - Firebase Hosting telah dikonfigurasi, tetapi API Express membutuhkan target hosting/proses backend yang stabil.
   - Storage adapter dan kebijakan backup/retensi produksi perlu dipastikan.
   - Tindakan: pilih hosting backend, konfigurasi environment/secret, domain, TLS, CORS allowlist, bucket, backup, dan prosedur pemulihan.

3. **Privasi data pelanggan perlu diperketat.**
   - Firestore Rules saat ini mengizinkan `content_manager` membaca dokumen booking/order yang juga memuat data kontak.
   - Tindakan: evaluasi pemisahan PII (nama/nomor/alamat) ke dokumen terbatas finance/admin, kemudian sesuaikan API dan Rules berdasarkan kebutuhan operasional. Jangan mengurangi akses sebelum UI operasional dipastikan tidak bergantung pada field tersebut.

4. **Verifikasi keamanan pra-produksi.**
   - Rules tests tersedia, tetapi belum menggantikan audit akses lintas tenant, abuse/rate-limit, upload file, CORS, token/session, dan validasi API.
   - Tindakan: tambah tes negatif lintas tenant/role, batas request, file palsu/ukuran, replay/idempotency, serta checklist secret dan konfigurasi Firebase produksi.

### P1 — Pengalaman pelanggan dan konversi

5. **Akun pelanggan dan pemulihan riwayat.**
   - Pelanggan saat ini dapat menggunakan Firebase Anonymous Auth. Riwayat terikat pada UID/perangkat/sesi.
   - Tindakan: tambahkan opsi tautkan akun tamu ke email/password atau provider lain tanpa kehilangan UID dan transaksi, plus pemulihan akun dan kebijakan privasi.

6. **Pengiriman dan fulfillment produk.**
   - Ongkir masih `manual_quote`; belum ada integrasi kurir/resi/tracking dan jam toko belum membatasi pesanan.
   - Tindakan: pertahankan manual quote untuk MVP, lalu tambah status fulfillment, input resi, notifikasi, dan opsi kurir setelah aturan ongkir disepakati.

7. **Notifikasi transaksi.**
   - WhatsApp menjadi bagian rencana operasional, tetapi perlu template dan event yang konsisten.
   - Tindakan: notifikasi booking dibuat, dikonfirmasi, pembayaran diterima/ditolak, ongkir ditetapkan, pesanan diproses/dikirim. Gunakan link WhatsApp sebagai tahap awal; integrasi WhatsApp Business API dapat menyusul.

8. **SEO dan tautan berbagi.**
   - Metadata beranda dinamis lewat JavaScript; halaman per item/OG server-rendered, sitemap, robots, canonical, dan structured data belum terbukti tersedia.
   - Tindakan: buat endpoint HTML/share untuk produk, layanan, portfolio; metadata Open Graph/Twitter, canonical, sitemap.xml, robots.txt, dan JSON-LD LocalBusiness/Product/Service.

### P2 — Operasional dan kualitas produk

9. **Admin dan operasional.**
   - Lengkapi laporan penjualan/booking, filter status/tanggal, ekspor, riwayat audit, pengelolaan pelanggan, dan ringkasan stok.
10. **Manajemen media.**
    - Ada thumbnail/optimized/original, tetapi pembersihan file yatim dan kebijakan retensi perlu dirancang.
11. **Kualitas frontend.**
    - Tambah browser smoke test untuk mobile/desktop, aksesibilitas keyboard, reduced motion, empty/loading/error state, serta performa gambar/font.
12. **Konsistensi dokumentasi.**
    - `docs/02-keputusan.md` memuat beberapa catatan historis yang menyebut checkout/pembayaran belum ada. Perbarui bagian historis atau beri penanda superseded agar tidak menjadi instruksi yang menyesatkan.

## Urutan eksekusi yang disarankan

| Urutan | Pekerjaan | Kriteria selesai |
|---|---|---|
| 1 | CI GitHub Actions | Frontend check, unit, Rules, integration otomatis pada push/PR |
| 2 | Cron/worker kedaluwarsa | Booking/order kedaluwarsa diproses aman, tercatat, dan tidak double-restock |
| 3 | PII dan isolasi tenant | Tes negatif lintas tenant/role lulus; akses kontak minimum |
| 4 | Browser smoke tests | Alur booking dan toko diuji di mobile & desktop |
| 5 | Akun pelanggan | Tautkan akun tamu tanpa kehilangan riwayat |
| 6 | SEO/share | Preview tautan produk/layanan/portfolio benar di WhatsApp dan crawler |
| 7 | Produksi | Hosting, storage, domain, secret, backup, monitoring, restore diuji |
| 8 | Fulfillment dan laporan | Pengiriman, notifikasi, laporan dan ekspor siap operasional |

## Catatan eksekusi

- Workflow CI pertama ditambahkan pada `.github/workflows/ci.yml`.
- Workflow menjalankan `npm ci`, `npm run check:frontend`, `npm run test:unit`, `npm run test:rules`, dan `npm run test:integration`.
- Status lulus/gagal CI harus dibaca dari GitHub Actions setelah workflow berjalan. Pembuatan workflow bukan bukti tes sudah lulus.
- Tidak ada merge ke `main` atau deployment yang dilakukan dalam audit ini.
