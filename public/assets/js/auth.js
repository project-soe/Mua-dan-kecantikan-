import { auth, signInAnonymously } from './firebase.js';

// Pelanggan cukup login sebagai tamu (anonymous); booking terikat ke sesi ini.
export async function ensureUser() {
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser;
}
export async function getIdToken() {
  return (await ensureUser()).getIdToken();
}
