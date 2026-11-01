import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { config } from './config.js';

// Produksi: kredensial dari GOOGLE_APPLICATION_CREDENTIALS (jangan di-commit).
// Dev/tes: otomatis memakai emulator bila env emulator terpasang.
const app = getApps()[0] ?? initializeApp({ projectId: config.projectId, storageBucket: config.storageBucket });
export const db = getFirestore(app);
export const auth = getAuth(app);
export const bucket = () => getStorage(app).bucket();
