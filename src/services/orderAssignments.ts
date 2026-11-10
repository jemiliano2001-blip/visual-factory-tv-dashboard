/**
 * Cliente de /api/order-assignments: qué ingeniero/diseñador de SMV lleva cada
 * SO. Se guarda copia en localStorage para pintar al instante y se sincroniza
 * con el proxy (mismo esquema de auth que services/odoo.ts).
 */
import { getIdTokenOrThrow } from '../firebase';
import {
  normalizeOrderAssignments, type OrderAssignmentsPatch, type OrderAssignmentsPayload,
} from '../../shared/orderAssignments';

const CACHE_KEY = 'visual_factory_order_assignments_v1';
const PROXY_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ODOO_PROXY_URL) || '';

export function loadCachedAssignments(): OrderAssignmentsPayload {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return normalizeOrderAssignments(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeOrderAssignments(null);
  }
}

export function cacheAssignments(payload: OrderAssignmentsPayload): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // sin almacenamiento disponible: el servidor sigue siendo la fuente
  }
}

async function request(method: 'GET' | 'POST', body?: OrderAssignmentsPatch): Promise<OrderAssignmentsPayload> {
  const headers: Record<string, string> = { Authorization: `Bearer ${await getIdTokenOrThrow()}` };
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${PROXY_BASE}/api/order-assignments`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
    throw new Error(err.error || `Error HTTP ${response.status}`);
  }
  const payload = normalizeOrderAssignments(await response.json());
  cacheAssignments(payload);
  return payload;
}

export const fetchOrderAssignments = () => request('GET');

export const updateOrderAssignments = (patch: OrderAssignmentsPatch) => request('POST', patch);
