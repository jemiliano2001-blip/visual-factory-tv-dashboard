import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DONE_KEPT,
  MAX_DRAFTS,
  actorLabel,
  clampQty,
  createInvoiceRequests,
  linePendingQty,
  markInvoiceRequestDone,
  normalizeInvoiceRequests,
  parseCreateRequestsBody,
  pendingRequestsByOrder,
  type InvoiceRequest,
  type InvoiceRequestsState,
  type RequestActor,
  type RequestableOrder,
} from './invoiceRequests.ts';

const actor: RequestActor = { uid: 'u1', email: 'a@smv.mx', name: 'Ana' };
const other: RequestActor = { uid: 'u2', email: null, name: null };

const order: RequestableOrder = {
  id: 10,
  name: 'S00010',
  partner_name: 'Cliente SA',
  customer_reference: 'PO-1',
  lines: [
    { id: 1, name: 'Placa', qty: 5, delivered: 2, unit: 'pza' },
    { id: 2, name: 'Tornillo', qty: 3, delivered: 3 },
    { name: 'Sin id', qty: 1, delivered: 0 },
  ],
};
const order2: RequestableOrder = { id: 11, name: 'S00011', partner_name: 'Otro', lines: [{ id: 7, name: 'X', qty: 1, delivered: 0 }] };
const empty: InvoiceRequestsState = { requests: [], updatedAt: '' };

let n = 0;
const ctx = () => ({ actor, now: '2026-01-01T00:00:00.000Z', newId: () => `id${++n}` });

function req(over: Partial<InvoiceRequest> & { id: string }): InvoiceRequest {
  return {
    orderId: 1, orderName: 'S1', partnerName: 'P', customerReference: null,
    type: 'factura', status: 'pendiente', requestedBy: actor, requestedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}
const done = (id: string, doneAt: string) => req({ id, status: 'hecha', doneBy: actor, doneAt });

test('normalize: vacío y basura', () => {
  assert.deepEqual(normalizeInvoiceRequests(null), { requests: [], updatedAt: '' });
  const out = normalizeInvoiceRequests({
    updatedAt: 'x',
    requests: [
      req({ id: 'ok' }), 5, null, { id: 'a' },
      { ...req({ id: 'badtype' }), type: 'otro' },
      { ...req({ id: 'badstatus' }), status: 'x' },
      { ...req({ id: 'badorder' }), orderId: '3' },
      { ...req({ id: 'sinhecha' }), status: 'hecha' },
      { ...req({ id: 'badactor' }), requestedBy: { uid: 1 } },
      { ...req({ id: 'remsinlines' }), type: 'remision' },
    ],
  });
  assert.equal(out.updatedAt, 'x');
  assert.deepEqual(out.requests.map(r => r.id), ['ok']);
});

test('normalize: recorta a 200 hechas y conserva pendientes', () => {
  const requests: InvoiceRequest[] = [req({ id: 'p1' })];
  for (let i = 0; i < 250; i++) requests.push(done(`d${i}`, `2026-01-01T00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z`));
  requests.push(req({ id: 'p2' }));
  const out = normalizeInvoiceRequests({ requests, updatedAt: 't' });
  const hechas = out.requests.filter(r => r.status === 'hecha');
  assert.equal(hechas.length, MAX_DONE_KEPT);
  assert.equal(out.requests.filter(r => r.status === 'pendiente').length, 2);
  assert.ok(hechas.some(r => r.id === 'd249'));
  assert.ok(!hechas.some(r => r.id === 'd0'));
  assert.equal(out.requests[0].id, 'p1');
});

test('recorte por tamaño: descarta hechas viejas, nunca pendientes', () => {
  const big = 'x'.repeat(20_000);
  const requests: InvoiceRequest[] = [req({ id: 'p', partnerName: big })];
  for (let i = 0; i < 100; i++) requests.push({ ...done(`d${i}`, `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z`), partnerName: big, doneAt: `2026-02-${String((i % 28) + 1).padStart(2, '0')}T00:00:${String(Math.floor(i / 28)).padStart(2, '0')}Z` });
  const out = normalizeInvoiceRequests({ requests, updatedAt: '' });
  assert.ok(JSON.stringify(out).length <= 800_000);
  assert.ok(out.requests.some(r => r.id === 'p'));
  assert.ok(out.requests.length < 101);
});

test('crear factura: sin clave lines y datos copiados de orders', () => {
  const r = createInvoiceRequests(empty, [{ orderId: 10, type: 'factura', lines: [{ lineId: 1, qty: 1 }] }], [order], ctx());
  assert.equal(r.created.length, 1);
  const c = r.created[0];
  assert.ok(!('lines' in c));
  assert.ok(!Object.hasOwn(c, 'doneBy') && !Object.hasOwn(c, 'doneAt'));
  assert.equal(c.orderName, 'S00010');
  assert.equal(c.partnerName, 'Cliente SA');
  assert.equal(c.customerReference, 'PO-1');
  assert.equal(c.status, 'pendiente');
  assert.deepEqual(c.requestedBy, actor);
  assert.equal(r.state.updatedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(r.state.requests[0], c);
});

test('crear remisión: copia nombre y unidad, unit null si falta', () => {
  const r = createInvoiceRequests(empty, [{ orderId: 10, type: 'remision', lines: [{ lineId: 1, qty: 3 }] }], [order], ctx());
  assert.deepEqual(r.created[0].lines, [{ lineId: 1, name: 'Placa', qty: 3, unit: 'pza' }]);
  const r2 = createInvoiceRequests(empty, [{ orderId: 11, type: 'remision', lines: [{ lineId: 7, qty: 1 }] }], [order2], ctx());
  assert.deepEqual(r2.created[0].lines, [{ lineId: 7, name: 'X', qty: 1, unit: null }]);
  assert.equal(r2.created[0].customerReference, null);
});

test('remisión: rechazos', () => {
  const bad = (lines: Array<{ lineId: number; qty: number }>, o = order) =>
    createInvoiceRequests(empty, [{ orderId: o.id, type: 'remision', lines }], [o], ctx());
  for (const lines of [
    [{ lineId: 1, qty: 0 }], [{ lineId: 1, qty: -1 }], [{ lineId: 1, qty: 3.5 }],
    [{ lineId: 99, qty: 1 }], [{ lineId: 1, qty: 1 }, { lineId: 1, qty: 1 }], [],
    [{ lineId: 2, qty: 1 }],
  ]) {
    const r = bad(lines);
    assert.equal(r.created.length, 0, JSON.stringify(lines));
    assert.equal(r.skipped.length, 1);
    assert.equal(r.skipped[0].orderName, 'S00010');
    assert.equal(r.state, empty);
  }
  const allDone: RequestableOrder = { id: 12, name: 'S12', partner_name: 'P', lines: [{ id: 1, name: 'A', qty: 1, delivered: 1 }] };
  assert.match(bad([{ lineId: 1, qty: 1 }], allDone).skipped[0].reason, /pendiente/);
  // tolerancia
  const tolerated = bad([{ lineId: 1, qty: 3 + 1e-7 }]);
  assert.equal(tolerated.created.length, 1);
  assert.equal(tolerated.created[0].lines?.[0].qty, 3); // nunca se guarda más de lo pendiente
  assert.equal(bad([{ lineId: 1, qty: 1e-9 }]).created.length, 0); // cantidad que redondea a 0
});

test('orden inexistente y duplicados; éxito parcial', () => {
  const pend = createInvoiceRequests(empty, [{ orderId: 10, type: 'factura' }], [order], ctx()).state;
  const r = createInvoiceRequests(
    pend,
    [
      { orderId: 99, type: 'factura' },
      { orderId: 10, type: 'factura' }, // duplicado en estado
      { orderId: 11, type: 'factura' },
      { orderId: 11, type: 'factura' }, // duplicado en lote
      { orderId: 10, type: 'remision', lines: [{ lineId: 1, qty: 1 }] }, // otro tipo: ok
    ],
    [order, order2],
    ctx(),
  );
  assert.equal(r.created.length, 3 - 1);
  assert.equal(r.skipped.length, 3);
  assert.equal(r.skipped[0].orderName, null);
  assert.match(r.skipped[0].reason, /ya no está disponible/);
  assert.match(r.skipped[1].reason, /Ya hay una solicitud pendiente de/);
  assert.match(r.skipped[2].reason, /Ya hay una solicitud pendiente de/);
  assert.equal(r.state.requests.length, 3);
  assert.deepEqual(r.state.requests.map(x => x.orderId), [10, 11, 10]);
});

test('hecha permite nueva pendiente; markDone idempotente y errores', () => {
  const s1 = createInvoiceRequests(empty, [{ orderId: 10, type: 'factura' }], [order], ctx());
  const id = s1.created[0].id;
  const d = markInvoiceRequestDone(s1.state, id, { actor: other, now: 'T1' });
  const dr = d.requests[0];
  assert.equal(dr.status, 'hecha');
  assert.deepEqual(dr.doneBy, other);
  assert.equal(dr.doneAt, 'T1');
  assert.equal(d.updatedAt, 'T1');
  const again = markInvoiceRequestDone(d, id, { actor, now: 'T2' });
  assert.equal(again, d);
  assert.equal(again.requests[0].doneAt, 'T1');
  assert.throws(() => markInvoiceRequestDone(d, 'nope', { actor, now: 'T' }), /No se encontró la solicitud\./);
  const s2 = createInvoiceRequests(d, [{ orderId: 10, type: 'factura' }], [order], ctx());
  assert.equal(s2.created.length, 1);
});

test('no muta el estado de entrada', () => {
  const s = createInvoiceRequests(empty, [{ orderId: 10, type: 'factura' }], [order], ctx()).state;
  const snap = JSON.stringify(s);
  createInvoiceRequests(s, [{ orderId: 11, type: 'factura' }], [order2], ctx());
  markInvoiceRequestDone(s, s.requests[0].id, { actor, now: 'T' });
  assert.equal(JSON.stringify(s), snap);
  assert.equal(JSON.stringify(empty), JSON.stringify({ requests: [], updatedAt: '' }));
});

test('createInvoiceRequests sin nada creado devuelve el mismo estado', () => {
  const r = createInvoiceRequests(empty, [{ orderId: 99, type: 'factura' }], [order], ctx());
  assert.equal(r.state, empty);
});

test('clampQty y linePendingQty', () => {
  assert.equal(clampQty(2.5 - 1, 2.5), 1.5);
  assert.equal(clampQty(1.5 - 1, 1.5), 0.5);
  assert.equal(clampQty(0.5 - 1, 0.5), 0);
  assert.equal(clampQty(NaN, 5), 0);
  assert.equal(clampQty(-2, 5), 0);
  assert.equal(clampQty(9, 5), 5);
  assert.equal(clampQty(0.1 + 0.2, 5), 0.3);
  assert.equal(linePendingQty({ qty: 2.5, delivered: 1 }), 1.5);
  assert.equal(linePendingQty({ qty: 1, delivered: 3 }), 0);
  assert.equal(linePendingQty({ qty: 0.3, delivered: 0.1 }), 0.2);
});

test('parseCreateRequestsBody', () => {
  const ok = parseCreateRequestsBody([
    { orderId: 1, type: 'factura', lines: 'basura' },
    { orderId: 2, type: 'remision', lines: [{ lineId: 3, qty: 1.5 }] },
  ]);
  assert.deepEqual(ok, [{ orderId: 1, type: 'factura' }, { orderId: 2, type: 'remision', lines: [{ lineId: 3, qty: 1.5 }] }]);
  assert.ok(!('lines' in ok[0]));
  assert.deepEqual(parseCreateRequestsBody({ requests: [{ orderId: 1, type: 'factura' }] }), [{ orderId: 1, type: 'factura' }]);
  const bads: unknown[] = [
    null, 'x', [], {}, { requests: [] },
    Array.from({ length: MAX_DRAFTS + 1 }, () => ({ orderId: 1, type: 'factura' })),
    [{ orderId: 0, type: 'factura' }], [{ orderId: 1.5, type: 'factura' }], [{ orderId: '1', type: 'factura' }],
    [{ orderId: 1, type: 'otro' }], [null],
    [{ orderId: 1, type: 'remision' }], [{ orderId: 1, type: 'remision', lines: [] }],
    [{ orderId: 1, type: 'remision', lines: [{ lineId: 0, qty: 1 }] }],
    [{ orderId: 1, type: 'remision', lines: [{ lineId: 1, qty: 0 }] }],
    [{ orderId: 1, type: 'remision', lines: [{ lineId: 1, qty: Infinity }] }],
    [{ orderId: 1, type: 'remision', lines: [{ lineId: 1.2, qty: 1 }] }],
    [{ orderId: 1, type: 'remision', lines: [null] }],
  ];
  for (const b of bads) assert.throws(() => parseCreateRequestsBody(b), Error, JSON.stringify(b)?.slice(0, 60));
  assert.equal(parseCreateRequestsBody(Array.from({ length: MAX_DRAFTS }, () => ({ orderId: 1, type: 'factura' }))).length, MAX_DRAFTS);
});

test('pendingRequestsByOrder y actorLabel', () => {
  const state: InvoiceRequestsState = {
    updatedAt: '',
    requests: [req({ id: 'a', orderId: 1 }), req({ id: 'b', orderId: 1, type: 'remision', lines: [{ lineId: 1, name: 'n', qty: 1, unit: null }] }), done('c', 'T'), req({ id: 'd', orderId: 2 })],
  };
  const m = pendingRequestsByOrder(state);
  assert.deepEqual(m.get(1)?.map(r => r.id), ['a', 'b']);
  assert.deepEqual(m.get(2)?.map(r => r.id), ['d']);
  assert.equal(m.size, 2);
  assert.equal(actorLabel(actor), 'Ana');
  assert.equal(actorLabel({ uid: 'u', email: 'e@x', name: null }), 'e@x');
  assert.equal(actorLabel({ uid: 'u', email: null, name: null }), 'u');
});
