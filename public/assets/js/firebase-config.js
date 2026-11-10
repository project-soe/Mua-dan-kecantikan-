// Konfigurasi Firebase Web untuk proyek produksi Mua & Beauty.
// Firebase Web API key memang digunakan di browser; keamanan ditentukan oleh Auth,
// Firestore Rules, Storage Rules, App Check (bila diaktifkan), dan validasi backend.
export const firebaseConfig = {
  apiKey: 'AIzaSyCcc2A7r8wabu_FCaFfol-wKIt_eJttYPw',
  authDomain: 'mua-and-beauty.firebaseapp.com',
  projectId: 'mua-and-beauty',
  storageBucket: 'mua-and-beauty.firebasestorage.app',
  messagingSenderId: '808959175845',
  appId: '1:808959175845:web:9e0a00399944c6afdd714c',
  measurementId: 'G-XT6C1YNST6',
};

// Isi dengan URL backend Express produksi setelah backend dideploy.
// Kosong berarti endpoint produksi belum dikonfigurasi (frontend akan menolak API call).
export const apiBase = '';
