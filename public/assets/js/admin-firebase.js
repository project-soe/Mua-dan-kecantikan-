// Aplikasi Firebase TERPISAH untuk admin: sesi admin tidak bercampur dengan sesi tamu pelanggan
// di browser yang sama (login admin tidak menghapus riwayat pelanggan).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {
  getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, sendEmailVerification,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getStorage, connectStorageEmulator, ref, getDownloadURL, uploadBytes } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { firebaseConfig } from './firebase-config.js';
import { isLocal } from './env.js';

export const adminApp = initializeApp(firebaseConfig, 'admin');
export const adminDb = getFirestore(adminApp);
export const adminAuth = getAuth(adminApp);
export const adminStorage = getStorage(adminApp);
if (isLocal) {
  connectFirestoreEmulator(adminDb, location.hostname, 8080);
  connectAuthEmulator(adminAuth, `http://${location.hostname}:9099`, { disableWarnings: true });
  connectStorageEmulator(adminStorage, location.hostname, 9199);
}

export { signInWithEmailAndPassword, signOut, sendPasswordResetEmail, sendEmailVerification, ref, getDownloadURL, uploadBytes };
export {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
