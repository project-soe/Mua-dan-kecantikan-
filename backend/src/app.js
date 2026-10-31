import express from 'express';
import { TENANT_ROLES, ROLE_GROUPS } from '../../shared/constants/index.js';
import { notFound, errorHandler, wrap } from './errors.js';
import { authenticate } from './middleware/auth.js';
import { loadTenant, requireMembership, requireSuperAdmin } from './middleware/authorize.js';
import { getMyAccess, setTenantStatus } from './tenants/handlers.js';
import { updateBrandProfile } from './tenants/brand.js';
import { createProduct, updateProduct, updateProductStock, publishProduct } from './products/handlers.js';
import { createCategory, updateCategory } from './categories/handlers.js';
import { createService, updateService, publishService } from './services/handlers.js';
import { createPortfolio, updatePortfolio, publishPortfolio } from './portfolio/handlers.js';

export function createApp({ db, auth }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  const guard = (roles, opts) => [authenticate(auth), loadTenant(db), requireMembership(db, roles, opts)];
  const route = (name, roles, handler) => app.post(`/api/${name}`, ...guard(roles), wrap(handler(db)));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.post('/api/getMyAccess', ...guard(Object.values(TENANT_ROLES), { anyTenantStatus: true }), getMyAccess);
  app.post('/api/setTenantStatus', authenticate(auth), requireSuperAdmin(db), wrap(setTenantStatus(db)));

  route('updateBrandProfile', ROLE_GROUPS.ADMIN, updateBrandProfile);

  route('createCategory', ROLE_GROUPS.CONTENT, createCategory);
  route('updateCategory', ROLE_GROUPS.CONTENT, updateCategory);

  route('createProduct', ROLE_GROUPS.CONTENT, createProduct);
  route('updateProduct', ROLE_GROUPS.CONTENT, updateProduct);
  route('publishProduct', ROLE_GROUPS.CONTENT, publishProduct);
  route('updateProductStock', ROLE_GROUPS.ADMIN, updateProductStock);

  route('createService', ROLE_GROUPS.CONTENT, createService);
  route('updateService', ROLE_GROUPS.CONTENT, updateService);
  route('publishService', ROLE_GROUPS.CONTENT, publishService);

  route('createPortfolio', ROLE_GROUPS.CONTENT, createPortfolio);
  route('updatePortfolio', ROLE_GROUPS.CONTENT, updatePortfolio);
  route('publishPortfolio', ROLE_GROUPS.CONTENT, publishPortfolio);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
