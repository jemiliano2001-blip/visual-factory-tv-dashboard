import assert from 'node:assert/strict';
import test from 'node:test';
import type { OdooSaleOrder } from './odoo';
import { getOrderSignalProgress, isOrderSignalFullyDelivered, isOrderSignalOverdue, matchesTVStatus } from './orderSignals';

function order(lines: OdooSaleOrder['lines']): OdooSaleOrder {
  return {
    id: 1, name: '2026/S01992', customer_reference: null, partner_name: 'Cliente', main_product: 'Navajas',
    date_order: '2026-09-28', commitment_date: new Date(Date.now() - 8 * 86_400_000).toISOString(), invoice_status: 'partially_invoiced',
    currency: 'MXN', qty_total: lines.reduce((sum, line) => sum + line.qty, 0),
    qty_delivered: lines.reduce((sum, line) => sum + line.delivered, 0), state: 'sale', salesperson: null, note: null,
    lines_count: lines.length, lines, deliveries: [{ name: 'Remisión', state: 'done', date_done: '2026-10-12' }],
  };
}

test('promedia avance por partida sin sumar piezas con sets', () => {
  const partial = order([{ name: 'Navajas', qty: 5, delivered: 3 }, { name: 'Sets', qty: 100, delivered: 100 }]);
  assert.equal(getOrderSignalProgress(partial), 80);
  assert.equal(isOrderSignalFullyDelivered(partial), false);
});

test('100% exige completar cada partida y no depende del número de remisiones', () => {
  const complete = order([{ name: 'Navajas', qty: 5, delivered: 5 }, { name: 'Sets', qty: 5, delivered: 5 }]);
  complete.deliveries.push({ name: 'Remisión sobrante', state: 'assigned', date_done: null });
  assert.equal(isOrderSignalFullyDelivered(complete), true);
  assert.equal(isOrderSignalOverdue(complete), false);
});

test('redondear no convierte una entrega incompleta en 100%', () => {
  const almost = order([{ name: 'Piezas', qty: 1000, delivered: 999 }]);
  assert.equal(getOrderSignalProgress(almost), 99);
  assert.equal(isOrderSignalFullyDelivered(almost), false);
});

test('la TV conserva entregadas por facturar y separa los filtros de entrega y atraso', () => {
  const complete = order([{ name: 'Piezas', qty: 5, delivered: 5 }]);
  const partial = order([{ name: 'Piezas', qty: 5, delivered: 3 }]);
  for (const invoiceStatus of ['to invoice', 'partially_invoiced']) {
    complete.invoice_status = invoiceStatus;
    assert.equal(matchesTVStatus(complete, 'all'), true);
    assert.equal(matchesTVStatus(complete, 'delivered'), true);
    assert.equal(matchesTVStatus(complete, 'overdue'), false);
    assert.equal(matchesTVStatus(complete, 'critical'), false);
    assert.equal(matchesTVStatus(complete, 'pending'), false);
  }
  assert.equal(matchesTVStatus(partial, 'all'), true);
  assert.equal(matchesTVStatus(partial, 'delivered'), false);
  assert.equal(matchesTVStatus(partial, 'overdue'), true);
});
