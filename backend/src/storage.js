import { bucket } from './firebase.js';

// Mengembalikan { size, contentType } bila file ada, selain itu null.
export async function proofInfo(path) {
  const file = bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [meta] = await file.getMetadata();
  return { size: Number(meta.size), contentType: meta.contentType };
}
