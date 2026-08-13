import assert from 'node:assert/strict';
import test from 'node:test';
import type { OdooSaleOrder } from '../services/odoo';
import { buildTVPages, EXCLUSIVE_COMPANY_ORDER_THRESHOLD } from './tvPagePacking';
import { getCenteredLastRowStart } from './tvGridLayout';

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
    [['A', 6], ['B', 2]],
  );
  assert.equal(pages[3].type, 'company');
  assert.equal(pages[3].type === 'company' && pages[3].company, 'C');
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

test('normaliza una capacidad inválida y mantiene enteros los clientes cuando partirlos no ahorra páginas', () => {
  assert.equal(buildTVPages([order(1, 'A')], 0).length, 1);
  const pages = buildTVPages([
    ...Array.from({ length: 6 }, (_, i) => order(i + 1, 'A')),
    ...Array.from({ length: 8 }, (_, i) => order(i + 7, 'B')),
  ], 10);
  assert.deepEqual(
    pages.map(page => page.type === 'company' ? [page.company, page.orders.length] : page.segments),
    [['A', 6], ['B', 8]],
  );
});

test('limita las páginas compartidas a dos clientes para conservar bloques legibles', () => {
  const pages = buildTVPages([
    ...Array.from({ length: 7 }, (_, i) => order(i + 1, 'A')),
    order(8, 'B'),
    order(9, 'C'),
  ], 9);

  assert.equal(pages[0].type, 'shared');
  assert.deepEqual(
    pages[0].type === 'shared' && pages[0].segments.map(segment => [segment.company, segment.orders.length]),
    [['A', 7], ['B', 1]],
  );
  assert.equal(pages[1].type, 'company');
  assert.equal(pages[1].type === 'company' && pages[1].company, 'C');
});

test('mantiene cada orden localizable dentro de segmentos compartidos', () => {
  const source = [order(1, 'A'), order(2, 'A'), order(3, 'B')];
  const [page] = buildTVPages(source, 4);

  assert.equal(page.type, 'shared');
  const found = page.type === 'shared'
    && page.segments.some(segment => segment.orders.some(item => item.name === '2026/S00003'));
  assert.equal(found, true);
});

test('mantiene exclusiva la última página de una empresa grande', () => {
  const pages = buildTVPages([
    ...Array.from({ length: EXCLUSIVE_COMPANY_ORDER_THRESHOLD + 5 }, (_, i) => order(i + 1, 'A')),
    ...Array.from({ length: 3 }, (_, i) => order(i + 26, 'B')),
    ...Array.from({ length: 4 }, (_, i) => order(i + 29, 'C')),
  ], EXCLUSIVE_COMPANY_ORDER_THRESHOLD);

  assert.deepEqual(
    pages.map(page => page.type === 'company'
      ? [page.type, page.company, page.orders.length, page.current, page.total]
      : [page.type, page.segments.map(segment => [segment.company, segment.orders.length])]),
    [
      ['company', 'A', EXCLUSIVE_COMPANY_ORDER_THRESHOLD, 1, 2],
      ['company', 'A', 5, 2, 2],
      ['shared', [['B', 3], ['C', 4]]],
    ],
  );
});

test('centra únicamente el inicio de la última fila parcial', () => {
  assert.equal(getCenteredLastRowStart(4, 5, 4), 4);
  assert.equal(getCenteredLastRowStart(0, 5, 4), undefined);
  assert.equal(getCenteredLastRowStart(0, 4, 4), undefined);
  assert.equal(getCenteredLastRowStart(4, 7, 4), 2);
});

test('empaqueta hasta cuatro clientes pequeños en una cuadrícula cuando la TV lo permite', () => {
  const pages = buildTVPages([
    ...Array.from({ length: 2 }, (_, i) => order(i + 1, 'A')),
    order(3, 'B'),
    ...Array.from({ length: 3 }, (_, i) => order(i + 4, 'C')),
    ...Array.from({ length: 4 }, (_, i) => order(i + 7, 'D')),
  ], { ordersPerPage: 20, gridCols: 5, gridRows: 4 });

  assert.deepEqual(
    pages.map(page => page.type === 'shared'
      ? [page.type, page.layout, page.segments.map(segment => [segment.company, segment.orders.length])]
      : [page.type, page.company, page.orders.length]),
    [['shared', 'quad', [['A', 2], ['B', 1], ['C', 3], ['D', 4]]]],
  );
});

test('reduce a dos clientes por página cuando la cuadrícula 2x2 no cabe con legibilidad', () => {
  const pages = buildTVPages([
    ...Array.from({ length: 2 }, (_, i) => order(i + 1, 'A')),
    order(3, 'B'),
    ...Array.from({ length: 3 }, (_, i) => order(i + 4, 'C')),
    ...Array.from({ length: 4 }, (_, i) => order(i + 7, 'D')),
  ], { ordersPerPage: 12, gridCols: 3, gridRows: 4 });

  assert.deepEqual(
    pages.map(page => page.type === 'shared'
      ? [page.type, page.layout, page.segments.map(segment => [segment.company, segment.orders.length])]
      : [page.type, page.company, page.orders.length]),
    [
      ['shared', 'split', [['C', 3], ['D', 4]]],
      ['shared', 'split', [['A', 2], ['B', 1]]],
    ],
  );
});

test('no parte clientes pequeños y nunca agrega más de cuatro por página compartida', () => {
  const source = ['A', 'B', 'C', 'D', 'E'].flatMap((company, index) => [order(index + 1, company)]);
  const pages = buildTVPages(source, { ordersPerPage: 20, gridCols: 5, gridRows: 4 });
  const sharedPages = pages.filter(page => page.type === 'shared');

  assert.deepEqual(sharedPages.map(page => page.segments.length), [4]);
  assert.equal(pages[1].type, 'company');
  assert.equal(pages[1].type === 'company' && pages[1].company, 'E');
  assert.deepEqual(
    pages.flatMap(page => page.type === 'company' ? page.orders : page.segments.flatMap(segment => segment.orders))
      .map(item => item.id).sort((a, b) => a - b),
    source.map(item => item.id),
  );
});
