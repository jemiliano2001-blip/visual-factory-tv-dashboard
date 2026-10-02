import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAgenda } from './agenda';
import type { OdooSaleOrder } from './odoo';

// Viernes 2 de octubre de 2026, 10:00 hora local.
const NOW = new Date(2026, 9, 2, 10, 0);

// 15:00 UTC cae el mismo día calendario en cualquier zona razonable.
function order(id: number, commitment: string | null, over: Partial<OdooSaleOrder> = {}): OdooSaleOrder {
  return {
    id, name: `2026/S0${id}`, partner_name: 'Cliente', qty_total: 10, qty_delivered: 0,
    commitment_date: commitment ? `${commitment} 15:00:00` : null,
    lines: [], deliveries: [], note: null,
    ...over,
  } as unknown as OdooSaleOrder;
}

const keys = (orders: OdooSaleOrder[]) => buildAgenda(orders, NOW).map(g => g.key);

test('separa atrasadas, hoy, mañana, días futuros, más adelante y sin fecha en ese orden', () => {
  const groups = buildAgenda([
    order(1, null),
    order(2, '2026-12-01'),
    order(3, '2026-10-06'),
    order(4, '2026-10-03'),
    order(5, '2026-10-02'),
    order(6, '2026-09-20'),
  ], NOW);
  assert.deepEqual(groups.map(g => g.key), ['overdue', 'today', 'tomorrow', 'day:2026-10-06', 'later', 'none']);
  assert.deepEqual(groups.map(g => g.label), ['Atrasadas', 'Hoy', 'Mañana', 'martes 6 de oct', 'Más adelante', 'Sin fecha']);
});

test('una orden con compromiso hoy no cuenta como atrasada aunque ya pasó la hora', () => {
  assert.deepEqual(keys([order(1, '2026-10-02')]), ['today']);
});

test('omite las órdenes sin piezas pendientes y los grupos vacíos', () => {
  const done = order(1, '2026-10-03', { qty_total: 5, qty_delivered: 5 });
  assert.deepEqual(keys([done]), []);
});

test('ordena cada grupo por fecha y luego por número de orden; atrasadas, la más vieja primero', () => {
  const groups = buildAgenda([
    order(3, '2026-09-30'),
    order(2, '2026-09-10'),
    order(1, '2026-09-30'),
  ], NOW);
  assert.deepEqual(groups[0].orders.map(o => o.id), [2, 1, 3]);
});

test('el horizonte es de 15 días contando hoy: del día 16 en adelante cae en más adelante', () => {
  assert.deepEqual(keys([order(1, '2026-10-16')]), ['day:2026-10-16']);
  assert.deepEqual(keys([order(1, '2026-10-17')]), ['later']);
});
