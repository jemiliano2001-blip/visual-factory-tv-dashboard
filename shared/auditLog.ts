/**
 * Constructor puro de entradas para la colección append-only `audit_logs`.
 * Omite deliberadamente PII sensible (correos electrónicos) y limita longitudes.
 */

export type AuditAction =
  | 'invoice_requests.create'
  | 'invoice_requests.done'
  | 'order_assignments.claim'
  | 'order_assignments.follow'
  | 'order_assignments.release'
  | 'order_assignments.assign'
  | 'auth.write_denied'
  | 'cron.task_failed';

export type AuditOutcome = 'success' | 'denied' | 'error';

export interface AuditActor {
  uid: string;
  name?: string | null;
}

export interface AuditLogEntry {
  action: AuditAction;
  actorUid: string;
  actorName: string | null;
  resource: string;
  outcome: AuditOutcome;
  requestId: string | null;
  details: Record<string, string | number | boolean | null>;
  createdAt: string;
}

const MAX_ACTOR_NAME = 80;
const MAX_DETAIL_STRING = 200;
const MAX_DETAILS_KEYS = 20;
const MAX_REQUEST_ID = 64;

export function buildAuditEntry(input: {
  action: AuditAction;
  actor: AuditActor;
  resource: string;
  outcome: AuditOutcome;
  requestId?: string | null;
  details?: Record<string, unknown>;
  now?: string;
}): AuditLogEntry {
  const actorUid = String(input.actor.uid || 'system').slice(0, 128);
  const rawName = typeof input.actor.name === 'string' ? input.actor.name.replace(/\s+/g, ' ').trim() : '';
  const actorName = rawName ? rawName.slice(0, MAX_ACTOR_NAME) : null;
  const rawRequestId = typeof input.requestId === 'string' ? input.requestId.trim() : '';
  const requestId = rawRequestId ? rawRequestId.slice(0, MAX_REQUEST_ID) : null;

  const details: Record<string, string | number | boolean | null> = {};
  if (input.details) {
    let count = 0;
    for (const [k, v] of Object.entries(input.details)) {
      if (count >= MAX_DETAILS_KEYS) break;
      const lower = k.toLowerCase();
      if (lower.includes('email') || lower.includes('token') || lower.includes('password') || lower.includes('secret')) {
        continue;
      }
      if (v === null || typeof v === 'boolean') {
        details[k] = v;
        count++;
      } else if (typeof v === 'number' && Number.isFinite(v)) {
        details[k] = v;
        count++;
      } else if (typeof v === 'string') {
        details[k] = v.slice(0, MAX_DETAIL_STRING);
        count++;
      }
    }
  }

  return {
    action: input.action,
    actorUid,
    actorName,
    resource: String(input.resource).slice(0, 128),
    outcome: input.outcome,
    requestId,
    details,
    createdAt: input.now ?? new Date().toISOString(),
  };
}
