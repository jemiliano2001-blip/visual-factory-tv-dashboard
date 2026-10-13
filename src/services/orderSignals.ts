import type { OdooSaleOrder } from './odoo';

export type OrderPriority = 'low' | 'normal' | 'high' | 'critical';

export function parseOrderSignalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = value.includes('T')
    ? value
    : value.includes(' ')
      ? `${value.replace(' ', 'T')}Z`
      : `${value}T00:00:00Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getOrderSignalPriority(order: OdooSaleOrder): OrderPriority {
  if (isOrderSignalFullyDelivered(order)) return 'normal';
  const commitment = parseOrderSignalDate(order.commitment_date);
  if (!commitment) return 'normal';
  const diffMs = commitment.getTime() - Date.now();
  if (diffMs < 0) return 'critical';
  const diffDays = diffMs / 86_400_000;
  if (diffDays <= 2) return 'high';
  if (diffDays <= 7) return 'normal';
  return 'low';
}

export function isOrderSignalOverdue(order: OdooSaleOrder): boolean {
  if (isOrderSignalFullyDelivered(order)) return false;
  const commitment = parseOrderSignalDate(order.commitment_date);
  return commitment ? commitment.getTime() < Date.now() : false;
}

export function getOrderSignalProgress(order: OdooSaleOrder): number {
  const lines = order.lines.filter(line => line.qty > 0);
  if (!lines.length) {
    if (!order.qty_total) return 0;
    const percent = Math.max(0, order.qty_delivered / order.qty_total) * 100;
    return Math.min(order.qty_delivered >= order.qty_total ? 100 : 99, Math.round(percent));
  }
  // Cada partida pesa igual: sumar piezas con sets distorsiona el avance.
  const percent = lines.reduce((sum, line) => sum + Math.min(1, Math.max(0, line.delivered / line.qty)), 0) / lines.length * 100;
  return Math.min(lines.every(line => line.delivered >= line.qty) ? 100 : 99, Math.round(percent));
}

export function isOrderSignalFullyDelivered(order: OdooSaleOrder): boolean {
  const lines = order.lines.filter(line => line.qty > 0);
  return lines.length > 0
    ? lines.every(line => line.delivered >= line.qty)
    : order.qty_total > 0 && order.qty_delivered >= order.qty_total;
}

export function matchesTVStatus(order: OdooSaleOrder, status: 'all' | 'delivered' | 'overdue' | 'pending' | 'critical'): boolean {
  if (status === 'all') return true; // Todo lo recibido sigue pendiente de facturación.
  if (status === 'delivered') return isOrderSignalFullyDelivered(order);
  if (status === 'overdue') return isOrderSignalOverdue(order);
  if (status === 'pending') return !isOrderSignalFullyDelivered(order) && !isOrderSignalOverdue(order);
  const priority = getOrderSignalPriority(order);
  return priority === 'critical' || priority === 'high';
}
