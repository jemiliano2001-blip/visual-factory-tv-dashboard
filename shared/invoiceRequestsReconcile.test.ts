import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadOrderSnapshots,
  ODOO_AUTO_ACTOR,
  reconcileWithOdoo,
  type InvoiceRequest,
  type InvoiceRequestsState,
  type OdooOrderSnapshot,
  type RequestActor,
} from './invoiceRequests.ts';

const actor: RequestActor = { uid: 'u1', email: 'a@smv.mx', name: 'Ana' };
const NOW = '2026-11-11T12:00:00.000Z';

function req(over: Partial<InvoiceRequest> & { id: string }): InvoiceRequest {
  return {
    orderId: 10, orderName: 'S00010', partnerName: 'Cliente SA', customerReference: null,
    type: 'remision', status: 'pendiente', requestedBy: actor, requestedAt: '2026-11-01T00:00:00.000Z',
    ...over,
  };
}
const remision = (id: string, qty: number, deliveredAtRequest: number | undefined, lineId = 1) =>
  req({ id, lines: [{ lineId, name: 'Placa', qty, unit: 'pza', ...(deliveredAtRequest === undefined ? {} : { deliveredAtRequest }) }] });
const state = (...requests: InvoiceRequest[]): InvoiceRequestsState => ({ requests, updatedAt: 'antes' });
const order = (lines: Array<{ id: number; delivered?: number; invoiced?: number }>, over: Partial<OdooOrderSnapshot> = {}): OdooOrderSnapshot => ({
  id: 10, invoice_status: 'to invoice', state: 'sale',
  lines: lines.map(l => ({ id: l.id, delivered: l.delivered ?? 0, invoiced: l.invoiced ?? 0 })),
  ...over,
});

test('remisión completa en Odoo se marca hecha por Odoo (automático)', () => {
  const out = reconcileWithOdoo(state(remision('a', 4, 2)), [order([{ id: 1, delivered: 6 }])], NOW);
  const r = out.state.requests[0];
  assert.equal(r.status, 'hecha');
  assert.deepEqual(r.doneBy, ODOO_AUTO_ACTOR);
  assert.equal(r.doneAt, NOW);
  assert.equal(out.state.updatedAt, NOW);
  assert.deepEqual(out.progress, {});
});

test('remisión a medias sigue pendiente y reporta avance por partida', () => {
  const out = reconcileWithOdoo(state(remision('a', 10, 0)), [order([{ id: 1, delivered: 6 }])], NOW);
  assert.equal(out.state.requests[0].status, 'pendiente');
  assert.deepEqual(out.progress, { a: [{ lineId: 1, done: 6, qty: 10 }] });
});

test('sin cambios devuelve el mismo estado (no hay que escribir)', () => {
  const s = state(remision('a', 10, 0));
  assert.equal(reconcileWithOdoo(s, [order([{ id: 1, delivered: 6 }])], NOW).state, s);
});

test('dos remisiones de la misma partida: la entrega completa solo la más antigua', () => {
  // El estado guarda la más reciente primero.
  const out = reconcileWithOdoo(state(remision('nueva', 5, 0), remision('vieja', 5, 0)), [order([{ id: 1, delivered: 5 }])], NOW);
  const byId = Object.fromEntries(out.state.requests.map(r => [r.id, r.status]));
  assert.deepEqual(byId, { nueva: 'pendiente', vieja: 'hecha' });
  assert.deepEqual(out.progress, { nueva: [{ lineId: 1, done: 0, qty: 5 }] });
});

test('el reparto respeta lo entregado antes de pedir cada remisión', () => {
  // vieja: 5 desde 0; se entregaron 3; nueva: 2 desde 3. Odoo llega a 7 → ambas completas.
  const out = reconcileWithOdoo(state(remision('nueva', 2, 3), remision('vieja', 5, 0)), [order([{ id: 1, delivered: 7 }])], NOW);
  assert.deepEqual(out.state.requests.map(r => r.status), ['hecha', 'hecha']);
  // Con 4 entregadas, la cuarta pieza es de la vieja.
  const out4 = reconcileWithOdoo(state(remision('nueva', 2, 3), remision('vieja', 5, 0)), [order([{ id: 1, delivered: 4 }])], NOW);
  assert.deepEqual(out4.progress, { nueva: [{ lineId: 1, done: 0, qty: 2 }], vieja: [{ lineId: 1, done: 4, qty: 5 }] });
});

test('remisión con varias partidas: solo se marca cuando todas están completas', () => {
  const r = req({ id: 'a', lines: [
    { lineId: 1, name: 'A', qty: 2, unit: null, deliveredAtRequest: 0 },
    { lineId: 2, name: 'B', qty: 3, unit: null, deliveredAtRequest: 1 },
  ] });
  const out = reconcileWithOdoo(state(r), [order([{ id: 1, delivered: 2 }, { id: 2, delivered: 2 }])], NOW);
  assert.equal(out.state.requests[0].status, 'pendiente');
  assert.deepEqual(out.progress, { a: [{ lineId: 1, done: 2, qty: 2 }, { lineId: 2, done: 1, qty: 3 }] });
});

test('factura completa: hecha cuando Odoo marca la orden como facturada', () => {
  const f = req({ id: 'f', type: 'factura' });
  assert.equal(reconcileWithOdoo(state(f), [order([{ id: 1 }], { invoice_status: 'invoiced' })], NOW).state.requests[0].status, 'hecha');
  const pend = reconcileWithOdoo(state(f), [order([{ id: 1, invoiced: 3 }], { invoice_status: 'partially_invoiced' })], NOW);
  assert.equal(pend.state.requests[0].status, 'pendiente');
  assert.deepEqual(pend.progress, {});
});

test('factura parcial (Fisher): se compara contra lo facturado al pedirla', () => {
  const f = req({ id: 'f', type: 'factura', partnerName: 'Fisher', lines: [{ lineId: 1, name: 'A', qty: 3, unit: null, invoicedAtRequest: 2 }] });
  assert.equal(reconcileWithOdoo(state(f), [order([{ id: 1, invoiced: 5 }])], NOW).state.requests[0].status, 'hecha');
  const pend = reconcileWithOdoo(state(f), [order([{ id: 1, invoiced: 4 }])], NOW);
  assert.deepEqual(pend.progress, { f: [{ lineId: 1, done: 2, qty: 3 }] });
  // Una remisión de la misma partida no consume lo facturado.
  const both = reconcileWithOdoo(state(remision('r', 3, 0), f), [order([{ id: 1, delivered: 3, invoiced: 5 }])], NOW);
  assert.deepEqual(both.state.requests.map(r => r.status), ['hecha', 'hecha']);
});

test('no se marca sola: sin foto de cantidades, orden cancelada, orden o partida ausente', () => {
  const legacy = state(remision('a', 1, undefined));
  const out = reconcileWithOdoo(legacy, [order([{ id: 1, delivered: 9 }])], NOW);
  assert.equal(out.state, legacy);
  assert.deepEqual(out.progress, {});

  const s = state(remision('a', 1, 0));
  assert.equal(reconcileWithOdoo(s, [order([{ id: 1, delivered: 9 }], { state: 'cancel' })], NOW).state, s);
  assert.equal(reconcileWithOdoo(s, [], NOW).state, s);
  assert.equal(reconcileWithOdoo(s, [order([{ id: 2, delivered: 9 }])], NOW).state, s);
  const invoicedCancel = state(req({ id: 'f', type: 'factura' }));
  assert.equal(reconcileWithOdoo(invoicedCancel, [order([], { invoice_status: 'invoiced', state: 'cancel' })], NOW).state, invoicedCancel);
});

test('las hechas a mano no se tocan ni consumen entregas', () => {
  const manual = { ...remision('m', 5, 0), status: 'hecha' as const, doneBy: actor, doneAt: 'ayer' };
  const out = reconcileWithOdoo(state(remision('p', 5, 0), manual), [order([{ id: 1, delivered: 5 }])], NOW);
  assert.deepEqual(out.state.requests[1], manual);
  assert.equal(out.state.requests[0].status, 'hecha');
});

test('loadOrderSnapshots: sin pendientes no consulta Odoo', async () => {
  let calls = 0;
  const deps = { fetchCached: async () => { calls++; return { orders: [] }; }, fetchByIds: async () => { calls++; return []; } };
  assert.deepEqual(await loadOrderSnapshots(state(), deps), []);
  assert.equal(calls, 0);
});

test('loadOrderSnapshots: usa el catálogo y busca por id solo las órdenes que salieron de él', async () => {
  const asked: number[][] = [];
  const s = state(remision('a', 1, 0), req({ id: 'f', type: 'factura', orderId: 20 }), { ...remision('h', 1, 0), orderId: 30, status: 'hecha', doneBy: actor, doneAt: 'x' });
  const out = await loadOrderSnapshots(s, {
    fetchCached: async () => ({ orders: [order([{ id: 1 }]), order([], { id: 99 })] }),
    fetchByIds: async ids => { asked.push(ids); return [order([], { id: 20, invoice_status: 'invoiced' })]; },
  });
  assert.deepEqual(asked, [[20]]);
  assert.deepEqual(out.map(o => o.id).sort(), [10, 20]);
});
