const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'mua-and-beauty';
const fromEnv = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const devOrigins = process.env.FIRESTORE_EMULATOR_HOST
  ? ['http://localhost:5000', 'http://127.0.0.1:5000']
  : [];

export const config = {
  projectId,
  port: Number(process.env.PORT || 3000),
  recentAuthSeconds: Number(process.env.RECENT_AUTH_SECONDS || 900),
  imageKitPublicKey: process.env.IMAGEKIT_PUBLIC_KEY || '',
  imageKitPrivateKey: process.env.IMAGEKIT_PRIVATE_KEY || '',
  imageKitUrlEndpoint: (process.env.IMAGEKIT_URL_ENDPOINT || '').replace(/\/$/, ''),
  allowedOrigins: [...new Set([...fromEnv, ...devOrigins])],
};
