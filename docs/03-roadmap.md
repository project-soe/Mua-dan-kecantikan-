# Roadmap & Kriteria Penerimaan

- Phase 0 Fondasi: struktur, docs, konstanta bersama (status/peran), emulator menyala,
  rules default-deny teruji.
- Phase 1 Design system: token CSS, komponen dasar, halaman katalog komponen rapi di
  lebar 360/768/1280 px.
- Phase 2 Website publik: beranda memuat data dari Firestore emulator berdasarkan hostname,
  tanpa data produksi hardcode.
- Phase 3 Admin: login + cek membership, CRUD portfolio/produk/layanan, upload media, brand.
- Phase 4 Booking & toko: tidak ada double-booking (tes konkurensi), total dihitung server,
  idempotensi lulus tes, pembayaran manual + WhatsApp.
- Phase 5 SEO: endpoint share mengembalikan meta OG tanpa JavaScript, sitemap, structured data.
- Phase 6 Keamanan & produksi: semua tes rules/isolasi tenant lulus, pilih hosting backend
  dan penyimpanan gratis, deployment, monitoring.

## Risiko
- RAM proot terbatas (emulator berat): jalankan satu per satu.
- Hosting backend gratis yang selalu hidup belum dipilih.
- Storage produksi gratis belum dipilih.
- Banyak custom domain per tenant butuh pengaturan DNS/hosting manual.
- Foto model butuh izin tertulis (consentStatus).
