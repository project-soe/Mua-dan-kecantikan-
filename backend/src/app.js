import express from 'express';
import { cors } from './cors.js';
import { TENANT_ROLES, ROLE_GROUPS } from '../../shared/constants/index.js';
import { notFound, errorHandler, wrap } from './errors.js';
import { authenticate } from './middleware/auth.js';
import { loadTenant, requireMembership, requireSuperAdmin, requireActiveTenant } from './middleware/authorize.js';
import { getMyAccess, setTenantStatus } from './tenants/handlers.js';
import { updateBrandProfile } from './tenants/brand.js';
import { updateStoreHours } from './tenants/storeHours.js';
import { createProduct, updateProduct, updateProductStock, publishProduct, deleteProduct } from './products/handlers.js';
import { createCategory, updateCategory } from './categories/handlers.js';
import { createService, updateService, publishService } from './services/handlers.js';
import { createPortfolio, updatePortfolio, publishPortfolio } from './portfolio/handlers.js';
import { createReview, updateReview, publishReview, deleteReview } from './reviews/handlers.js';
import { updateBusinessHours } from './bookings/hours.js';
import { checkBookingAvailability } from './bookings/availability.js';
import { createBooking } from './bookings/create.js';
import { confirmBooking, cancelBooking, expireStaleBookings } from './bookings/manage.js';
import { updatePaymentSettings } from './payments/settings.js';
import { getPaymentInstructions } from './payments/instructions.js';
import { submitPaymentProof } from './payments/submit.js';
import { verifyPayment } from './payments/verify.js';
import { createOrder, cancelOrder, expireStaleOrders } from './orders/handlers.js';
import { setOrderShippingQuote, acceptOrderShippingQuote } from './orders/shipping.js';
import { getMediaUploadAuth } from './media/imagekit.js';

export function createApp({ db, auth, clock = Date.now, proofInfo, createMediaAuth, allowedOrigins = [] }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors(allowedOrigins));
  app.use(express.json({ limit: '100kb' }));
  const staff = (name, roles, handler) =>
    app.post(`/api/${name}`, authenticate(auth), loadTenant(db), requireMembership(db, roles), wrap(handler(db)));
  const customer = (name, handler) =>
    app.post(`/api/${name}`, authenticate(auth), loadTenant(db), requireActiveTenant(), wrap(handler(db, clock)));
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.post('/api/getMyAccess', authenticate(auth), loadTenant(db),
    requireMembership(db, Object.values(TENANT_ROLES), { anyTenantStatus: true }), getMyAccess);
  app.post('/api/setTenantStatus', authenticate(auth), requireSuperAdmin(db), wrap(setTenantStatus(db)));
  staff('getMediaUploadAuth', [...ROLE_GROUPS.ADMIN, ...ROLE_GROUPS.CONTENT, ...ROLE_GROUPS.FINANCE],
    (d) => getMediaUploadAuth({ createAuth: createMediaAuth }));

  staff('updateBrandProfile', ROLE_GROUPS.ADMIN, updateBrandProfile);
  staff('createCategory', ROLE_GROUPS.CONTENT, createCategory);
  staff('updateCategory', ROLE_GROUPS.CONTENT, updateCategory);
  staff('createProduct', ROLE_GROUPS.CONTENT, createProduct);
  staff('updateProduct', ROLE_GROUPS.CONTENT, updateProduct);
  staff('publishProduct', ROLE_GROUPS.CONTENT, publishProduct);
  staff('deleteProduct', ROLE_GROUPS.ADMIN, deleteProduct);
  staff('updateProductStock', ROLE_GROUPS.ADMIN, updateProductStock);
  staff('createService', ROLE_GROUPS.CONTENT, createService);
  staff('updateService', ROLE_GROUPS.CONTENT, updateService);
  staff('publishService', ROLE_GROUPS.CONTENT, publishService);
  staff('createPortfolio', ROLE_GROUPS.CONTENT, createPortfolio);
  staff('updatePortfolio', ROLE_GROUPS.CONTENT, updatePortfolio);
  staff('publishPortfolio', ROLE_GROUPS.CONTENT, publishPortfolio);
  staff('createReview', ROLE_GROUPS.CONTENT, createReview);
  staff('updateReview', ROLE_GROUPS.CONTENT, updateReview);
  staff('publishReview', ROLE_GROUPS.CONTENT, publishReview);
  staff('deleteReview', ROLE_GROUPS.ADMIN, deleteReview);
  staff('updateBusinessHours', ROLE_GROUPS.ADMIN, updateBusinessHours);
  staff('updateStoreHours', ROLE_GROUPS.ADMIN, updateStoreHours);
  staff('confirmBooking', ROLE_GROUPS.ADMIN, (d) => confirmBooking(d, clock));
  staff('expireStaleBookings', ROLE_GROUPS.ADMIN, (d) => expireStaleBookings(d, clock));
  staff('updatePaymentSettings', ROLE_GROUPS.FINANCE, updatePaymentSettings);
  staff('verifyPayment', ROLE_GROUPS.FINANCE, (d) => verifyPayment(d, clock));
  staff('expireStaleOrders', ROLE_GROUPS.ADMIN, (d) => expireStaleOrders(d, clock));
  staff('setOrderShippingQuote', ROLE_GROUPS.ADMIN, (d) => setOrderShippingQuote(d, clock));
  customer('checkBookingAvailability', checkBookingAvailability);
  customer('createBooking', createBooking);
  customer('getPaymentInstructions', getPaymentInstructions);
  customer('submitPaymentProof', (d, c) => submitPaymentProof(d, c, proofInfo));
  customer('createOrder', createOrder);
  customer('acceptOrderShippingQuote', (d, c) => acceptOrderShippingQuote(d, c));
  app.post('/api/cancelBooking', authenticate(auth), loadTenant(db), wrap(cancelBooking(db, clock)));
  app.post('/api/cancelOrder', authenticate(auth), loadTenant(db), wrap(cancelOrder(db)));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
