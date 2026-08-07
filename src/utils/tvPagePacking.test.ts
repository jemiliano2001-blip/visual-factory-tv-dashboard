import assert from 'node:assert/strict';
import test from 'node:test';
import type { OdooSaleOrder } from '../services/odoo';
import { buildTVPages } from './tvPagePacking';

const order = (id: number, company: string): OdooSaleOrder => ({
  id, name: `2026/S${String(id).padStart(5, '0')}`,
  customer_reference: null, partner_name: company, main_product: 'Producto',
  date_order: '2026-08-01 00:00:00', commitment_date: null,
  invoice_status: 'to invoice', currency: 'MXN', qty_total: 1, qty_delivered: 0,
  state: 'sale', salesperson: null, lines_count: 1,
  lines: [{ name: 'Producto', qty: 1, delivered: 0 }], deliveries: [], note: null,
});

test('emite páginas completas antes de las páginas compartidas', () => {
  const orders = [
    ...Array.from({ length: 16 }, (_, i) => order(i + 1, 'A')),
    ...Array.from({ length: 12 }, (_, i) => order(i + 17, 'B')),
    ...Array.from({ length: 8 }, (_, i) => order(i + 29, 'C')),
  ];
  const pages = buildTVPages(orders, 10);

  assert.deepEqual(pages.slice(0, 2).map(page => page.type), ['company', 'company']);
  assert.equal(pages[0].type === 'company' && pages[0].orders.length, 10);
  assert.equal(pages[1].type === 'company' && pages[1].orders.length, 10);
  assert.equal(pages[2].type, 'shared');
  assert.deepEqual(
    pages[2].type === 'shared' && pages[2].segments.map(segment => [segment.company, segment.orders.length]),
    [['A', 6], ['B', 2], ['C', 2]],
  );
});

test('no duplica órdenes y conserva un único sobrante como página exclusiva', () => {
  const source = [...Array.from({ length: 10 }, (_, i) => order(i + 1, 'A')), order(11, 'B')];
  const pages = buildTVPages(source, 10);
  const pageOrders = pages.flatMap(page => page.type === 'company'
    ? page.orders : page.segments.flatMap(segment => segment.orders));

  assert.deepEqual(pageOrders.map(item => item.id), source.map(item => item.id));
  assert.deepEqual(pages.map(page => page.type), ['company', 'company']);
  assert.equal(pages[1].type === 'company' && pages[1].company, 'B');
});

test('numera las páginas completas y el sobrante exclusivo de una empresa', () => {
  const pages = buildTVPages(Array.from({ length: 16 }, (_, i) => order(i + 1, 'A')), 10);

  assert.deepEqual(
    pages.map(page => page.type === 'company' && [page.current, page.total]),
    [[1, 2], [2, 2]],
  );
});

test('normaliza una capacidad inválida y parte un sobrante solo para completar la página', () => {
  assert.equal(buildTVPages([order(1, 'A')], 0).length, 1);
  const pages = buildTVPages([
    ...Array.from({ length: 6 }, (_, i) => order(i + 1, 'A')),
    ...Array.from({ length: 8 }, (_, i) => order(i + 7, 'B')),
  ], 10);
  assert.deepEqual(pages[0].type === 'shared' && pages[0].segments.map(s => [s.company, s.orders.length]), [['A', 6], ['B', 4]]);
  assert.deepEqual(pages[1].type === 'shared' && pages[1].segments.map(s => [s.company, s.orders.length]), [['B', 4]]);
});

test('mantiene cada orden localizable dentro de segmentos compartidos', () => {
  const source = [order(1, 'A'), order(2, 'A'), order(3, 'B')];
  const [page] = buildTVPages(source, 4);

  assert.equal(page.type, 'shared');
  const found = page.type === 'shared'
    && page.segments.some(segment => segment.orders.some(item => item.name === '2026/S00003'));
  assert.equal(found, true);
});
