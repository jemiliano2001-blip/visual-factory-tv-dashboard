import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDrafts, missingSatCount, requestAvailability, suggestedSat } from './invoiceDrafts';
import type { InvoiceRequest } from '../../shared/invoiceRequests';

test('factura no lleva la clave lines', () => {
  const [draft] = buildDrafts([{ orderId: 1, type: 'factura', lineQty: { 5: 2 } }]);
  assert.deepEqual(draft, { orderId: 1, type: 'factura' });
  assert.equal('lines' in draft, false);
});

test('remisión omite cantidades 0 y negativas y convierte las claves a número', () => {
  const [draft] = buildDrafts([{ orderId: 2, type: 'remision', lineQty: { 10: 3, 11: 0, 12: -1, 13: 1.5 } }]);
  assert.deepEqual(draft, { orderId: 2, type: 'remision', lines: [{ lineId: 10, qty: 3 }, { lineId: 13, qty: 1.5 }] });
});

test('remisión sin piezas se omite', () => {
  assert.deepEqual(buildDrafts([{ orderId: 3, type: 'remision', lineQty: { 1: 0 } }]), []);
  assert.deepEqual(buildDrafts([{ orderId: 3, type: 'remision', lineQty: {} }]), []);
});

test('type null se omite', () => {
  assert.deepEqual(buildDrafts([{ orderId: 4, type: null, lineQty: { 1: 2 } }]), []);
});

test('conserva el orden de entrada', () => {
  const out = buildDrafts([
    { orderId: 9, type: 'factura', lineQty: {} },
    { orderId: 4, type: null, lineQty: {} },
    { orderId: 7, type: 'remision', lineQty: { 1: 1 } },
    { orderId: 2, type: 'factura', lineQty: {} },
  ]);
  assert.deepEqual(out.map(d => d.orderId), [9, 7, 2]);
});

const req = (type: 'factura' | 'remision', by: { uid: string; email: string | null; name: string | null }, qty = 0): InvoiceRequest => ({
  id: 'r', orderId: 1, orderName: 'S00001', partnerName: 'X', customerReference: null,
  type, status: 'pendiente', requestedBy: by, requestedAt: '2026-01-01T00:00:00Z',
  ...(type === 'remision' ? { lines: [{ lineId: 1, name: 'P', qty, unit: null }] } : {}),
});
const ana = { uid: 'u1', email: 'ana@x.com', name: 'Ana' };
const order = { lines: [{ id: 1, qty: 5, delivered: 2 }] };

test('requestAvailability: ambos tipos disponibles', () => {
  assert.deepEqual(requestAvailability(order, []), { factura: null, remision: null });
});

test('requestAvailability: factura pendiente la bloquea, remisión parcial no bloquea otra remisión', () => {
  assert.deepEqual(requestAvailability(order, [req('factura', ana)]), { factura: 'Ya la pidió Ana', remision: null });
  assert.deepEqual(requestAvailability(order, [req('remision', ana, 2)]), { factura: null, remision: null });
});

test('requestAvailability: remisión bloqueada cuando ya pidieron todo lo que falta', () => {
  assert.deepEqual(requestAvailability(order, [req('remision', ana, 3)]), { factura: null, remision: 'Ya pidieron todas las piezas que faltan' });
  assert.deepEqual(requestAvailability(order, [req('remision', ana, 2), req('remision', ana, 1)]).remision, 'Ya pidieron todas las piezas que faltan');
});

test('requestAvailability: remisión sin piezas pendientes', () => {
  const done = { lines: [{ id: 1, qty: 5, delivered: 5 }] };
  assert.deepEqual(requestAvailability(done, []), { factura: null, remision: 'No hay piezas pendientes de entregar' });
});

test('requestAvailability: remisión con pendientes pero sin id', () => {
  const noId = { lines: [{ qty: 5, delivered: 0 }] };
  assert.equal(requestAvailability(noId, []).remision, 'No hay piezas pendientes de entregar');
});

test('requestAvailability: solicitante por nombre, email y uid', () => {
  assert.equal(requestAvailability(order, [req('factura', { uid: 'u2', email: 'b@x.com', name: null })]).factura, 'Ya la pidió b@x.com');
  assert.equal(requestAvailability(order, [req('factura', { uid: 'u3', email: null, name: null })]).factura, 'Ya la pidió u3');
});

const ohdOrder = {
  partner_name: 'OHD OPERATORS DE MEXICO',
  lines: [
    { id: 1, name: 'Fixture estación 2', qty: 2 },
    { id: 2, name: 'Buje bronce', qty: 1 },
    { id: 3, name: 'Nota', qty: 0 },
  ],
};

test('OHD: sugiere clave por descripción y deja vacía la que no reconoce', () => {
  assert.deepEqual(suggestedSat(ohdOrder), { 1: '23153000', 2: '' });
  assert.equal(suggestedSat({ ...ohdOrder, partner_name: 'Bosch' }), undefined);
});

test('OHD: cuenta las partidas sin clave según lo que se pide', () => {
  const sat = { 1: '23153000', 2: '' };
  assert.equal(missingSatCount(ohdOrder, { type: 'factura', lineQty: {}, sat }), 1);
  assert.equal(missingSatCount(ohdOrder, { type: 'remision', lineQty: { 1: 1, 2: 0 }, sat }), 0);
  assert.equal(missingSatCount(ohdOrder, { type: null, lineQty: {}, sat }), 0);
  assert.equal(missingSatCount({ ...ohdOrder, partner_name: 'Bosch' }, { type: 'factura', lineQty: {} }), 0);
});

test('OHD: los borradores llevan las claves escogidas', () => {
  const sat = { 1: '23153000', 2: '31391500' };
  assert.deepEqual(buildDrafts([{ orderId: 5, type: 'factura', lineQty: {}, sat }]),
    [{ orderId: 5, type: 'factura', satKeys: [{ lineId: 1, code: '23153000' }, { lineId: 2, code: '31391500' }] }]);
  assert.deepEqual(buildDrafts([{ orderId: 5, type: 'remision', lineQty: { 1: 2, 2: 0 }, sat }]),
    [{ orderId: 5, type: 'remision', lines: [{ lineId: 1, qty: 2 }], satKeys: [{ lineId: 1, code: '23153000' }] }]);
});

test('Fisher: la factura se pide por partida y cantidad', () => {
  assert.deepEqual(buildDrafts([{ orderId: 1, type: 'factura', partial: true, lineQty: { 5: 2, 6: 0 } }]),
    [{ orderId: 1, type: 'factura', lines: [{ lineId: 5, qty: 2 }] }]);
  assert.deepEqual(buildDrafts([{ orderId: 1, type: 'factura', partial: true, lineQty: { 5: 0 } }]), []);
  assert.deepEqual(buildDrafts([{ orderId: 1, type: 'factura', lineQty: {} }]), [{ orderId: 1, type: 'factura' }]);
});

test('Fisher: disponibilidad de factura según lo que queda por facturar', () => {
  const lines = (invoiced: number) => [{ id: 5, qty: 4, delivered: 4, invoiced }];
  assert.equal(requestAvailability({ partner_name: 'Fisher Controls', lines: lines(1) }, []).factura, null);
  assert.equal(requestAvailability({ partner_name: 'Fisher Controls', lines: lines(4) }, []).factura, 'Ya está todo facturado o pedido');
  const pend = { id: 'p', orderId: 1, orderName: 'S', partnerName: 'Fisher', customerReference: null, type: 'factura' as const, status: 'pendiente' as const,
    requestedBy: { uid: 'u', email: null, name: 'Ana' }, requestedAt: '', lines: [{ lineId: 5, name: 'V', qty: 4, unit: null, invoicedAtRequest: 0 }] };
  assert.equal(requestAvailability({ partner_name: 'Kohler', lines: lines(0) }, [pend]).factura, 'Ya está todo facturado o pedido');
  // otros clientes: una factura pendiente sigue bloqueando
  assert.match(requestAvailability({ partner_name: 'Bosch', lines: lines(0) }, [pend]).factura ?? '', /Ya la pidió Ana/);
});
