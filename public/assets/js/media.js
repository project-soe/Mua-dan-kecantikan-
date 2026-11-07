import { firebaseConfig } from './firebase-config.js';
import { isLocal } from './env.js';

// Nilai lama tetap dibaca dari Firebase Storage; URL ImageKit dipakai langsung.
export function imageUrl(path) {
  if (typeof path !== 'string' || !path) return null;
  if (/^https:\/\//i.test(path)) return path;
  const host = isLocal ? `http://${location.hostname}:9199` : 'https://firebasestorage.googleapis.com';
  return `${host}/v0/b/${firebaseConfig.storageBucket}/o/${encodeURIComponent(path)}?alt=media`;
}
