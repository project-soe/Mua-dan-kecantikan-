import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { config } from './config.js';

// Produksi: kredensial dari GOOGLE_APPLICATION_CREDENTIALS (jangan di-commit).
// Dev/tes: otomatis memakai emulator bila env emulator terpasang.
const app = getApps()[0] ?? initializeApp({ projectId: config.projectId });
export const db = getFirestore(app);
export const auth = getAuth(app);
