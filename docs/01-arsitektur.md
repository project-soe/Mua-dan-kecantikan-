# Arsitektur — Mua Putri Beauty Platform

## Lapisan
Browser (HTML/CSS/Vanilla JS ES Modules)
  -> baca data publik langsung ke Firestore/Storage (dijaga Security Rules)
  -> operasi sensitif ke Backend Express (`backend/`, firebase-admin) -> Firestore

## Tenant
- Hostname -> `platformDomains/{domain}` -> tenantId -> `publicTenants/{tenantId}`.
- Domain hanya identitas tenant, BUKAN hak akses.
- Domain wajib diverifikasi sebelum aktif.

## Otorisasi
- Identitas: Firebase Auth. Hak akses: `tenants/{id}/memberships/{uid}`.
- Super Admin: `platformUsers/{uid}` (terpisah dari peran tenant).
- Backend wajib: verifikasi ID token, cek membership aktif + peran, jangan percaya tenantId dari browser.
- Admin SDK melewati Rules, jadi setiap handler cek otorisasi sendiri.

## Backend
- `POST /api/<namaFungsi>` (mis. /api/createOrder), nama sama dengan kontrak di spesifikasi.
- Lapisan: handler tipis -> service murni (tanpa Express) -> akses data.
- Error standar: `{ "error": { "code": "out-of-stock", "message": "..." } }`.
- Semua harga/total/ongkir/stok dihitung server. Idempotency key untuk operasi sensitif.

## Lingkungan dev (emulator, gratis)
Auth 9099, Firestore 8080, Storage 9199, Hosting 5000, UI 4000.
