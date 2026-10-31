import { auth } from '../../backend/src/firebase.js';

export const tokens = {};

export async function makeUser(uid, { verified = true } = {}) {
  const email = `${uid}@test.local`;
  const password = 'Passw0rd!x';
  await auth.createUser({ uid, email, password, emailVerified: verified });
  const r = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`,
    { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }) });
  tokens[uid] = (await r.json()).idToken;
}

export function caller(getBase) {
  return async (fn, body, user) => {
    const headers = { 'content-type': 'application/json' };
    if (user) headers.authorization = 'Bearer ' + (tokens[user] ?? user);
    const r = await fetch(`${getBase()}/api/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
}
