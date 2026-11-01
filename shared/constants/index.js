// Sumber kebenaran tunggal untuk peran, status, dan kode error.
// Dipakai oleh backend, tes, dan (nanti) frontend.

export const PLATFORM_ROLES = Object.freeze({ SUPER_ADMIN: 'super_admin' });

export const TENANT_ROLES = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  CONTENT_MANAGER: 'content_manager',
  FINANCE_MANAGER: 'finance_manager',
});

export const MEMBERSHIP_STATUS = Object.freeze(['active', 'invited', 'disabled']);
export const TENANT_STATUS = Object.freeze(['pending', 'active', 'suspended', 'archived']);

export const ORDER_STATUS = Object.freeze([
  'pending', 'awaiting_payment', 'payment_verification', 'paid', 'processing',
  'shipped', 'delivered', 'completed', 'cancelled', 'refunded',
]);

// Transisi yang diizinkan (usulan awal, bisa disesuaikan).
export const ORDER_TRANSITIONS = Object.freeze({
  pending: ['awaiting_payment', 'cancelled'],
  awaiting_payment: ['payment_verification', 'cancelled'],
  payment_verification: ['paid', 'awaiting_payment', 'cancelled'],
  paid: ['processing', 'refunded'],
  processing: ['shipped', 'refunded'],
  shipped: ['delivered'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
  refunded: [],
});

export const BOOKING_STATUS = Object.freeze([
  'pending', 'awaiting_payment', 'payment_verification', 'confirmed',
  'in_progress', 'completed', 'cancelled', 'rejected',
]);

export const PAYMENT_DOC_STATUS = Object.freeze([
  'awaiting_payment', 'submitted', 'verified', 'rejected', 'refunded',
]);

export const PAYMENT_STATUS = Object.freeze([
  'unpaid', 'partially_paid', 'paid', 'failed', 'refunded',
]);

export const SHIPMENT_STATUS = Object.freeze([
  'quote_requested', 'quote_pending', 'quote_approved', 'awaiting_pickup',
  'picked_up', 'in_transit', 'delivered', 'failed', 'returned',
]);

export const LOCATION_MODE = Object.freeze(['studio', 'customer_location', 'both']);
export const SHIPPING_METHOD = Object.freeze(['manual_quote', 'distance_based', 'courier']);

export const ERROR_CODES = Object.freeze([
  'unauthenticated', 'permission-denied', 'tenant-not-found', 'tenant-suspended',
  'invalid-argument', 'resource-not-found', 'failed-precondition', 'already-exists',
  'out-of-stock', 'booking-conflict', 'payment-mismatch', 'shipping-unavailable',
  'rate-limited', 'internal',
]);

export const ROLE_GROUPS = Object.freeze({
  ADMIN: ['owner', 'admin'],
  CONTENT: ['owner', 'admin', 'content_manager'],
  FINANCE: ['owner', 'finance_manager'],
});

export const PAYMENT_METHODS = Object.freeze(['bank_transfer', 'dana', 'ovo', 'gopay', 'shopeepay', 'qris']);
