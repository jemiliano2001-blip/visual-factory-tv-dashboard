/**
 * Cliente de /api/invoice-requests: solicitudes de factura/remisión sobre SO.
 * Lanza Error en español ante cualquier fallo para que React Query conserve
 * el último estado bueno (mismo esquema de auth que services/odoo.ts).
 */
import { getIdTokenOrThrow } from '../firebase';
import type { InvoiceRequest, InvoiceRequestsState, RequestDraft, SkippedRequest } from '../../shared/invoiceRequests';

export { buildDrafts, type OrderChoice } from './invoiceDrafts';

export type CreateInvoiceRequestsResult = {
  state: InvoiceRequestsState;
  created: InvoiceRequest[];
  skipped: SkippedRequest[];
  notified: boolean;
};

const PROXY_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ODOO_PROXY_URL) || '';

async function request<T>(path: string, method: 'GET' | 'POST', body?: RequestDraft[], timeoutMs = 15000): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${await getIdTokenOrThrow()}` };
  if (body) headers['Content-Type'] = 'application/json';
  let response: Response;
  try {
    response = await fetch(`${PROXY_BASE}/api/invoice-requests${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor.');
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || `Error HTTP ${response.status}`);
  }
  return await response.json() as T;
}

export const fetchInvoiceRequests = () => request<InvoiceRequestsState>('', 'GET');

export const submitInvoiceRequests = (drafts: RequestDraft[]) =>
  request<CreateInvoiceRequestsResult>('', 'POST', drafts, 45000);

export const markInvoiceRequestDoneRemote = (id: string) =>
  request<InvoiceRequestsState>(`/${encodeURIComponent(id)}/done`, 'POST');
