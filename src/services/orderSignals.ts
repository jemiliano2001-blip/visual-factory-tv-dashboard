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
  const commitment = parseOrderSignalDate(order.commitment_date);
  return commitment ? commitment.getTime() < Date.now() : false;
}

export function getOrderSignalProgress(order: OdooSaleOrder): number {
  if (!order.qty_total) return 0;
  return Math.min(100, Math.round((order.qty_delivered / order.qty_total) * 100));
}

export function isOrderSignalFullyDelivered(order: OdooSaleOrder): boolean {
  const active = (order.deliveries ?? []).filter(delivery => delivery.state !== 'cancel');
  return active.length > 0 && active.every(delivery => delivery.state === 'done');
}
