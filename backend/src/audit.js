import { FieldValue } from 'firebase-admin/firestore';

// Jangan isi `summary` dengan password, token, atau data pembayaran lengkap.
export function auditEntry({ actorUid, tenantId, action, resourceType, resourceId, result = 'success', summary = {} }) {
  return { actorUid, tenantId, action, resourceType, resourceId, result, summary, timestamp: FieldValue.serverTimestamp() };
}
