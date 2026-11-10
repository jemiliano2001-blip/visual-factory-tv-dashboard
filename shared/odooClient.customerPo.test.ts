/**
 * QA PR #4 — PO del cliente (client_order_ref) en el cliente de Odoo, solo mocks.
 * Nunca toca un Odoo real: odooCall / fetch se sustituyen en cada prueba.
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OdooClient } from './odooClient.ts';

type Call = { model: string; method: string; args: unknown[]; kwargs: Record<string, unknown> };

function rawOrder(id: number, ref: unknown, extra: Record<string, unknown> = {}) {
  const order: Record<string, unknown> = {
    id, name: `2026/S0${id}`, partner_id: [1, 'Cliente'], date_order: '2026-11-01 10:00:00',
    commitment_date: '2026-12-01 10:00:00', invoice_status: 'to invoice', currency_id: [1, 'MXN'],
    order_line: [id * 10], state: 'sale', user_id: false, note: false, ...extra,
  };
  if (ref !== '__omit__') order.client_order_ref = ref;
  return order;
}

function mockClient(orders: Array<Record<string, unknown>>, pickings: unknown[] = []) {
  const calls: Call[] = [];
  const client = new OdooClient({ url: 'http://odoo.mock', db: 'db', username: 'u', password: 'p' });
  client.odooCall = async <T>(model: string, method: string, args: unknown[] = [], kwargs: Record<string, unknown> = {}): Promise<T> => {
    calls.push({ model, method, args, kwargs });
    let result: unknown;
    if (model === 'sale.order' && method === 'search') result = orders.map(o => o.id);
    else if (model === 'sale.order' && method === 'read') result = orders;
    else if (model === 'sale.order.line') result = orders.map(o => ({
      id: (o.id as number) * 10, name: `Pieza ${o.id}`, display_type: false, product_uom_qty: 1, product_uom: [1, 'Pieza'],
    }));
    else if (model === 'stock.picking') result = pickings;
    else if (model === 'stock.move') result = [];
    else if (model === 'uom.uom') result = [{ id: 1, factor: 1, category_id: [1, 'Unidad'] }];
    else if (model === 'res.partner') result = [{ id: 1, name: 'Cliente', show_in_dashboard: true }];
    else throw new Error(`Consulta inesperada: ${model}.${method}`);
    return result as T;
  };
  return { client, calls };
}

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

test('client_order_ref = false (Odoo sin valor) → customer_reference null', async () => {
  const { client } = mockClient([rawOrder(1, false)]);
  const { orders } = await client.fetchInvoiceableOrders();
  assert.equal(orders[0].customer_reference, null);
});

test('client_order_ref ausente en la respuesta → null sin romper', async () => {
  const { client } = mockClient([rawOrder(1, '__omit__')]);
  const { orders } = await client.fetchInvoiceableOrders();
  assert.equal(orders[0].customer_reference, null);
});

test('client_order_ref no-string (null / número) → null', async () => {
  const { client } = mockClient([rawOrder(1, null), rawOrder(2, 4500123)]);
  const { orders } = await client.fetchInvoiceableOrders();
  assert.deepEqual(orders.map(o => o.customer_reference), [null, null]);
});

test('client_order_ref con espacios llega crudo; el recorte se hace al pintar', async () => {
  // Comportamiento real: el proxy no recorta; formatCustomerPo/getCustomerPo lo hacen en UI/Excel.
  const { client } = mockClient([rawOrder(1, '  PO-77  '), rawOrder(2, '   '), rawOrder(3, '')]);
  const { orders } = await client.fetchInvoiceableOrders();
  assert.deepEqual(orders.map(o => o.customer_reference), ['  PO-77  ', '   ', '']);
});

test('varias órdenes: cada una conserva su propio PO (sin cruzarse) y mezcla con/sin PO', async () => {
  const { client } = mockClient([
    rawOrder(1, 'PO-A'), rawOrder(2, false), rawOrder(3, 'PO-C'), rawOrder(4, '__omit__'), rawOrder(5, 'PO-A'),
  ]);
  const { orders } = await client.fetchInvoiceableOrders();
  assert.deepEqual(
    orders.map(o => [o.name, o.customer_reference]),
    [['2026/S01', 'PO-A'], ['2026/S02', null], ['2026/S03', 'PO-C'], ['2026/S04', null], ['2026/S05', 'PO-A']],
  );
});

test('remisión sin sale.order ligado (origin false o de otra SO) se ignora sin romper el PO', async () => {
  const { client } = mockClient([rawOrder(1, 'PO-1')], [
    { name: 'WH/OUT/1', origin: false, state: 'done', date_done: '2026-11-02' },
    { name: 'WH/OUT/2', origin: '2026/S0999', state: 'done', date_done: '2026-11-02' },
  ]);
  const { orders } = await client.fetchInvoiceableOrders();
  assert.equal(orders[0].customer_reference, 'PO-1');
  assert.deepEqual(orders[0].deliveries, []);
});

test('sin órdenes en Odoo → lista vacía, no se pide client_order_ref de nada', async () => {
  const { client, calls } = mockClient([]);
  assert.deepEqual(await client.fetchInvoiceableOrders(), { orders: [], truncated: false });
  assert.equal(calls.filter(c => c.method === 'read').length, 0);
});

test('solo lectura: todas las llamadas a Odoo son search/read/search_read y client_order_ref solo se lee', async () => {
  const { client, calls } = mockClient([rawOrder(1, 'PO-1'), rawOrder(2, false)]);
  await client.fetchInvoiceableOrders();
  for (const c of calls) assert.ok(['search', 'read', 'search_read'].includes(c.method), `${c.model}.${c.method}`);
  const withRef = calls.filter(c => JSON.stringify(c).includes('client_order_ref'));
  assert.equal(withRef.length, 1);
  assert.equal(withRef[0].model, 'sale.order');
  assert.equal(withRef[0].method, 'read');
});

test('el código del cliente Odoo no llama write/create/unlink', () => {
  const src = readFileSync(new URL('./odooClient.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /['"](write|create|unlink)['"]/);
});

test('sin_permiso: AccessError en sale.order.read → rechaza con el mensaje de Odoo (no devuelve PO inventado)', async () => {
  const { client } = mockClient([rawOrder(1, 'PO-1')]);
  const base = client.odooCall.bind(client);
  client.odooCall = async <T>(model: string, method: string, args?: unknown[], kwargs?: Record<string, unknown>): Promise<T> => {
    if (model === 'sale.order' && method === 'read') {
      throw new Error('Odoo RPC Error: You are not allowed to access \'Sales Order\' (sale.order) records.');
    }
    return base<T>(model, method, args, kwargs);
  };
  await assert.rejects(client.fetchInvoiceableOrders(), /not allowed to access/);
});

test('sin_permiso vía JSON-RPC (fetch mock): AccessError se propaga como Odoo RPC Error', async () => {
  let n = 0;
  globalThis.fetch = (async (url: string) => {
    n++;
    if (String(url).endsWith('/web/session/authenticate')) {
      return new Response(JSON.stringify({ result: { uid: 7 } }), { headers: { 'set-cookie': 'session_id=mock; Path=/' } });
    }
    return new Response(JSON.stringify({
      error: { code: 200, message: 'Odoo Server Error', data: { name: 'odoo.exceptions.AccessError', message: 'Sin permiso para Pedido de venta' } },
    }));
  }) as typeof fetch;
  const client = new OdooClient({ url: 'http://odoo.mock', db: 'db', username: 'u', password: 'p' });
  await assert.rejects(client.fetchInvoiceableOrders(), /Odoo RPC Error: Sin permiso para Pedido de venta/);
  assert.equal(n, 2);
});

test('Odoo caído (error de red) → rechaza; el caché no guarda el fallo', async () => {
  globalThis.fetch = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
  const client = new OdooClient({ url: 'http://odoo.mock', db: 'db', username: 'u', password: 'p' });
  await assert.rejects(client.fetchInvoiceableOrdersCached(), /fetch failed/);
  let calls = 0;
  client.fetchInvoiceableOrders = async () => { calls++; return { orders: [], truncated: false }; };
  await client.fetchInvoiceableOrdersCached();
  assert.equal(calls, 1);
});

test('Odoo timeout (AbortError) → rechaza sin colgarse', async () => {
  globalThis.fetch = (async () => { throw new DOMException('The operation was aborted.', 'AbortError'); }) as typeof fetch;
  const client = new OdooClient({ url: 'http://odoo.mock', db: 'db', username: 'u', password: 'p' });
  await assert.rejects(client.fetchInvoiceableOrders(), /aborted/);
});

test('Odoo responde HTTP 502 → rechaza con el status', async () => {
  globalThis.fetch = (async () => new Response('bad gateway', { status: 502, statusText: 'Bad Gateway' })) as typeof fetch;
  const client = new OdooClient({ url: 'http://odoo.mock', db: 'db', username: 'u', password: 'p' });
  await assert.rejects(client.fetchInvoiceableOrders(), /HTTP: 502/);
});
