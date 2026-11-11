/** Cliente de POST /api/invoice-request: pide a Mari las facturas de las SO elegidas. */
import { getIdTokenOrThrow } from '../firebase';

const PROXY_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ODOO_PROXY_URL) || '';

export async function requestInvoices(orderNames: string[]): Promise<string[]> {
  const response = await fetch(`${PROXY_BASE}/api/invoice-request`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await getIdTokenOrThrow()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ orders: orderNames }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
    throw new Error(err.error || `Error HTTP ${response.status}`);
  }
  return ((await response.json()) as { sent: string[] }).sent;
}
