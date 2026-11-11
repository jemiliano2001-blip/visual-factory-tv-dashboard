/**
 * Convierte lo elegido en el diálogo de solicitudes en los borradores que
 * espera POST /api/invoice-requests. Sin imports de firebase (se prueba en Node).
 */
import { actorLabel, linePendingQty, lineRemainingQty, type InvoiceRequest, type RequestDraft, type RequestType } from '../../shared/invoiceRequests';

export interface OrderChoice { orderId: number; type: RequestType | null; lineQty: Record<number, number> }

export function buildDrafts(choices: OrderChoice[]): RequestDraft[] {
  const drafts: RequestDraft[] = [];
  for (const { orderId, type, lineQty } of choices) {
    if (type === 'factura') drafts.push({ orderId, type });
    else if (type === 'remision') {
      const lines = Object.entries(lineQty)
        .map(([lineId, qty]) => ({ lineId: Number(lineId), qty }))
        .filter(l => l.qty > 0);
      if (lines.length > 0) drafts.push({ orderId, type, lines });
    }
  }
  return drafts;
}

/** null = se puede pedir; si no, el motivo en español. `pending` son las pendientes de ESA orden. */
export function requestAvailability(
  order: { lines: Array<{ id?: number; qty: number; delivered: number }> },
  pending: InvoiceRequest[],
): { factura: string | null; remision: string | null } {
  const already = (type: RequestType) => {
    const r = pending.find(p => p.type === type);
    return r ? `Ya la pidió ${actorLabel(r.requestedBy)}` : null;
  };
  // Una remisión pendiente no bloquea otra: se pueden pedir remisiones sucesivas hasta cubrir lo que falta.
  const remision = order.lines.some(l => l.id !== undefined && lineRemainingQty(l, pending) > 0)
    ? null
    : order.lines.some(l => l.id !== undefined && linePendingQty(l) > 0)
      ? 'Ya pidieron todas las piezas que faltan'
      : 'No hay piezas pendientes de entregar';
  return { factura: already('factura'), remision };
}
