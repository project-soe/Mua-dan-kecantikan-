import { firebaseConfig } from './firebase-config.js';
import { isLocal } from './env.js';

// Mengubah path Storage menjadi URL. Mengembalikan null bila tidak ada gambar.
export function imageUrl(path) {
  if (typeof path !== 'string' || !path) return null;
  const host = isLocal ? `http://${location.hostname}:9199` : 'https://firebasestorage.googleapis.com';
  return `${host}/v0/b/${firebaseConfig.storageBucket}/o/${encodeURIComponent(path)}?alt=media`;
}
