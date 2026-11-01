// Versi SDK dipatok di satu tempat ini.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import { isLocal } from './env.js';

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
if (isLocal) connectFirestoreEmulator(db, location.hostname, 8080);

export {
  collection, doc, getDoc, getDocs, query, where, limit,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
