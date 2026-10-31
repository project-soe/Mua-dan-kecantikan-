import { AppError } from '../errors.js';

export function authenticate(auth) {
  return async (req, res, next) => {
    try {
      const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
      if (!m) throw new AppError('unauthenticated', 'Login diperlukan');
      try {
        req.user = await auth.verifyIdToken(m[1], true); // true = cek token dicabut
      } catch {
        throw new AppError('unauthenticated', 'Token tidak valid atau kedaluwarsa');
      }
      next();
    } catch (e) { next(e); }
  };
}
