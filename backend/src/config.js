const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'mua-and-beauty';
const fromEnv = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
// Asal lokal hanya ditambahkan saat berjalan dengan emulator.
const devOrigins = process.env.FIRESTORE_EMULATOR_HOST ? ['http://localhost:5000', 'http://127.0.0.1:5000'] : [];
const defaultBucket = projectId === 'mua-and-beauty'
  ? 'mua-and-beauty.firebasestorage.app'
  : `${projectId}.appspot.com`;

export const config = {
  projectId,
  port: Number(process.env.PORT || 3000),
  storageBucket: process.env.STORAGE_BUCKET || defaultBucket,
  recentAuthSeconds: Number(process.env.RECENT_AUTH_SECONDS || 900),
  allowedOrigins: [...new Set([...fromEnv, ...devOrigins])],
};
