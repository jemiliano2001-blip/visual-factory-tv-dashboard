import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDrafts, requestAvailability } from './invoiceDrafts';
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

const req = (type: 'factura' | 'remision', by: { uid: string; email: string | null; name: string | null }): InvoiceRequest => ({
  id: 'r', orderId: 1, orderName: 'S00001', partnerName: 'X', customerReference: null,
  type, status: 'pendiente', requestedBy: by, requestedAt: '2026-01-01T00:00:00Z',
});
const ana = { uid: 'u1', email: 'ana@x.com', name: 'Ana' };
const order = { lines: [{ id: 1, qty: 5, delivered: 2 }] };

test('requestAvailability: ambos tipos disponibles', () => {
  assert.deepEqual(requestAvailability(order, []), { factura: null, remision: null });
});

test('requestAvailability: cada tipo pendiente es independiente', () => {
  assert.deepEqual(requestAvailability(order, [req('factura', ana)]), { factura: 'Ya la pidió Ana', remision: null });
  assert.deepEqual(requestAvailability(order, [req('remision', ana)]), { factura: null, remision: 'Ya la pidió Ana' });
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
