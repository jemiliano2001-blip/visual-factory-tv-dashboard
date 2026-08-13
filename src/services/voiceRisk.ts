import { formatPONumber } from '../utils/formatters';
import type { OdooSaleOrder } from './odoo';
import {
  getOrderSignalPriority,
  getOrderSignalProgress,
  isOrderSignalFullyDelivered,
  isOrderSignalOverdue,
  parseOrderSignalDate,
} from './orderSignals';

export type VoiceRiskStatus = 'overdue' | 'pending' | 'delivered' | 'critical';

export interface VoiceRiskOrder {
  rank: number;
  po_number: string;
  client: string;
  product: string;
  status: VoiceRiskStatus;
  delivery_progress: string;
  commitment_date: string | null;
  urgency_signal: string;
  reason: string;
}

export interface VoiceRiskFocusCandidate {
  po_number?: unknown;
  reason?: unknown;
}

export interface VoiceRiskFocusResponse {
  action?: unknown;
  risk_orders?: unknown;
}

function getRiskStatus(order: OdooSaleOrder): VoiceRiskStatus {
  if (isOrderSignalFullyDelivered(order)) return 'delivered';
  if (isOrderSignalOverdue(order)) return 'overdue';
  const priority = getOrderSignalPriority(order);
  return priority === 'critical' || priority === 'high' ? 'critical' : 'pending';
}

function getUrgencySignal(order: OdooSaleOrder): string {
  if (isOrderSignalFullyDelivered(order)) return 'Entregada';
  if (isOrderSignalOverdue(order)) return 'Vencida';
  const priority = getOrderSignalPriority(order);
  if (priority === 'critical' || priority === 'high') return 'Compromiso próximo';
  return 'En seguimiento';
}

function normalizePO(value: string): string {
  return formatPONumber(value).toUpperCase();
}

function isRiskCandidate(value: unknown): value is VoiceRiskFocusCandidate {
  return typeof value === 'object' && value !== null;
}

export function buildVoiceRiskCatalog(orders: OdooSaleOrder[]): Array<Omit<VoiceRiskOrder, 'rank' | 'reason'>> {
  return orders.map(order => ({
    po_number: formatPONumber(order.name),
    client: order.partner_name,
    product: order.main_product,
    status: getRiskStatus(order),
    delivery_progress: `${order.qty_delivered}/${order.qty_total} (${getOrderSignalProgress(order)}%)`,
    commitment_date: parseOrderSignalDate(order.commitment_date)?.toISOString() ?? null,
    urgency_signal: getUrgencySignal(order),
  }));
}

/** Returns null for any malformed, stale, duplicated, or overlong Gemini selection. */
export function validateVoiceRiskFocus(
  candidate: VoiceRiskFocusResponse,
  activeOrders: OdooSaleOrder[],
): VoiceRiskOrder[] | null {
  if (candidate.action !== 'focus' || !Array.isArray(candidate.risk_orders)) return null;
  if (candidate.risk_orders.length === 0 || candidate.risk_orders.length > 3) return null;

  const byPO = new Map(activeOrders.map(order => [normalizePO(order.name), order]));
  const seen = new Set<string>();
  const result: VoiceRiskOrder[] = [];

  for (const item of candidate.risk_orders) {
    if (!isRiskCandidate(item) || typeof item.po_number !== 'string' || typeof item.reason !== 'string') return null;
    const po = normalizePO(item.po_number);
    const reason = item.reason.trim();
    if (!po || !reason || seen.has(po)) return null;
    const order = byPO.get(po);
    if (!order) return null;
    seen.add(po);
    result.push({
      rank: result.length + 1,
      po_number: formatPONumber(order.name),
      client: order.partner_name,
      product: order.main_product,
      status: getRiskStatus(order),
      delivery_progress: `${order.qty_delivered}/${order.qty_total} (${getOrderSignalProgress(order)}%)`,
      commitment_date: parseOrderSignalDate(order.commitment_date)?.toISOString() ?? null,
      urgency_signal: getUrgencySignal(order),
      reason,
    });
  }

  return result;
}

export function getVoiceRiskFocusedOrders(orders: OdooSaleOrder[], focusedPOs: string[]): OdooSaleOrder[] {
  if (focusedPOs.length === 0) return orders;
  const byPO = new Map(orders.map(order => [normalizePO(order.name), order]));
  return focusedPOs.flatMap(po => {
    const order = byPO.get(normalizePO(po));
    return order ? [order] : [];
  });
}

export function isVoiceRiskQuestion(transcript: string): boolean {
  const text = transcript.trim().toLowerCase();
  return /\b(atenci[oó]n\s+hoy|m[aá]s\s+(?:urgente|atrasada)|mayor(?:es)?\s+riesgo|riesgos?|prioridades?)\b/.test(text)
    || /^(?:hay|cu[aá]nt[oa]s?)\b.*\b(urgente|cr[ií]tic|vencid|atrasad)/.test(text);
}
