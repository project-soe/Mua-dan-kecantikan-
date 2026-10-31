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
