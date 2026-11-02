import { FieldValue } from 'firebase-admin/firestore';
import { db, auth } from '../backend/src/firebase.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('Seed hanya untuk emulator. Jalankan lewat: npm run seed');
  process.exit(1);
}

const T = 'mua-putri';
const PASS = 'Passw0rd!x';
const ts = FieldValue.serverTimestamp();

async function user(uid, email) {
  try { await auth.createUser({ uid, email, password: PASS, emailVerified: true }); }
  catch (e) { if (!String(e.code).includes('already-exists')) throw e; }
}
const set = (path, data) => db.doc(path).set(data);

await user('owner-demo', 'owner@muaputri.test');
await user('root-demo', 'root@platform.test');
await user('cust-demo', 'pelanggan@muaputri.test');
await user('admin-demo', 'admin@muaputri.test');
await user('finance-demo', 'finance@muaputri.test');
await user('content-demo', 'konten@muaputri.test');

const win = [{ open: '09:00', close: '17:00' }];
await set(`platformUsers/root-demo`, { role: 'super_admin', status: 'active' });
await set(`platformDomains/localhost`, { tenantId: T, status: 'active', verifiedAt: ts, createdAt: ts });
await set(`tenants/${T}/profile/business`, {
  brandName: 'Mua Putri', legalName: 'Mua Putri (contoh)', slug: T, tagline: 'Makeup artist & beauty studio',
  description: 'Data contoh untuk pengembangan.', status: 'active', createdAt: ts, updatedAt: ts,
});
await set(`publicTenants/${T}`, {
  brandName: 'Mua Putri', slug: T, tagline: 'Makeup artist & beauty studio',
  description: 'Data contoh untuk pengembangan.', status: 'active', updatedAt: ts,
  operatingHours: { timezone: 'Asia/Jakarta', closedDates: [], weekly: { sun: [], mon: win, tue: win, wed: win, thu: win, fri: win, sat: win } },
});
await set(`tenants/${T}/memberships/owner-demo`, { uid: 'owner-demo', email: 'owner@muaputri.test', role: 'owner', status: 'active', createdAt: ts });
await set(`tenants/${T}/settings/businessHours`, {
  timezone: 'Asia/Jakarta', slotIntervalMinutes: 30, capacity: 1, minLeadTimeMinutes: 120, maxAdvanceDays: 90,
  holdMinutes: 120, cancelCutoffHours: 24, closedDates: [],
  weekly: { sun: [], mon: win, tue: win, wed: win, thu: win, fri: win, sat: win }, updatedAt: ts,
});
await set(`tenants/${T}/settings/paymentPublic`, {
  methods: [{ method: 'bank_transfer', enabled: true, accountName: 'Mua Putri', bankName: 'BCA', accountNumber: '1234567890' }],
  instructionsText: 'Transfer sesuai nominal lalu unggah bukti.', updatedAt: ts,
});
await set(`tenants/${T}/serviceCategories/bridal`, { name: 'Bridal', sortOrder: 1, createdAt: ts, updatedAt: ts });
await set(`tenants/${T}/serviceCategories/party`, { name: 'Party', sortOrder: 2, createdAt: ts, updatedAt: ts });
await set(`tenants/${T}/productCategories/makeup`, { name: 'Makeup', sortOrder: 1, createdAt: ts, updatedAt: ts });

const services = [
  ['bridal-makeup', 'Bridal Makeup', 'bridal', 2500000, 500000, 180, 60],
  ['party-makeup', 'Party Makeup', 'party', 450000, 100000, 60, 15],
];
for (const [id, name, categoryId, price, depositAmount, durationMinutes, preparationTimeMinutes] of services) {
  await set(`tenants/${T}/services/${id}`, {
    name, slug: id, categoryId, description: 'Deskripsi contoh.', price, depositAmount, durationMinutes,
    preparationTimeMinutes, bookingEnabled: true, locationMode: 'both', gallery: [], published: true, createdAt: ts, updatedAt: ts,
  });
  await set(`tenants/${T}/uniqueKeys/service-slug_${id}`, { serviceId: id, createdAt: ts });
}
const products = [
  ['lipstik-rose-matte', 'Lipstik Rose Matte', 'LIP-001', 120000, null, 25],
  ['serum-glow', 'Serum Glow', 'SRM-001', 185000, 165000, 12],
];
for (const [id, name, sku, price, discountPrice, stock] of products) {
  await set(`tenants/${T}/products/${id}`, {
    name, slug: id, sku, categoryId: 'makeup', description: 'Deskripsi contoh.', price,
    ...(discountPrice ? { discountPrice } : {}), stock, variants: [], gallery: [], published: true, createdAt: ts, updatedAt: ts,
  });
  await set(`tenants/${T}/uniqueKeys/product-sku_${sku}`, { productId: id, createdAt: ts });
  await set(`tenants/${T}/uniqueKeys/product-slug_${id}`, { productId: id, createdAt: ts });
}

for (const [uid, email, role] of [['admin-demo', 'admin@muaputri.test', 'admin'], ['finance-demo', 'finance@muaputri.test', 'finance_manager'], ['content-demo', 'konten@muaputri.test', 'content_manager']]) {
  await set(`tenants/${T}/memberships/${uid}`, { uid, email, role, status: 'active', createdAt: ts });
}
console.log('Seed selesai (data contoh, emulator saja).');
console.log('Akun staf (@muaputri.test): owner@ | admin@ | finance@ | konten@  |  juga root@platform.test dan pelanggan@muaputri.test');
console.log('Kata sandi semua akun:', PASS);
process.exit(0);
