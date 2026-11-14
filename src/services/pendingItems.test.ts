import assert from 'node:assert/strict';
import test from 'node:test';
import type { OdooSaleOrder } from './odoo';
import {
  collectPendingLines,
  compareByUrgency,
  getOrderMissingQty,
  getPendingLines,
} from './pendingItems';

const DAY_MS = 86_400_000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

function order(overrides: Partial<OdooSaleOrder> = {}): OdooSaleOrder {
  const lines = overrides.lines ?? [{ name: 'Navajas', qty: 5, delivered: 2 }];
  return {
    id: 1,
    name: '2026/S01992',
    customer_reference: null,
    partner_name: 'Cliente',
    main_product: 'Navajas',
    date_order: daysFromNow(-10),
    commitment_date: daysFromNow(5),
    invoice_status: 'to invoice',
    currency: 'MXN',
    qty_total: lines.reduce((sum, l) => sum + l.qty, 0),
    qty_delivered: lines.reduce((sum, l) => sum + l.delivered, 0),
    state: 'sale',
    salesperson: null,
    lines_count: lines.length,
    lines,
    deliveries: [],
    note: null,
    ...overrides,
  };
}

test('getPendingLines filtra completas y nunca produce cantidad negativa con delivered > qty', () => {
  const o = order({
    lines: [
      { name: 'Completa', qty: 5, delivered: 5 },
      { name: 'Exceso', qty: 3, delivered: 7 },
      { name: 'Pendiente', qty: 6, delivered: 2 },
    ],
  });

  const pending = getPendingLines(o);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].line.name, 'Pendiente');
  assert.equal(pending[0].missing, 4);
  assert.equal(getOrderMissingQty(o), 4);
});

test('getPendingLines cae a línea sintética cuando lines está vacío o no existe', () => {
  const emptyLines = order({
    main_product: 'Placa base',
    qty_total: 10,
    qty_delivered: 4,
    lines: [],
  });
  const missingLines = order({
    main_product: 'Soporte',
    qty_total: 8,
    qty_delivered: 3,
    lines: undefined as unknown as OdooSaleOrder['lines'],
  });

  const fromEmpty = getPendingLines(emptyLines);
  assert.equal(fromEmpty.length, 1);
  assert.deepEqual(fromEmpty[0].line, { name: 'Placa base', qty: 10, delivered: 4 });
  assert.equal(fromEmpty[0].missing, 6);

  const fromMissing = getPendingLines(missingLines);
  assert.equal(fromMissing.length, 1);
  assert.deepEqual(fromMissing[0].line, { name: 'Soporte', qty: 8, delivered: 3 });
  assert.equal(fromMissing[0].missing, 5);
});

test('getOrderMissingQty suma el pendiente de todas las líneas', () => {
  const o = order({
    lines: [
      { name: 'A', qty: 10, delivered: 4 },
      { name: 'B', qty: 5, delivered: 1 },
      { name: 'C', qty: 2, delivered: 5 },
    ],
  });

  assert.equal(getOrderMissingQty(o), 10);
});

test('compareByUrgency ordena overdue < warning < on-time < none, desempata por commitment_date y deja nulos al final', () => {
  const overdue = order({ id: 1, commitment_date: daysFromNow(-2) });
  const warning = order({ id: 2, commitment_date: daysFromNow(1) });
  const onTimeEarly = order({ id: 3, commitment_date: daysFromNow(4) });
  const onTimeLate = order({ id: 4, commitment_date: daysFromNow(10) });
  const onTimeNoDate = order({
    id: 5,
    date_order: daysFromNow(0),
    commitment_date: null,
    note: 'Tiempo de entrega: 10 días hábiles',
  });
  const none = order({ id: 6, commitment_date: null, note: null });

  const sorted = [none, onTimeNoDate, onTimeLate, warning, onTimeEarly, overdue].sort(compareByUrgency);
  assert.deepEqual(
    sorted.map(o => o.id),
    [1, 2, 3, 4, 5, 6],
  );
  assert.ok(compareByUrgency(onTimeEarly, onTimeNoDate) < 0);
  assert.ok(compareByUrgency(onTimeNoDate, onTimeEarly) > 0);
});

test('collectPendingLines aplana y ordena las líneas pendientes por urgencia de su orden', () => {
  const noneOrder = order({
    id: 10,
    commitment_date: null,
    lines: [{ name: 'Sin fecha 1', qty: 3, delivered: 0 }],
  });
  const overdueOrder = order({
    id: 11,
    commitment_date: daysFromNow(-3),
    lines: [
      { name: 'Vencida A', qty: 5, delivered: 1 },
      { name: 'Vencida completa', qty: 2, delivered: 2 },
      { name: 'Vencida B', qty: 4, delivered: 2 },
    ],
  });
  const warningOrder = order({
    id: 12,
    commitment_date: daysFromNow(1),
    lines: [{ name: 'Por vencer 1', qty: 7, delivered: 2 }],
  });

  const result = collectPendingLines([noneOrder, overdueOrder, warningOrder]);
  assert.deepEqual(
    result.map(pl => ({ orderId: pl.order.id, name: pl.line.name, missing: pl.missing })),
    [
      { orderId: 11, name: 'Vencida A', missing: 4 },
      { orderId: 11, name: 'Vencida B', missing: 2 },
      { orderId: 12, name: 'Por vencer 1', missing: 5 },
      { orderId: 10, name: 'Sin fecha 1', missing: 3 },
    ],
  );
});
