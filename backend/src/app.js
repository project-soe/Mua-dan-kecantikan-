import express from 'express';
import { TENANT_ROLES } from '../../shared/constants/index.js';
import { notFound, errorHandler, wrap } from './errors.js';
import { authenticate } from './middleware/auth.js';
import { loadTenant, requireMembership, requireSuperAdmin } from './middleware/authorize.js';
import { getMyAccess, setTenantStatus } from './tenants/handlers.js';

export function createApp({ db, auth }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.post('/api/getMyAccess',
    authenticate(auth), loadTenant(db),
    requireMembership(db, Object.values(TENANT_ROLES), { anyTenantStatus: true }),
    getMyAccess);

  app.post('/api/setTenantStatus',
    authenticate(auth), requireSuperAdmin(db),
    wrap(setTenantStatus(db)));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
