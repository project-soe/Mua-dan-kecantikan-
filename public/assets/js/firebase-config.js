// Konfigurasi Firebase Web untuk proyek produksi mua-and-beauty.
// Nilai ini memang digunakan browser; jangan menaruh private key/service account di sini.
export const firebaseConfig = {
  apiKey: 'AIzaSyCcc2A7r8wabu_FCaFfol-wKIt_eJttYPw',
  authDomain: 'mua-and-beauty.firebaseapp.com',
  projectId: 'mua-and-beauty',
  messagingSenderId: '808959175845',
  appId: '1:808959175845:web:9e0a00399944c6afdd714c',
  measurementId: 'G-XT6C1YNST6',
};

// Backend Express produksi di Render (tanpa garis miring akhir).
export const apiBase = 'https://mua-putri-api.onrender.com';
