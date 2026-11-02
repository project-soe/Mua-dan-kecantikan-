# Keputusan & Perubahan dari Spesifikasi v1.1

1. Cloud Functions diganti backend Express (firebase-admin). Alasan: Functions butuh paket
   berbayar. Kontrak API tetap. Logika dipisah dari HTTP agar bisa dibungkus Functions lagi.
2. Status disatukan.
   - Order: pending, awaiting_payment, payment_verification, paid, processing, shipped,
     delivered, completed, cancelled, refunded.
   - Booking: pending, awaiting_payment, payment_verification, confirmed, in_progress,
     completed, cancelled, rejected.
   - Dokumen payment: awaiting_payment, submitted, verified, rejected, refunded.
   - Field paymentStatus (order/booking): unpaid, partially_paid, paid, failed, refunded.
   - Shipment: terpisah (quote_requested ... returned).
3. Peran `customer` bukan membership. Pelanggan di `customers/{uid}`.
   Peran tenant: owner, admin, content_manager, finance_manager.
4. Tambahan koleksi: `shippingQuotes`. Tambahan fungsi: setTenantStatus,
   updatePaymentSettings, registerCustomerProfile.
5. Tambahan skema: seoTitle, seoDescription, shareImage (portfolio/produk/layanan);
   consentStatus (models).
6. Penyimpanan gambar lewat adapter. Pilihan produksi (gratis) diputuskan di Phase 6.
7. Matriks akses: peran Admin ditambahkan (operasional, tanpa akses finansial penuh).
8. Keunikan SKU/slug dijaga dokumen `tenants/{id}/uniqueKeys/{kunci}` yang dibuat dalam transaksi
   (koleksi tambahan di luar spesifikasi; tak bisa diakses klien). Dipakai ulang untuk kode voucher.
9. Produk selalu dibuat draft; publish lewat publishProduct (wajib coverImage). Stok hanya berubah
   lewat delta (tidak boleh negatif). `variants` ditunda sampai createOrder.
10. Handler menolak field yang tidak dikenal; gambar hanya boleh dari folder tenant sendiri.
11. deleteProduct ditunda sampai ada cek referensi ke pesanan.
12. Kategori portfolio memakai `serviceCategories` (satu daftar jenis layanan: bridal, party, dst).
13. Portfolio: publish wajib `consentConfirmed` (konfirmasi admin atas izin foto model),
    before/after berpasangan. Mencabut persetujuan harus setelah unpublish.
    `modelId` & koleksi `models` ditunda sampai ada manajemen model; `reorderPortfolio`
    ditunda (urutan lewat field `sortOrder` di updatePortfolio).
14. Kategori memakai slug nama sebagai ID dokumen (nama kembar ditolak).
15. deleteService / deletePortfolio ditunda (butuh cek referensi booking & media).
16. Booking: slot ditahan di `bookingSlots/{tanggal_HHMM}` per 15 menit; field `holds`
    {bookingId: kedaluwarsaMs|null}. Kapasitas (booking bersamaan) per tenant di
    settings/businessHours. Blok tahan = durasi + waktu persiapan, dibulatkan ke 15 menit.
17. Kedaluwarsa "lazy": tahanan yang lewat waktu otomatis dianggap kosong saat cek/buat booking.
    `expireStaleBookings` hanya menyinkronkan status; perlu dipanggil berkala (cron) di Phase 6.
18. Pelanggan cukup login Firebase (anonymous boleh). Maksimal 3 booking menunggu per pelanggan.
    Booking baru: `awaiting_payment` bila ada deposit, `pending` bila deposit 0.
19. Saat bukti bayar dikirim (Phase 4 pembayaran) tahanan harus dijadikan permanen (null)
    agar tidak kedaluwarsa selama verifikasi. confirmBooking juga memermanenkan tahanan.
20. Pembatalan: pelanggan tidak bisa membatalkan booking terkonfirmasi di dalam
    `cancelCutoffHours`; staf selalu bisa. Refund belum diproses; ditandai `refundReview`.
21. Penomoran booking `BK-000001` lewat counters/bookings (tidak terbaca klien).
22. Catatan skala: pencarian jam kosong memakai satu query per tanggal; memadai untuk 1 tenant kecil.
23. BUG DIPERBAIKI: confirmBooking menganggap tahanan sah bila ID booking ada di `holds` walau sudah
    kedaluwarsa, sehingga bisa terjadi double booking. Aturan benar: kapasitas dihitung dari tahanan
    AKTIF milik booking lain (activeCount(holds, now, bookingId) < capacity).
24. Pembayaran: tujuan transfer (paymentPublic) hanya dikirim ke pemilik booking yang sedang wajib
    bayar. updatePaymentSettings wajib login baru-baru ini (15 menit, jam asli server).
25. Nominal yang diterima: deposit, lunas, atau sisa pelunasan. Satu pengajuan menunggu per booking;
    satu file bukti hanya sekali pakai; file dicek ada, gambar, <= 5 MB di Storage.
26. verifyPayment hanya owner/finance_manager (delegasi ke admin lewat permissions ditunda).
    Verifikasi deposit otomatis mengonfirmasi booking. Tolak -> kembali awaiting_payment dengan
    tenggat baru. Pembayaran terverifikasi untuk booking batal -> refundReview=true.
27. Pembayaran pesanan produk (orderId) belum ada; ditolak eksplisit sampai createOrder dibuat.
28. Penyimpanan QRIS: tenants/{id}/payment-methods/ (publik baca, owner/finance tulis).
29. KOREKSI poin 23: kondisi lama confirmBooking tidak terbukti bisa menyebabkan double booking lewat
    alur normal (tahanan kedaluwarsa selalu dipangkas saat ada penulisan baru di slot yang sama).
    Perubahan itu penguatan (hardening); tes regresi memakai data tidak konsisten yang disiapkan manual.
30. Pesanan produk dibangun bertahap. Bagian 1: createOrder/cancelOrder/expireStaleOrders.
    Stok dikurangi saat pesanan dibuat (transaksi atomik) dan dikembalikan saat batal/kedaluwarsa.
    Pesanan kedaluwarsa 24 jam (konstanta HOLD_MINUTES; belum per-tenant). Maks 3 pesanan menunggu per pelanggan.
31. Ongkir saat ini hanya manual_quote: shippingCost dan totalAmount = null sampai ada kutipan
    (bagian 2: quoteShipping oleh admin, approveShippingQuote oleh pelanggan). Voucher, ongkir berbasis
    jarak, kurir, dan varian produk ditunda. Pembayaran pesanan belum tersambung (bagian 3).
32. Stok yang terkunci pesanan belum dibayar dilepas lewat expireStaleOrders; wajib dijadwalkan (Fase 6).
33. Frontend tanpa build: modul ES langsung dari public/assets/js (src/ tidak dipakai). SDK Firebase dari
    CDN gstatic dengan versi dipatok (firebase.js). Font Google dipakai selama pengembangan; self-host
    di Fase 6 untuk performa/privasi.
34. Warna tema publik dibaca dari publicTenants.theme.colors (hex divalidasi). Endpoint updateBrandTheme
    yang menulisnya belum ada. Tema di branding/theme tetap hanya untuk anggota.
35. Navigasi dan tombol hanya mengarah ke fitur yang sudah ada (tautan bagian di beranda). Tombol Booking,
    Keranjang, dan halaman lain ditambahkan bersamaan dengan halamannya.
36. Teks sekunder memakai --color-text-soft (#6B5F5A) demi kontras >= 4.5:1; #81746F hanya untuk dekorasi.
37. API dipanggil dari browser lewat daftar asal (CORS) yang eksplisit: env ALLOWED_ORIGINS di produksi;
    di emulator otomatis http://localhost:5000 dan http://127.0.0.1:5000. Tidak ada wildcard.
38. Pelanggan login sebagai tamu (Firebase anonymous auth). Di produksi, penyedia Anonymous harus diaktifkan
    di Firebase Console. Konsekuensi: riwayat booking terikat ke perangkat/sesi tamu; akun email opsional menyusul.
39. Halaman memakai boot bersama (page.js). home.js masih memakai boot sendiri (duplikasi; dirapikan nanti).
40. Kunci idempotensi dibuat di browser dan dipakai ulang selama isian booking sama.
45. Halaman Riwayat (/riwayat/): daftar booking dan pesanan milik sesi (where customerId == uid, urut createdAt
    desc, 30 terbaru). Indeks komposit customerId+createdAt ditambahkan. Bentuk query diuji di Rules.
46. Riwayat terikat ke sesi tamu (anonymous): hilang bila data browser dihapus/ganti perangkat. Solusi:
    akun pelanggan opsional (tautkan akun tamu ke email/kata sandi) — langkah berikutnya.
47. Duplikasi: pembayaran.js masih punya statusText sendiri; status.js adalah versi bersama. Rapikan nanti.
48. Bagian "Pesanan produk" sudah membaca data sungguhan tetapi belum bisa terisi dari tampilan (checkout belum ada).
49. Dashboard admin (/admin/) memakai aplikasi Firebase kedua bernama "admin" agar sesi admin tidak
    bercampur dengan sesi tamu pelanggan. Hak akses = keanggotaan tenant aktif + email terverifikasi.
50. Menyembunyikan tombol/nomor telepon di UI hanyalah kenyamanan. Penegakan ada di backend & Rules.
    Content Manager masih bisa membaca dokumen booking (termasuk telepon) menurut Rules saat ini; bila
    "PII terbatas" harus ditegakkan, pisahkan data kontak ke dokumen sendiri (keputusan terbuka).
51. /admin/ tidak ditautkan dari menu publik dan diberi noindex. Akun contoh dev: owner@, admin@, finance@,
    konten@ muaputri.test (kata sandi di seed, hanya emulator).
52. Tab dashboard: Booking (semua staf) dan Pembayaran (owner, finance_manager). Belum ada: produk, layanan,
    portfolio, pengaturan pembayaran, undangan admin, pesanan produk/ongkir.
57. Logo Mua Putri (monogram emas di atas latar hitam) dipotong menjadi ikon transparan (header), logo lengkap
    (beranda), dan favicon persegi. Diunggah lewat layar Brand, bukan ditanam di kode (multi-tenant).
58. Identitas brand disimpan sebagai path Storage (logoImage, brandImage, faviconImage) di folder branding tenant,
    plus headerStyle (light/dark). updateBrandProfile memvalidasi path; proyeksi publik hanya memuat field publik.
59. Jam toko produk (settings/storeHours + publicTenants.storeHours) terpisah dari jam layanan MUA
    (settings/businessHours, menentukan jam booking). Jam toko belum membatasi pesanan produk.
60. deleteProduct (owner/admin): hanya produk non-terbit; menghapus kunci SKU/slug; riwayat pesanan aman
    karena snapshot. File gambar yatim di Storage belum dibersihkan (menyusul bersama pengelolaan media).
61. npm run emulators menyimpan/memulihkan data di ./emulator-data (tidak di-commit). Seed tidak menimpa data
    yang ada kecuali --force. Data tersimpan hanya bila emulator dimatikan dengan Ctrl+C.
62. Layar Brand memakai mesin formulir mode satu dokumen (cfg.single).
