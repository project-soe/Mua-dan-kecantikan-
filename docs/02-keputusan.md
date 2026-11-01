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
