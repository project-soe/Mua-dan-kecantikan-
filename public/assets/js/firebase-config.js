// Konfigurasi web Firebase bersifat publik dan spesifik proyek.
// Jangan pernah menaruh Firebase Admin service-account key atau secret server di file ini.
export const firebaseConfig = {
  apiKey: 'AIzaSyBZJyLcGPH8qAlr3ZJtNb31NzyJfbbkMGA',
  authDomain: 'kolom-komentar-bfa86.firebaseapp.com',
  databaseURL: 'https://kolom-komentar-bfa86-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'kolom-komentar-bfa86',
  storageBucket: 'kolom-komentar-bfa86.firebasestorage.app',
  messagingSenderId: '711721245082',
  appId: '1:711721245082:web:107b01d43e83c172044223',
  measurementId: 'G-4Z4T8QLRE0',
};

// Backend Express di Render. Frontend harus mengizinkan origin situs yang benar
// melalui ALLOWED_ORIGINS pada layanan Render.
export const apiBase = 'https://mua-putri-api.onrender.com';
