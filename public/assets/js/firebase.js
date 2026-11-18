// Versi SDK dipatok di satu tempat ini.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';
import { isLocal } from './env.js';

export const app = initializeApp(firebaseConfig);
// Pin the production client to Firestore's default database explicitly.
// This avoids relying on SDK defaults if the project later adds named databases.
export const db = getFirestore(app, '(default)');
export const auth = getAuth(app);
if (isLocal) {
  connectFirestoreEmulator(db, location.hostname, 8080);
  connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
}

export { signInAnonymously };
export {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
