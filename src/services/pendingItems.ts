/**
 * Desglose de lo pendiente por entregar, por línea de producto — la vista de
 * trabajo del equipo de diseño ("¿qué me falta?"). Fuente única para el tab
 * Pendientes, la columna "Qué falta" de la tabla de Órdenes y el export a Excel.
 */
import { OdooSaleOrder, OdooOrderLine, getOrderStatus, parseOdooDate } from './odoo';

export interface PendingLine {
  order: OdooSaleOrder;
  line: OdooOrderLine;
  /** Cantidad pendiente de esta línea (nunca negativa). */
  missing: number;
}

/** Líneas con cantidad pendiente > 0 para una orden. Si no hay detalle de líneas,
 * cae a una línea sintética con el total/entregado agregado de la orden. */
export function getPendingLines(order: OdooSaleOrder): PendingLine[] {
  const lines = order.lines && order.lines.length > 0
    ? order.lines
    : [{ name: order.main_product, qty: order.qty_total, delivered: order.qty_delivered }];

  return lines
    .map(line => ({ order, line, missing: Math.max(0, line.qty - line.delivered) }))
    .filter(pl => pl.missing > 0);
}

/** Total de piezas pendientes de una orden (suma de sus líneas pendientes). */
export function getOrderMissingQty(order: OdooSaleOrder): number {
  return getPendingLines(order).reduce((sum, pl) => sum + pl.missing, 0);
}

/** Compara dos órdenes por urgencia: nivel de estado, luego fecha compromiso (nulos al final). */
export function compareByUrgency(a: OdooSaleOrder, b: OdooSaleOrder): number {
  const LEVEL_RANK: Record<string, number> = { overdue: 0, warning: 1, 'on-time': 2, none: 3 };
  const rankDiff = LEVEL_RANK[getOrderStatus(a).level] - LEVEL_RANK[getOrderStatus(b).level];
  if (rankDiff !== 0) return rankDiff;

  const da = parseOdooDate(a.commitment_date)?.getTime() ?? Infinity;
  const db = parseOdooDate(b.commitment_date)?.getTime() ?? Infinity;
  return da - db;
}

/** Todas las líneas pendientes de un conjunto de órdenes, ordenadas por urgencia de su orden. */
export function collectPendingLines(orders: OdooSaleOrder[]): PendingLine[] {
  return [...orders]
    .sort(compareByUrgency)
    .flatMap(getPendingLines);
}
