/**
 * QA PR #4 — casos borde del PO del cliente en UI, orden de la columna, Excel,
 * errores del proxy y "no editable". Solo mocks; sin Odoo ni Firebase reales.
 */
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTable, getCoreRowModel, getSortedRowModel, type SortingState } from '@tanstack/table-core';
import { CustomerPo } from './CustomerPo';
import OrdersTable from './admin/OrdersTable';
import PendingTab from './admin/PendingTab';
import AgendaTab from './admin/AgendaTab';
import DeliveriesTab from './admin/DeliveriesTab';
import OrderReportTab from './admin/OrderReportTab';
import OdooOrderCard from './OdooOrderCard';
import OdooStatusBadge from './OdooStatusBadge';
import { OrderDetailsModal } from './OrderDetailsModal';
import { fetchInvoiceableOrders, type OdooSaleOrder } from '../services/odoo';
import { buildOrderRows, buildPendingLineRows } from '../services/exportExcel';
import { compareCustomerPo, formatCustomerPo, getCustomerPo } from '../services/customerPo';
import { auth } from '../firebase';

function order(overrides: Partial<OdooSaleOrder> & Record<string, unknown>): OdooSaleOrder {
  return {
    id: 1, name: '2026/S09001', customer_reference: null, partner_name: 'CLIENTE PRUEBA',
    main_product: 'Pieza prueba', date_order: '2026-11-01 10:00:00', commitment_date: '2099-12-01 10:00:00',
    invoice_status: 'to invoice', currency: 'MXN', qty_total: 10, qty_delivered: 0, state: 'sale',
    salesperson: null, lines_count: 1, lines: [{ name: 'Pieza prueba', qty: 10, delivered: 0, unit: 'Pieza(s)' }],
    deliveries: [{ name: 'WH/OUT/1', state: 'assigned', date_done: null }], note: null,
    ...overrides,
  } as OdooSaleOrder;
}

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
// Odoo manda `false` cuando el campo está vacío; también cubrimos payload viejo sin la llave.
const EMPTY_REFS: unknown[] = ['', null, undefined, false, '   ', '\t \n', 0, {}, []];

test('helper: vacío/null/undefined/false/solo espacios/no-string → «—» y getCustomerPo null', () => {
  for (const ref of EMPTY_REFS) {
    assert.equal(formatCustomerPo(ref as string), '—', JSON.stringify(ref));
    assert.equal(getCustomerPo(ref as string), null, JSON.stringify(ref));
  }
});

test('helper: recorta espacios/tabs/saltos al inicio y fin, conserva espacios internos', () => {
  assert.equal(formatCustomerPo('  PO 2026-01  '), 'PO 2026-01');
  assert.equal(formatCustomerPo('\tOC/45\n'), 'OC/45');
  assert.equal(formatCustomerPo('\u00a0PO9\u00a0'), 'PO9'); // NBSP también cuenta como espacio en trim()
});

test('CustomerPo: false, undefined, solo espacios → «PO: —» y data-customer-po vacío', () => {
  for (const ref of [false, undefined, '   ']) {
    const out = html(React.createElement(CustomerPo, { reference: ref as string }));
    assert.match(out, /PO: —/);
    assert.match(out, /data-customer-po=""/);
  }
  const trimmed = html(React.createElement(CustomerPo, { reference: '  PO-9 ' }));
  assert.match(trimmed, /PO: PO-9</);
  assert.match(trimmed, /data-customer-po="PO-9"/);
});

test('CustomerPo: escapa el texto del PO (no inyecta HTML)', () => {
  const out = html(React.createElement(CustomerPo, { reference: '<img src=x onerror=1>' }));
  assert.doesNotMatch(out, /<img/);
  assert.match(out, /&lt;img/);
});

test('orden de la columna: ascendente numérico, sin PO al final; descendente los pone arriba', () => {
  const data = [
    { id: 'a', ref: 'PO-10' }, { id: 'b', ref: false }, { id: 'c', ref: '  PO-2 ' },
    { id: 'd', ref: '   ' }, { id: 'e', ref: 'PO-1' }, { id: 'f', ref: null },
  ];
  const run = (desc: boolean) => {
    let sorting: SortingState = [{ id: 'po', desc }];
    const table = createTable({
      data,
      columns: [{ id: 'po', accessorFn: r => getCustomerPo(r.ref as string) ?? '', sortingFn: (a, b) => compareCustomerPo(a.original.ref as string, b.original.ref as string) }],
      state: { sorting, columnPinning: {}, columnVisibility: {}, columnOrder: [] },
      onStateChange: () => {}, renderFallbackValue: null,
      getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
      onSortingChange: u => { sorting = typeof u === 'function' ? u(sorting) : u; },
    });
    return table.getSortedRowModel().rows.map(r => r.original.id);
  };
  const asc = run(false);
  assert.deepEqual(asc.slice(0, 3), ['e', 'c', 'a']); // PO-1, PO-2, PO-10 (numérico, recortado)
  assert.deepEqual(new Set(asc.slice(3)), new Set(['b', 'd', 'f']));
  const desc = run(true);
  assert.deepEqual(new Set(desc.slice(0, 3)), new Set(['b', 'd', 'f']));
  assert.deepEqual(desc.slice(3), ['a', 'c', 'e']);
});

test('compareCustomerPo: iguales → 0, ambos vacíos → 0', () => {
  assert.equal(compareCustomerPo('PO-1', ' PO-1 '), 0);
  assert.equal(compareCustomerPo(false as unknown as string, '  '), 0);
});

const mixed = [
  order({ id: 1, name: '2026/S09001', customer_reference: 'PO-A' }),
  order({ id: 2, name: '2026/S09002', customer_reference: false as unknown as string }),
  order({ id: 3, name: '2026/S09003', customer_reference: '  PO-C  ' }),
  order({ id: 4, name: '2026/S09004', customer_reference: undefined as unknown as string }),
  order({ id: 5, name: '2026/S09005', customer_reference: ' ' }),
];

test('Admin › Órdenes: mezcla con/sin PO; false/undefined/espacios → «—», PO recortado', () => {
  const out = html(React.createElement(OrdersTable, { orders: mixed, groupByClient: true, rowSelection: {}, onRowSelectionChange: () => {} }));
  assert.match(out, /data-customer-po="PO-A">PO-A</);
  assert.match(out, /data-customer-po="PO-C">PO-C</);
  assert.equal((out.match(/data-customer-po="">—</g) ?? []).length, 3);
  assert.equal((out.match(/data-customer-po="PO-A"/g) ?? []).length, 1, 'el PO de una orden no se repite en otra');
});

test('Pendientes / Agenda / Entregas / Reporte: «PO: …» o «PO: —» con false/undefined/espacios', () => {
  for (const [name, Comp] of [['Pendientes', PendingTab], ['Agenda', AgendaTab], ['Entregas', DeliveriesTab], ['Reporte', OrderReportTab]] as const) {
    const out = html(React.createElement(Comp as React.FC<{ orders: OdooSaleOrder[] }>, { orders: mixed }));
    assert.match(out, /PO: PO-A</, name);
    assert.match(out, /PO: PO-C</, name);
    assert.equal((out.match(/PO: —</g) ?? []).length, 3, name);
  }
});

test('Tarjeta TV: false y solo espacios → «PO: —» y aria «sin PO»; PO con espacios se recorta', () => {
  const a = html(React.createElement(OdooOrderCard, { order: mixed[1], isWide: false, viewMode: 'desktop' }));
  const b = html(React.createElement(OdooOrderCard, { order: mixed[2], isWide: true, viewMode: 'tv' as 'desktop' }));
  assert.match(a, /PO: —/);
  assert.match(a, /PO sin PO,/);
  assert.match(b, /PO: PO-C</);
  assert.match(b, /PO PO-C,/);
});

test('Detalle de orden: no truena con PO false/espacios/null y usa formatCustomerPo con etiqueta «PO del cliente»', () => {
  // El diálogo se pinta en un portal: en SSR sale vacío, así que el texto visible
  // del detalle se verifica por fuente + helper (ver casos-nuevos.md).
  const g = globalThis as unknown as { window?: unknown };
  const prev = g.window;
  g.window = { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
  try {
    for (const o of [mixed[1], mixed[2], mixed[3], mixed[4], null]) {
      assert.doesNotThrow(() => html(React.createElement(OrderDetailsModal, { order: o, isOpen: true, onClose: () => {} })));
    }
  } finally {
    if (prev === undefined) delete g.window; else g.window = prev;
  }
  const src = readFileSync(new URL('./OrderDetailsModal.tsx', import.meta.url), 'utf8');
  assert.match(src, /formatCustomerPo\(order\.customer_reference\)/);
  assert.match(src, /PO del cliente/);
});

test('Excel: mezcla con/sin PO en Órdenes y Líneas pendientes; mismo orden que las órdenes', () => {
  for (const rows of [buildOrderRows(mixed), buildPendingLineRows(mixed)]) {
    assert.deepEqual(rows.map(r => [r.SO, r['PO cliente']]), [
      ['2026/S09001', 'PO-A'], ['2026/S09002', '—'], ['2026/S09003', 'PO-C'], ['2026/S09004', '—'], ['2026/S09005', '—'],
    ]);
  }
});

test('Excel: sin órdenes → sin filas (no truena)', () => {
  assert.deepEqual(buildOrderRows([]), []);
  assert.deepEqual(buildPendingLineRows([]), []);
});

test('Odoo caído / sin_permiso en UI: badge muestra desconectado con el mensaje, sin tronar', () => {
  const out = html(React.createElement(OdooStatusBadge, {
    status: { connected: false, message: 'Odoo RPC Error: Sin permiso para Pedido de venta' },
    lastUpdated: null, onRefresh: () => {}, isRefreshing: false,
  }));
  assert.ok(out.length > 0);
  assert.doesNotMatch(out, /Conectado a Odoo/);
});

// ─── Proxy del dashboard (src/services/odoo.ts) con auth y fetch simulados ───
const realFetch = globalThis.fetch;
function mockSignedIn() {
  Object.defineProperty(auth, 'currentUser', { configurable: true, get: () => ({ getIdToken: async () => 'mock-token' }) });
}
afterEach(() => {
  globalThis.fetch = realFetch;
  delete (auth as unknown as Record<string, unknown>).currentUser;
});

test('proxy: Odoo caído (red) → Error «Sin conexión al proxy de Odoo»', async () => {
  mockSignedIn();
  globalThis.fetch = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
  await assert.rejects(fetchInvoiceableOrders(), /Sin conexión al proxy de Odoo: fetch failed/);
});

test('proxy: timeout → Error «Sin conexión al proxy de Odoo» (no lista vacía)', async () => {
  mockSignedIn();
  globalThis.fetch = (async () => { throw new DOMException('The operation timed out.', 'TimeoutError'); }) as typeof fetch;
  await assert.rejects(fetchInvoiceableOrders(), /Sin conexión al proxy de Odoo: The operation timed out/);
});

test('proxy: sin_permiso (500 con error de Odoo) → Error con el mensaje, no órdenes vacías', async () => {
  mockSignedIn();
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Odoo RPC Error: Sin permiso para Pedido de venta', orders: [] }), { status: 500 })) as typeof fetch;
  await assert.rejects(fetchInvoiceableOrders(), /Sin permiso para Pedido de venta/);
});

test('proxy: el dashboard solo hace GET (sin body) a invoiceable-orders', async () => {
  mockSignedIn();
  const seen: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    seen.push({ url: String(url), init });
    return new Response(JSON.stringify({ orders: [], total: 0, truncated: false, lastUpdated: null }));
  }) as typeof fetch;
  await fetchInvoiceableOrders();
  assert.equal(seen.length, 1);
  assert.match(seen[0].url, /\/api\/odoo\/invoiceable-orders$/);
  assert.equal(seen[0].init?.method ?? 'GET', 'GET');
  assert.equal(seen[0].init?.body, undefined);
});

// ─── El Hub no permite editar el PO ───
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

test('no editable: ninguna línea de src/ asigna customer_reference/client_order_ref ni lo manda en un write', () => {
  const root = new URL('..', import.meta.url).pathname;
  const offenders: string[] = [];
  for (const file of sourceFiles(root)) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (!/customer_reference|client_order_ref/.test(line)) return;
      const isTypeDecl = /^\s*customer_reference:\s*string \| null;/.test(line);
      const isWrite = /(customer_reference|client_order_ref)\s*(=[^=]|:)|setDoc|updateDoc|addDoc|\.write\(|method:\s*['"]POST/.test(line);
      if (isWrite && !isTypeDecl) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, []);
});

test('no editable: CustomerPo, columna y detalle no tienen input/textarea/contenteditable ni onChange', () => {
  const root = new URL('.', import.meta.url).pathname;
  const po = readFileSync(join(root, 'CustomerPo.tsx'), 'utf8');
  assert.doesNotMatch(po, /<input|<textarea|contentEditable|onChange|onBlur|onSubmit/);
  const out = html(React.createElement(OrdersTable, { orders: mixed, groupByClient: false, rowSelection: {}, onRowSelectionChange: () => {} }));
  for (const cell of out.match(/<[a-z]+[^>]*data-customer-po[^>]*>[^<]*<\/[a-z]+>/g) ?? []) {
    assert.doesNotMatch(cell, /<input|<textarea|contenteditable/i);
  }
});
