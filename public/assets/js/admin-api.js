import { makeCall } from './api.js';
import { adminAuth } from './admin-firebase.js';

export const adminCall = makeCall(async () => {
  const u = adminAuth.currentUser;
  if (!u) throw new Error('belum login');
  return u.getIdToken();
});
