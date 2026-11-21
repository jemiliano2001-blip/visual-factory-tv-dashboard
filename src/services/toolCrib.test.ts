import assert from 'node:assert/strict';
import test from 'node:test';
import type { InvoiceRequest } from '../../shared/invoiceRequests';
import type { OdooSaleOrder } from './odoo';
import { collectToolCribLines, extractPartNumber, isToolCribOrder, toolCribCustomerKey } from './toolCrib';

const DAY_MS = 86_400_000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

function order(overrides: Partial<OdooSaleOrder> = {}): OdooSaleOrder {
  const lines = overrides.lines ?? [{ name: '[ABC-1] Buje', qty: 5, delivered: 2 }];
  return {
    id: 1,
    name: '2026/S01992',
    customer_reference: null,
    partner_name: 'SUPRAJIT MEXICO',
    main_product: '[ABC-1] Buje',
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

test('isToolCribOrder reconoce Suprajit sin importar mayúsculas ni espacios', () => {
  assert.equal(isToolCribOrder(order({ partner_name: 'SUPRAJIT MEXICO' })), true);
  assert.equal(isToolCribOrder(order({ partner_name: 'Suprajit Mexico' })), true);
  assert.equal(isToolCribOrder(order({ partner_name: '  suprajit ' })), true);
  assert.equal(isToolCribOrder(order({ partner_name: 'BOSCH' })), false);
  assert.equal(isToolCribOrder(order({ partner_name: '' })), false);
});

test('extractPartNumber saca el número de parte de los corchetes', () => {
  assert.equal(extractPartNumber('[ABC-123] Buje de bronce'), 'ABC-123');
  assert.equal(extractPartNumber('[ ABC-123 ] x'), 'ABC-123');
  assert.equal(extractPartNumber('Buje sin corchetes'), null);
  assert.equal(extractPartNumber('[] vacío'), null);
});

test('collectToolCribLines: pendiente y entregada con faltan correcto', () => {
  const o = order({
    lines: [
      { name: '[A-1] Pendiente', qty: 10, delivered: 4 },
      { name: '[A-2] Completa', qty: 5, delivered: 5 },
    ],
  });
  const out = collectToolCribLines([o]);
  assert.equal(out.length, 2);
  assert.deepEqual([out[0].missing, out[0].status, out[0].partNumber], [6, 'pendiente', 'A-1']);
  assert.deepEqual([out[1].missing, out[1].status, out[1].partNumber], [0, 'entregada', 'A-2']);
});

test('collectToolCribLines: solicitud pendiente marca todas las partidas como solicitada', () => {
  const o = order({
    lines: [
      { name: '[A-1] Pendiente', qty: 10, delivered: 4 },
      { name: '[A-2] Completa', qty: 5, delivered: 5 },
    ],
  });
  const req = { id: 'r1', orderId: o.id, status: 'pendiente' } as InvoiceRequest;
  const out = collectToolCribLines([o], new Map([[o.id, [req]]]));
  assert.deepEqual(out.map(l => l.status), ['solicitada', 'solicitada']);
});

test('collectToolCribLines: entregado de más no da faltan negativo', () => {
  const out = collectToolCribLines([order({ lines: [{ name: '[A-1] x', qty: 5, delivered: 7 }] })]);
  assert.equal(out[0].missing, 0);
  assert.equal(out[0].status, 'entregada');
});

test('collectToolCribLines: orden sin líneas usa una partida sintética', () => {
  const o = order({ lines: [], main_product: '[Z-9] Eje', qty_total: 8, qty_delivered: 3 });
  const out = collectToolCribLines([o]);
  assert.equal(out.length, 1);
  assert.equal(out[0].line.name, '[Z-9] Eje');
  assert.equal(out[0].line.qty, 8);
  assert.equal(out[0].line.delivered, 3);
  assert.equal(out[0].missing, 5);
});

test('collectToolCribLines: partida sin corchetes se conserva con partNumber null', () => {
  const out = collectToolCribLines([order({ lines: [{ name: 'Buje sin corchetes', qty: 2, delivered: 0 }] })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].partNumber, null);
});

test('collectToolCribLines: conserva partidas con "servicio" en el texto y omite clientes que no son Tool Crib', () => {
  const suprajit = order({
    lines: [
      { name: 'Servicio de maquinado', qty: 1, delivered: 0 },
      { name: '[A-1] Buje para servicio pesado', qty: 1, delivered: 0 },
    ],
  });
  const bosch = order({ id: 2, partner_name: 'BOSCH' });
  const out = collectToolCribLines([suprajit, bosch]);
  assert.deepEqual(out.map(l => l.line.name), ['Servicio de maquinado', '[A-1] Buje para servicio pesado']);
});

test('collectToolCribLines: la orden más urgente va primero y se respeta el orden de Odoo dentro de la orden', () => {
  const aTiempo = order({ id: 1, commitment_date: daysFromNow(10), lines: [{ name: '[T-1] a', qty: 2, delivered: 0 }] });
  const vencida = order({
    id: 2,
    commitment_date: daysFromNow(-5),
    lines: [
      { name: '[V-1] a', qty: 2, delivered: 0 },
      { name: '[V-2] b', qty: 2, delivered: 0 },
    ],
  });
  const out = collectToolCribLines([aTiempo, vencida]);
  assert.deepEqual(out.map(l => l.line.name), ['[V-1] a', '[V-2] b', '[T-1] a']);
});

test('toolCribCustomerKey reconoce Suprajit, Kohler y Fisher y descarta lo demás', () => {
  assert.equal(toolCribCustomerKey('SUPRAJIT MEXICO'), 'SUPRAJIT');
  assert.equal(toolCribCustomerKey('Kohler México S.A.'), 'KOHLER');
  assert.equal(toolCribCustomerKey('  fisher controls '), 'FISHER');
  assert.equal(toolCribCustomerKey('BOSCH'), null);
  assert.equal(isToolCribOrder(order({ partner_name: 'KOHLER MEXICO' })), true);
  assert.equal(isToolCribOrder(order({ partner_name: 'FISHER CONTROLS' })), true);
});
