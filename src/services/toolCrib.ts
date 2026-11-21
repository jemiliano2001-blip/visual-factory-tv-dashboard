/**
 * Tool Crib: órdenes de Suprajit (piezas repetitivas con plano ya existente).
 * Lógica pura de la vista Tool Crib del Admin; la regla de cliente es la misma
 * que usa SMV Vision (nombre que contiene "SUPRAJIT").
 */
import type { InvoiceRequest } from '../../shared/invoiceRequests';
import type { OdooOrderLine, OdooSaleOrder } from './odoo';
import { compareByUrgency } from './pendingItems';

export const TOOL_CRIB_PARTNER_KEY = 'SUPRAJIT';

export type ToolCribLineStatus = 'pendiente' | 'solicitada' | 'entregada';

export interface ToolCribLine {
  order: OdooSaleOrder;
  line: OdooOrderLine;
  /** Número de parte entre corchetes en la descripción; null si no trae. */
  partNumber: string | null;
  /** Cantidad pendiente de entregar (nunca negativa). */
  missing: number;
  status: ToolCribLineStatus;
}

export function isToolCribOrder(order: OdooSaleOrder): boolean {
  return order.partner_name.toLocaleUpperCase('es-MX').includes(TOOL_CRIB_PARTNER_KEY);
}

export function extractPartNumber(lineName: string): string | null {
  const match = /^\[(.*?)\]/.exec(lineName);
  const part = match?.[1].trim();
  return part ? part : null;
}

const SERVICE_LINE = /servicio/i;

function orderLines(order: OdooSaleOrder): OdooOrderLine[] {
  return order.lines && order.lines.length > 0
    ? order.lines
    : [{ name: order.main_product, qty: order.qty_total, delivered: order.qty_delivered }];
}

/** Partidas de las órdenes Tool Crib, la orden más urgente primero. */
export function collectToolCribLines(
  orders: OdooSaleOrder[],
  requestsByOrder?: Map<number, InvoiceRequest[]>,
): ToolCribLine[] {
  return orders
    .filter(isToolCribOrder)
    .sort(compareByUrgency)
    .flatMap(order => {
      const requested = (requestsByOrder?.get(order.id)?.length ?? 0) > 0;
      return orderLines(order)
        .filter(line => !SERVICE_LINE.test(line.name))
        .map((line): ToolCribLine => {
          const missing = Math.max(0, line.qty - line.delivered);
          return {
            order,
            line,
            partNumber: extractPartNumber(line.name),
            missing,
            status: requested ? 'solicitada' : missing === 0 ? 'entregada' : 'pendiente',
          };
        });
    });
}
