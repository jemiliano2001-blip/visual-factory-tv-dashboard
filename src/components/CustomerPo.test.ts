import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CustomerPo } from './CustomerPo';
import OrdersTable from './admin/OrdersTable';
import PendingTab from './admin/PendingTab';
import OdooOrderCard from './OdooOrderCard';
import type { OdooSaleOrder } from '../services/odoo';
import { buildOrderRows, buildPendingLineRows } from '../services/exportExcel';

function order(overrides: Partial<OdooSaleOrder>): OdooSaleOrder {
  return {
    id: 1,
    name: '2026/S09001',
    customer_reference: null,
    partner_name: 'CLIENTE PRUEBA',
    main_product: 'Pieza prueba',
    date_order: '2026-11-01 10:00:00',
    commitment_date: '2099-12-01 10:00:00',
    invoice_status: 'to invoice',
    currency: 'MXN',
    qty_total: 10,
    qty_delivered: 0,
    state: 'sale',
    salesperson: null,
    lines_count: 1,
    lines: [{ name: 'Pieza prueba', qty: 10, delivered: 0, unit: 'Pieza(s)' }],
    deliveries: [],
    note: null,
    ...overrides,
  };
}

const withPo = order({ id: 1, name: '2026/S09001', customer_reference: 'PO20264321' });
const withoutPo = order({ id: 2, name: '2026/S09002', customer_reference: null });
const blankPo = order({ id: 3, name: '2026/S09003', customer_reference: '   ' });

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

test('CustomerPo pinta el PO del cliente', () => {
  const out = html(React.createElement(CustomerPo, { reference: 'PO20264321' }));
  assert.match(out, /PO: PO20264321/);
  assert.match(out, /title="PO del cliente: PO20264321"/);
});

test('CustomerPo sin PO pinta «—» (nunca se oculta)', () => {
  for (const ref of [null, undefined, '', '  ']) {
    const out = html(React.createElement(CustomerPo, { reference: ref }));
    assert.match(out, /PO: —/, String(ref));
    assert.match(out, /Sin PO del cliente en Odoo/);
  }
});

test('CustomerPo es solo lectura: no hay input ni botón de edición', () => {
  const out = html(React.createElement(CustomerPo, { reference: 'X1' }));
  assert.doesNotMatch(out, /<input|<textarea|<button|contenteditable/i);
});

test('Órdenes (admin): columna «PO cliente» junto a SO, con PO y con guión', () => {
  const out = html(React.createElement(OrdersTable, {
    orders: [withPo, withoutPo, blankPo],
    groupByClient: false,
    rowSelection: {},
    onRowSelectionChange: () => {},
  }));
  const headers = [...out.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
  const soIdx = headers.indexOf('SO');
  assert.ok(soIdx >= 0, `headers: ${headers.join('|')}`);
  assert.equal(headers[soIdx + 1], 'PO cliente');
  assert.match(out, />PO20264321</);
  assert.equal((out.match(/>—</g) ?? []).length >= 2, true, 'dos órdenes sin PO muestran —');
});

test('Pendientes (admin): PO bajo el SO o guión', () => {
  const out = html(React.createElement(PendingTab, { orders: [withPo, withoutPo] }));
  assert.match(out, /PO: PO20264321/);
  assert.match(out, /PO: —/);
});

test('Tarjeta TV: PO bajo el SO o guión', () => {
  const a = html(React.createElement(OdooOrderCard, { order: withPo, isWide: false, viewMode: 'desktop' }));
  const b = html(React.createElement(OdooOrderCard, { order: withoutPo, isWide: false, viewMode: 'desktop' }));
  assert.match(a, /PO: PO20264321/);
  assert.match(b, /PO: —/);
  assert.match(b, /aria-label="2026\/S09002, PO sin PO,/);
});

test('Excel: columna «PO cliente» justo después de SO en Órdenes y Líneas pendientes', () => {
  for (const rows of [buildOrderRows([withPo, withoutPo]), buildPendingLineRows([withPo, withoutPo])]) {
    assert.deepEqual(Object.keys(rows[0]).slice(0, 2), ['SO', 'PO cliente']);
    assert.equal(rows[0]['PO cliente'], 'PO20264321');
    assert.equal(rows[1]['PO cliente'], '—');
  }
});
