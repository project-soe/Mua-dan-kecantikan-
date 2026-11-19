import { createApp } from './app.js';
import { db, auth } from './firebase.js';
import { proofInfo as firebaseProofInfo } from './storage.js';
import { config } from './config.js';
import { createExpiryWorker } from './maintenance/expiry-worker.js';
import { createUploadAuth, createSignedMediaUrl } from './media/imagekit.js';
import { createImageKitProofInfo } from './media/imagekit-admin.js';

const createMediaAuth = createUploadAuth({
  publicKey: config.imageKitPublicKey,
  privateKey: config.imageKitPrivateKey,
  urlEndpoint: config.imageKitUrlEndpoint,
});
const imageKitProofInfo = createImageKitProofInfo({ privateKey: config.imageKitPrivateKey });
const proofInfo = (input) => (typeof input === 'string' ? firebaseProofInfo(input) : imageKitProofInfo(input));
const createSignedUrl = createSignedMediaUrl({ privateKey: config.imageKitPrivateKey, urlEndpoint: config.imageKitUrlEndpoint });
const server = createApp({ db, auth, proofInfo, createMediaAuth, createSignedUrl, allowedOrigins: config.allowedOrigins }).listen(config.port, '0.0.0.0', () => {
  console.log(`Backend berjalan di port ${config.port}`);
  console.log('Asal yang diizinkan (CORS):', config.allowedOrigins.join(', ') || '(tidak ada)');
});
const expiryWorker = createExpiryWorker({ db, intervalMs: Number(process.env.EXPIRY_SWEEP_INTERVAL_MS || 60_000) });
expiryWorker.start();
function shutdown(signal) {
  console.log(`Menerima ${signal}; menghentikan worker dan server...`);
  expiryWorker.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
