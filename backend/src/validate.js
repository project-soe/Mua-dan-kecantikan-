import { AppError } from './errors.js';

export function tenantIdOf(body) {
  const v = body?.tenantId;
  if (typeof v !== 'string' || !/^[a-z0-9][a-z0-9-]{1,40}$/.test(v)) {
    throw new AppError('invalid-argument', 'tenantId tidak valid');
  }
  return v;
}

export function oneOf(value, list, name) {
  if (!list.includes(value)) throw new AppError('invalid-argument', `${name} tidak valid`);
  return value;
}
