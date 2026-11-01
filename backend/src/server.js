import { createApp } from './app.js';
import { db, auth } from './firebase.js';
import { proofInfo } from './storage.js';
import { config } from './config.js';

createApp({ db, auth, proofInfo }).listen(config.port, () => {
  console.log(`Backend berjalan di port ${config.port}`);
});
