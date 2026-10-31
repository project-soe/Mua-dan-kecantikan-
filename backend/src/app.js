import express from 'express';
import { TENANT_ROLES, ROLE_GROUPS } from '../../shared/constants/index.js';
import { notFound, errorHandler, wrap } from './errors.js';
import { authenticate } from './middleware/auth.js';
import { loadTenant, requireMembership, requireSuperAdmin } from './middleware/authorize.js';
import { getMyAccess, setTenantStatus } from './tenants/handlers.js';
import { updateBrandProfile } from './tenants/brand.js';
import { createProduct, updateProduct, updateProductStock, publishProduct } from './products/handlers.js';

export function createApp({ db, auth }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  const guard = (roles, opts) => [authenticate(auth), loadTenant(db), requireMembership(db, roles, opts)];

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.post('/api/getMyAccess',
    ...guard(Object.values(TENANT_ROLES), { anyTenantStatus: true }), getMyAccess);

  app.post('/api/setTenantStatus',
    authenticate(auth), requireSuperAdmin(db), wrap(setTenantStatus(db)));

  app.post('/api/updateBrandProfile', ...guard(ROLE_GROUPS.ADMIN), wrap(updateBrandProfile(db)));

  app.post('/api/createProduct', ...guard(ROLE_GROUPS.CONTENT), wrap(createProduct(db)));
  app.post('/api/updateProduct', ...guard(ROLE_GROUPS.CONTENT), wrap(updateProduct(db)));
  app.post('/api/publishProduct', ...guard(ROLE_GROUPS.CONTENT), wrap(publishProduct(db)));
  app.post('/api/updateProductStock', ...guard(ROLE_GROUPS.ADMIN), wrap(updateProductStock(db)));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
