/**
 * Solicitudes de factura/remisión sobre órdenes de venta. Lógica pura, sin
 * imports (la consumen server.ts y las Functions en commonjs).
 */

export type RequestType = 'factura' | 'remision';
export interface RequestActor { uid: string; email: string | null; name: string | null }
/** `deliveredAtRequest`: piezas ya entregadas al pedir, para no descontar dos veces lo que Mari ya entregó. */
export interface InvoiceRequestLine { lineId: number; name: string; qty: number; unit: string | null; deliveredAtRequest?: number }
export interface InvoiceRequest {
  id: string;
  orderId: number;
  orderName: string;
  partnerName: string;
  customerReference: string | null;
  type: RequestType;
  lines?: InvoiceRequestLine[];
  status: 'pendiente' | 'hecha';
  requestedBy: RequestActor;
  requestedAt: string;
  doneBy?: RequestActor;
  doneAt?: string;
}
export interface InvoiceRequestsState { requests: InvoiceRequest[]; updatedAt: string }
export interface RequestableOrder {
  id: number;
  name: string;
  partner_name: string;
  customer_reference?: string | null;
  lines: Array<{ id?: number; name: string; qty: number; delivered: number; unit?: string | null }>;
}
export interface RequestDraft { orderId: number; type: RequestType; lines?: Array<{ lineId: number; qty: number }> }
export interface SkippedRequest { orderId: number; orderName: string | null; reason: string }

export const MAX_DONE_KEPT = 200;
export const MAX_DRAFTS = 100;
/** Tope de pendientes: viven en un solo documento de Firestore (1 MiB). */
export const MAX_PENDING = 300;
const MAX_STATE_CHARS = 800_000;
const EPS = 1e-6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const isPosInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;
const isPosNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const strOrNull = (v: unknown): string | null | undefined => (v === null || v === undefined ? null : typeof v === 'string' ? v : undefined);

export function linePendingQty(line: { qty: number; delivered: number }): number {
  return round6(Math.max(0, line.qty - line.delivered));
}

/** Lo que aún se puede pedir en una remisión: pendiente de entrega menos lo ya pedido en remisiones pendientes. */
export function lineRemainingQty(line: { id?: number; qty: number; delivered: number }, pendingForOrder: InvoiceRequest[]): number {
  let requested = 0;
  for (const r of pendingForOrder) {
    if (r.status !== 'pendiente' || r.type !== 'remision') continue;
    for (const l of r.lines ?? []) {
      if (l.lineId !== line.id) continue;
      const shipped = l.deliveredAtRequest === undefined ? 0 : Math.max(0, line.delivered - l.deliveredAtRequest);
      requested += Math.max(0, l.qty - shipped);
    }
  }
  return round6(Math.max(0, linePendingQty(line) - requested));
}

export function clampQty(qty: number, max: number): number {
  if (!Number.isFinite(qty) || qty <= 0 || !(max > 0)) return 0;
  return round6(Math.min(qty, max));
}

export function actorLabel(actor: RequestActor): string {
  return actor.name || actor.email || actor.uid;
}

function parseActor(raw: unknown): RequestActor | null {
  if (!isRecord(raw) || typeof raw.uid !== 'string' || !raw.uid) return null;
  const email = strOrNull(raw.email);
  const name = strOrNull(raw.name);
  if (email === undefined || name === undefined) return null;
  return { uid: raw.uid, email, name };
}

function parseRequest(raw: unknown): InvoiceRequest | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string' || !raw.id || !isPosInt(raw.orderId)) return null;
  if (typeof raw.orderName !== 'string' || typeof raw.partnerName !== 'string' || typeof raw.requestedAt !== 'string') return null;
  if (raw.type !== 'factura' && raw.type !== 'remision') return null;
  if (raw.status !== 'pendiente' && raw.status !== 'hecha') return null;
  const customerReference = strOrNull(raw.customerReference);
  const requestedBy = parseActor(raw.requestedBy);
  if (customerReference === undefined || !requestedBy) return null;
  const out: InvoiceRequest = {
    id: raw.id, orderId: raw.orderId, orderName: raw.orderName, partnerName: raw.partnerName,
    customerReference, type: raw.type, status: raw.status, requestedBy, requestedAt: raw.requestedAt,
  };
  if (raw.type === 'remision') {
    if (!Array.isArray(raw.lines) || raw.lines.length === 0) return null;
    const lines: InvoiceRequestLine[] = [];
    for (const l of raw.lines) {
      const unit = isRecord(l) ? strOrNull(l.unit) : undefined;
      if (!isRecord(l) || !isPosInt(l.lineId) || typeof l.name !== 'string' || !isPosNum(l.qty) || unit === undefined) return null;
      lines.push({ lineId: l.lineId, name: l.name, qty: l.qty, unit, ...(isPosNum(l.deliveredAtRequest) || l.deliveredAtRequest === 0 ? { deliveredAtRequest: l.deliveredAtRequest as number } : {}) });
    }
    out.lines = lines;
  }
  if (raw.status === 'hecha') {
    const doneBy = parseActor(raw.doneBy);
    if (!doneBy || typeof raw.doneAt !== 'string') return null;
    out.doneBy = doneBy;
    out.doneAt = raw.doneAt;
  }
  return out;
}

/** Conserva todas las pendientes y las hechas más recientes que quepan en límites de cantidad y tamaño. */
function trim(state: InvoiceRequestsState): InvoiceRequestsState {
  const doneSorted = state.requests
    .filter(r => r.status === 'hecha')
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
  let kept = doneSorted.slice(0, MAX_DONE_KEPT);
  const build = (): InvoiceRequestsState => {
    const keep = new Set(kept);
    return { requests: state.requests.filter(r => r.status === 'pendiente' || keep.has(r)), updatedAt: state.updatedAt };
  };
  let out = build();
  while (kept.length > 0 && JSON.stringify(out).length > MAX_STATE_CHARS) {
    kept = kept.slice(0, Math.max(0, kept.length - Math.max(1, Math.floor(kept.length / 10))));
    out = build();
  }
  return out;
}

export function normalizeInvoiceRequests(raw: unknown): InvoiceRequestsState {
  const source = isRecord(raw) ? raw : {};
  const requests: InvoiceRequest[] = [];
  if (Array.isArray(source.requests)) {
    for (const item of source.requests) {
      const r = parseRequest(item);
      if (r) requests.push(r);
    }
  }
  return trim({ requests, updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : '' });
}

export function parseCreateRequestsBody(body: unknown): RequestDraft[] {
  const list = Array.isArray(body) ? body : isRecord(body) ? body.requests : undefined;
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_DRAFTS) {
    throw new Error(`Envía entre 1 y ${MAX_DRAFTS} solicitudes.`);
  }
  return list.map((item): RequestDraft => {
    if (!isRecord(item)) throw new Error('Solicitud inválida.');
    if (!isPosInt(item.orderId)) throw new Error('orderId inválido.');
    if (item.type === 'factura') return { orderId: item.orderId, type: 'factura' };
    if (item.type !== 'remision') throw new Error('Tipo de solicitud inválido.');
    if (!Array.isArray(item.lines) || item.lines.length === 0) throw new Error('La remisión necesita al menos una pieza.');
    const lines = item.lines.map(l => {
      if (!isRecord(l) || !isPosInt(l.lineId) || !isPosNum(l.qty)) throw new Error('Pieza inválida: lineId entero y cantidad mayor a 0.');
      return { lineId: l.lineId, qty: l.qty };
    });
    return { orderId: item.orderId, type: 'remision', lines };
  });
}

type DraftResult = { request: InvoiceRequest } | { reason: string };

function buildRequest(draft: RequestDraft, order: RequestableOrder, pendingForOrder: InvoiceRequest[], id: string, actor: RequestActor, now: string): DraftResult {
  const base: InvoiceRequest = {
    id, orderId: order.id, orderName: order.name, partnerName: order.partner_name,
    customerReference: order.customer_reference ?? null, type: draft.type, status: 'pendiente',
    requestedBy: actor, requestedAt: now,
  };
  if (draft.type === 'factura') return { request: base };
  if (!order.lines.some(l => l.id !== undefined && lineRemainingQty(l, pendingForOrder) > EPS)) {
    return { reason: `La orden ${order.name} no tiene piezas pendientes de entrega, o ya están pedidas en otra remisión.` };
  }
  if (!draft.lines || draft.lines.length === 0) return { reason: 'La remisión necesita al menos una pieza.' };
  const seen = new Set<number>();
  const lines: InvoiceRequestLine[] = [];
  for (const dl of draft.lines) {
    const line = order.lines.find(l => l.id !== undefined && l.id === dl.lineId);
    if (!line) return { reason: `La pieza ${dl.lineId} no existe en la orden ${order.name}.` };
    if (seen.has(dl.lineId)) return { reason: `La pieza ${line.name} está repetida.` };
    seen.add(dl.lineId);
    const remaining = lineRemainingQty(line, pendingForOrder);
    if (dl.qty > remaining + EPS) return { reason: `La cantidad de ${line.name} excede lo que falta por pedir (${remaining}).` };
    const qty = clampQty(dl.qty, remaining);
    if (!(qty > 0)) return { reason: `La cantidad de ${line.name} debe ser mayor a 0.` };
    lines.push({ lineId: dl.lineId, name: line.name, qty, unit: line.unit ?? null, deliveredAtRequest: line.delivered });
  }
  return { request: { ...base, lines } };
}

export function createInvoiceRequests(
  state: InvoiceRequestsState,
  drafts: RequestDraft[],
  orders: RequestableOrder[],
  ctx: { actor: RequestActor; now: string; newId: () => string },
): { state: InvoiceRequestsState; created: InvoiceRequest[]; skipped: SkippedRequest[] } {
  const pendingAll = state.requests.filter(r => r.status === 'pendiente');
  const pendingFacturas = new Set(pendingAll.filter(r => r.type === 'factura').map(r => r.orderId));
  let pendingCount = pendingAll.length;
  const created: InvoiceRequest[] = [];
  const skipped: SkippedRequest[] = [];
  for (const draft of drafts) {
    const order = orders.find(o => o.id === draft.orderId);
    const skip = (reason: string) => skipped.push({ orderId: draft.orderId, orderName: order?.name ?? null, reason });
    if (!order) { skip('La orden ya no está disponible en el catálogo.'); continue; }
    if (draft.type === 'factura' && pendingFacturas.has(order.id)) { skip(`Ya hay una solicitud pendiente de factura para ${order.name}.`); continue; }
    if (pendingCount >= MAX_PENDING) { skip('Hay demasiadas solicitudes pendientes; pide a facturación que marque las que ya están hechas.'); continue; }
    const pendingForOrder = [...pendingAll, ...created].filter(r => r.orderId === order.id);
    const result = buildRequest(draft, order, pendingForOrder, ctx.newId(), ctx.actor, ctx.now);
    if ('reason' in result) { skip(result.reason); continue; }
    if (draft.type === 'factura') pendingFacturas.add(order.id);
    pendingCount += 1;
    created.push(result.request);
  }
  if (created.length === 0) return { state, created, skipped };
  const next = trim({ requests: [...[...created].reverse(), ...state.requests], updatedAt: ctx.now });
  return { state: next, created, skipped };
}

export function markInvoiceRequestDone(
  state: InvoiceRequestsState,
  id: string,
  ctx: { actor: RequestActor; now: string },
): InvoiceRequestsState {
  const target = state.requests.find(r => r.id === id);
  if (!target) throw new Error('No se encontró la solicitud.');
  if (target.status === 'hecha') return state;
  const updated: InvoiceRequest = { ...target, status: 'hecha', doneBy: ctx.actor, doneAt: ctx.now };
  return trim({ requests: state.requests.map(r => (r === target ? updated : r)), updatedAt: ctx.now });
}

export function pendingRequestsByOrder(state: InvoiceRequestsState): Map<number, InvoiceRequest[]> {
  const map = new Map<number, InvoiceRequest[]>();
  for (const r of state.requests) {
    if (r.status !== 'pendiente') continue;
    const list = map.get(r.orderId);
    if (list) list.push(r);
    else map.set(r.orderId, [r]);
  }
  return map;
}
