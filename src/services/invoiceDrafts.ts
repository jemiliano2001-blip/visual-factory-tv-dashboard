/**
 * Convierte lo elegido en el diálogo de solicitudes en los borradores que
 * espera POST /api/invoice-requests. Sin imports de firebase (se prueba en Node).
 */
import { actorLabel, allowsPartialInvoice, linePendingQty, lineInvoiceRemaining, lineRemainingQty, type InvoiceRequest, type RequestDraft, type RequestType } from '../../shared/invoiceRequests';
import { isOhdPartner, suggestSatOhdCode } from '../../shared/satOhd';

/** `sat`: clave SAT por partida (solo OHD); '' = sin clave. `note`: nota para Mary. `partial`: factura por partida (Fisher/Kohler). */
export interface OrderChoice {
  orderId: number;
  type: RequestType | null;
  lineQty: Record<number, number>;
  sat?: Record<number, string>;
  partial?: boolean;
  note?: string;
}

type SatOrder = { partner_name: string; lines: Array<{ id?: number; name: string; qty: number }> };

export function buildDrafts(choices: OrderChoice[]): RequestDraft[] {
  const drafts: RequestDraft[] = [];
  for (const { orderId, type, lineQty, sat, partial, note } of choices) {
    const piezas = () => Object.entries(lineQty)
      .map(([lineId, qty]) => ({ lineId: Number(lineId), qty }))
      .filter(l => l.qty > 0);
    const satKeys = (ids: number[]) => (sat ? { satKeys: ids.flatMap(id => (sat[id] ? [{ lineId: id, code: sat[id] }] : [])) } : {});
    const withNote = note?.trim() ? { note: note.trim() } : {};
    if (type === 'factura' && partial) {
      const lines = piezas();
      if (lines.length > 0) drafts.push({ orderId, type, lines, ...withNote });
    } else if (type === 'factura') drafts.push({ orderId, type, ...satKeys(Object.keys(sat ?? {}).map(Number)), ...withNote });
    else if (type === 'remision') {
      const lines = piezas();
      if (lines.length > 0) drafts.push({ orderId, type, lines, ...satKeys(lines.map(l => l.lineId)), ...withNote });
    }
  }
  return drafts;
}

/** Claves SAT iniciales de una orden de OHD (sugeridas por la descripción); undefined si no es OHD. */
export function suggestedSat(order: SatOrder): Record<number, string> | undefined {
  if (!isOhdPartner(order.partner_name)) return undefined;
  return Object.fromEntries(order.lines
    .filter(l => l.id !== undefined && l.qty > 0)
    .map(l => [l.id as number, suggestSatOhdCode(l.name) ?? '']));
}

/**
 * Partidas de OHD sin clave (informativo; ya no bloquea el envío).
 * @deprecated el diálogo no usa esto como gate; se conserva para tests/diagnóstico.
 */
export function missingSatCount(order: SatOrder, choice: Omit<OrderChoice, 'orderId'>): number {
  if (!isOhdPartner(order.partner_name) || choice.type === null) return 0;
  const ids = choice.type === 'factura'
    ? order.lines.filter(l => l.id !== undefined && l.qty > 0).map(l => l.id as number)
    : Object.entries(choice.lineQty).filter(([, qty]) => qty > 0).map(([id]) => Number(id));
  return ids.filter(id => !choice.sat?.[id]).length;
}

/** null = se puede pedir; si no, el motivo en español. `pending` son las pendientes de ESA orden. */
export function requestAvailability(
  order: { partner_name?: string; lines: Array<{ id?: number; qty: number; delivered: number; invoiced?: number }> },
  pending: InvoiceRequest[],
): { factura: string | null; remision: string | null } {
  const already = (type: RequestType) => {
    const r = pending.find(p => p.type === type);
    return r ? `Ya la pidió ${actorLabel(r.requestedBy)}` : null;
  };
  const factura = order.partner_name && allowsPartialInvoice(order.partner_name)
    ? order.lines.some(l => l.id !== undefined && lineInvoiceRemaining(l, pending) > 0) ? null : 'Ya está todo facturado o pedido'
    : already('factura');
  const remision = order.lines.some(l => l.id !== undefined && lineRemainingQty(l, pending) > 0)
    ? null
    : order.lines.some(l => l.id !== undefined && linePendingQty(l) > 0)
      ? 'Ya pidieron todas las piezas que faltan'
      : 'No hay piezas pendientes de entregar';
  return { factura, remision };
}
