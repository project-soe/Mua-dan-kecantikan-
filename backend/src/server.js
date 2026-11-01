import { createApp } from './app.js';
import { db, auth } from './firebase.js';
import { proofInfo } from './storage.js';
import { config } from './config.js';

createApp({ db, auth, proofInfo, allowedOrigins: config.allowedOrigins }).listen(config.port, () => {
  console.log(`Backend berjalan di port ${config.port}`);
  console.log('Asal yang diizinkan (CORS):', config.allowedOrigins.join(', ') || '(tidak ada)');
});
