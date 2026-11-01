// Alat bantu pengembangan (HANYA emulator): melihat dan memproses pembayaran lewat API sungguhan
// sebagai akun owner contoh, sampai dashboard admin tersedia.
import { db } from '../backend/src/firebase.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('Hanya untuk emulator. Jalankan lewat: npm run dev:payments');
  process.exit(1);
}
const T = 'mua-putri';
const API = process.env.API_URL || 'http://127.0.0.1:3000';
const [cmd, id, ...rest] = process.argv.slice(2);

async function token() {
  const r = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'owner@muaputri.test', password: 'Passw0rd!x', returnSecureToken: true }),
  });
  const j = await r.json();
  if (!j.idToken) throw new Error('Login owner contoh gagal (sudah menjalankan npm run seed?): ' + JSON.stringify(j));
  return j.idToken;
}
async function api(name, body) {
  const r = await fetch(`${API}/api/${name}`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ tenantId: T, ...body }),
  });
  return `${r.status} ${JSON.stringify(await r.json())}`;
}

if (!cmd || cmd === 'list') {
  const snap = await db.collection(`tenants/${T}/payments`).where('paymentStatus', '==', 'submitted').get();
  if (snap.empty) console.log('Tidak ada pembayaran yang menunggu verifikasi.');
  for (const d of snap.docs) {
    const p = d.data();
    const b = (await db.doc(`tenants/${T}/bookings/${p.bookingId}`).get()).data();
    console.log(`${d.id}  ${b?.bookingNumber ?? '-'}  Rp${p.amount}  ${p.method}  (${p.purpose})`);
  }
} else if (cmd === 'verify' && id) {
  console.log(await api('verifyPayment', { paymentId: id, decision: 'verify' }));
} else if (cmd === 'reject' && id) {
  console.log(await api('verifyPayment', { paymentId: id, decision: 'reject', rejectionReason: rest.join(' ') || 'Bukti tidak sesuai' }));
} else {
  console.log('Pemakaian: npm run dev:payments [-- list | verify <paymentId> | reject <paymentId> <alasan>]');
}
process.exit(0);
