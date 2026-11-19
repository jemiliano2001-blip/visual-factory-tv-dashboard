import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OdooClient } from './odooClient.ts';

type Result = Awaited<ReturnType<OdooClient['fetchInvoiceableOrders']>>;

function clientWith(fetcher: () => Promise<Result>) {
  const client = new OdooClient({ url: 'http://odoo.test', db: 'db', username: 'u', password: 'p' });
  client.fetchInvoiceableOrders = fetcher;
  return client;
}

const empty: Result = { orders: [], truncated: false };

test('comparte una sola consulta entre llamadas dentro del TTL', async () => {
  let calls = 0;
  const client = clientWith(async () => { calls++; return empty; });
  await Promise.all([client.fetchInvoiceableOrdersCached(), client.fetchInvoiceableOrdersCached()]);
  await client.fetchInvoiceableOrdersCached();
  assert.equal(calls, 1);
});

test('vuelve a consultar cuando vence el TTL', async () => {
  let calls = 0;
  const client = clientWith(async () => { calls++; return empty; });
  await client.fetchInvoiceableOrdersCached(0);
  await client.fetchInvoiceableOrdersCached(0);
  assert.equal(calls, 2);
});

test('no cachea los fallos', async () => {
  let calls = 0;
  const client = clientWith(async () => {
    calls++;
    if (calls === 1) throw new Error('Odoo caído');
    return empty;
  });
  await assert.rejects(client.fetchInvoiceableOrdersCached(), /Odoo caído/);
  await client.fetchInvoiceableOrdersCached();
  assert.equal(calls, 2);
});

type FixtureMove = {
  id: number; sale_line_id: [number, string] | false; quantity_done: number;
  product_uom: [number, string] | false; origin_returned_move_id: [number, string] | false;
};

function transferClient(options: { moves?: FixtureMove[]; returns?: FixtureMove[]; failMoves?: boolean; note?: string; invoiced?: unknown[] } = {}) {
  const calls: Array<{ model: string; args: unknown[]; kwargs: Record<string, unknown> }> = [];
  const client = new OdooClient({ url: 'http://odoo.test', db: 'db', username: 'u', password: 'p' });
  client.odooCall = async <T>(model: string, method: string, args: unknown[] = [], kwargs: Record<string, unknown> = {}): Promise<T> => {
    calls.push({ model, args, kwargs });
    let result: unknown;
    if (model === 'sale.order' && method === 'search') result = [3230];
    else if (model === 'sale.order') result = [{
      id: 3230, name: '2026/S01992', partner_id: [1, 'Cliente'], date_order: '2026-09-28',
      commitment_date: '2026-10-05', invoice_status: 'partially_invoiced', currency_id: [1, 'MXN'],
      order_line: [5159, 5160], state: 'sale', user_id: false, note: options.note ?? false,
    }];
    else if (model === 'sale.order.line') result = [
      { id: 5159, name: 'Navajas', display_type: false, product_uom_qty: 5, qty_delivered: 5, product_uom: [1, 'Pieza'], ...(options.invoiced ? { qty_invoiced: options.invoiced[0] } : {}) },
      { id: 5160, name: 'Blade cutter', display_type: false, product_uom_qty: 5, qty_delivered: 5, product_uom: [26, 'Set'], ...(options.invoiced ? { qty_invoiced: options.invoiced[1] } : {}) },
    ];
    else if (model === 'stock.picking') result = [
      { name: '00309', origin: '2026/S01992', state: 'done', date_done: '2026-09-30' },
      { name: '00309_2', origin: '2026/S01992', state: 'done', date_done: '2026-10-12' },
      { name: '00309_3', origin: '2026/S01992', state: 'assigned', date_done: false },
    ];
    else if (model === 'stock.move') {
      if (options.failMoves) throw new Error('Movimientos no disponibles');
      const returnsQuery = JSON.stringify(args).includes('origin_returned_move_id');
      const moves = returnsQuery ? options.returns ?? [] : options.moves ?? [
        { id: 649, sale_line_id: [5159, 'Navajas'], quantity_done: 3, product_uom: [1, 'Pieza'], origin_returned_move_id: false },
        { id: 650, sale_line_id: [5160, 'Blade cutter'], quantity_done: 5, product_uom: [26, 'Set'], origin_returned_move_id: false },
      ];
      result = moves.slice(Number(kwargs.offset ?? 0), Number(kwargs.offset ?? 0) + Number(kwargs.limit ?? moves.length));
    }
    else if (model === 'uom.uom') result = [
      { id: 1, name: 'Pieza', factor: 1, category_id: [1, 'Unidad'] },
      { id: 26, name: 'Set', factor: 1, category_id: [1, 'Unidad'] },
      { id: 27, name: 'Docena', factor: 1 / 12, category_id: [1, 'Unidad'] },
      { id: 28, name: 'Decena', factor: 0.1, category_id: [1, 'Unidad'] },
    ];
    else if (model === 'res.partner') result = [{ id: 1, name: 'Cliente', show_in_dashboard: true }];
    else throw new Error(`Consulta inesperada: ${model}.${method}`);
    return result as T;
  };
  return { client, calls };
}

test('incluye órdenes parcialmente facturadas y calcula SO1992 por movimientos hechos', async () => {
  const { client, calls } = transferClient();
  const { orders } = await client.fetchInvoiceableOrders();
  assert.deepEqual(calls[0].args, [[['invoice_status', 'in', ['to invoice', 'partially_invoiced']], ['state', 'in', ['sale', 'done']]]]);
  assert.deepEqual(orders[0].lines.map(line => line.delivered), [3, 5]);
  assert.deepEqual(orders[0].lines.map(line => line.id), [5159, 5160]);
  for (const call of calls.filter(call => call.model === 'stock.move')) {
    assert.ok(JSON.stringify(call.args).includes('["state","=","done"]'));
    assert.ok(JSON.stringify(call.args).includes('["picking_id.state","=","done"]'));
    assert.ok(!JSON.stringify(call).includes('entregado'));
  }
});

test('un fallo de movimientos no reemplaza el avance por qty_delivered de la venta', async () => {
  const { client } = transferClient({ failMoves: true });
  await assert.rejects(client.fetchInvoiceableOrders(), /Movimientos no disponibles/);
});

test('sin movimientos hechos no hay entrega aunque la venta indique 100%', async () => {
  const { client } = transferClient({ moves: [] });
  const { orders } = await client.fetchInvoiceableOrders();
  assert.deepEqual(orders[0].lines.map(line => line.delivered), [0, 0]);
});

test('convierte unidades y descuenta una devolución hecha vinculada al movimiento original', async () => {
  const { client } = transferClient({
    moves: [{ id: 649, sale_line_id: [5159, 'Navajas'], quantity_done: 0.5, product_uom: [27, 'Docena'], origin_returned_move_id: false }],
    returns: [{ id: 700, sale_line_id: false, quantity_done: 2, product_uom: [1, 'Pieza'], origin_returned_move_id: [649, 'Salida'] }],
  });
  const { orders } = await client.fetchInvoiceableOrders();
  assert.equal(orders[0].lines[0].delivered, 4);
});

test('pagina los movimientos sin perder entregas después del límite', async () => {
  const moves: FixtureMove[] = Array.from({ length: 1001 }, (_, id) => ({
    id: id + 1, sale_line_id: [5159, 'Navajas'], quantity_done: 1,
    product_uom: [1, 'Pieza'], origin_returned_move_id: false,
  }));
  const { client } = transferClient({ moves });
  assert.equal((await client.fetchInvoiceableOrders()).orders[0].lines[0].delivered, 1001);
});

test('una conversión completa no deja residuos binarios que aparenten piezas pendientes', async () => {
  const { client } = transferClient({ moves: [
    { id: 649, sale_line_id: [5159, 'Navajas'], quantity_done: 0.7, product_uom: [28, 'Decena'], origin_returned_move_id: false },
  ] });
  assert.equal((await client.fetchInvoiceableOrders()).orders[0].lines[0].delivered, 7);
});

test('el compromiso sale del plazo de la nota; sin plazo usa la fecha de entrega de Odoo', async () => {
  const withNote = await transferClient({ note: '<p>TIEMPO DE ENTREGA 2 A 3 SEMANAS.</p>' }).client.fetchInvoiceableOrders();
  assert.equal(withNote.orders[0].commitment_date, '2026-10-19 00:00:00'); // 28/09 + 15 días hábiles
  const without = await transferClient().client.fetchInvoiceableOrders();
  assert.equal(without.orders[0].commitment_date, '2026-10-05');
});

test('cada partida expone lo facturado en Odoo; ausente, no numérico o negativo = 0', async () => {
  const lectura = async (invoiced?: unknown[]) => (await transferClient({ invoiced }).client.fetchInvoiceableOrders()).orders[0].lines.map(l => l.invoiced);
  assert.deepEqual(await lectura([3, 1.5]), [3, 1.5]);
  assert.deepEqual(await lectura(), [0, 0]);
  assert.deepEqual(await lectura(['x', -2]), [0, 0]);
});

test('move.product_uom en false en un movimiento no vinculado no truena', async () => {
  const { client } = transferClient({
    moves: [
      { id: 649, sale_line_id: [5159, 'Navajas'], quantity_done: 2, product_uom: [1, 'Pieza'], origin_returned_move_id: false },
      { id: 650, sale_line_id: false, quantity_done: 1, product_uom: false, origin_returned_move_id: false },
    ],
  });
  const { orders } = await client.fetchInvoiceableOrders();
  assert.equal(orders[0].lines[0].delivered, 2);
});

test('ttlMs <= 0 no sobreescribe la caché activa e invalidateOrdersCache la limpia', async () => {
  let calls = 0;
  const client = clientWith(async () => { calls++; return empty; });
  await client.fetchInvoiceableOrdersCached(60_000);
  await client.fetchInvoiceableOrdersCached(0);
  await client.fetchInvoiceableOrdersCached(60_000);
  assert.equal(calls, 2);
  client.invalidateOrdersCache();
  await client.fetchInvoiceableOrdersCached(60_000);
  assert.equal(calls, 3);
});

test('reautentica una sola vez ante llamadas concurrentes con 401 o respuesta HTML no JSON', async () => {
  const originalFetch = globalThis.fetch;
  let authCalls = 0;
  let rpcCalls = 0;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/web/session/authenticate')) {
      authCalls++;
      return new Response(JSON.stringify({ result: { uid: authCalls } }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': `session_id=s${authCalls}; Path=/` },
      });
    }
    rpcCalls++;
    if (rpcCalls === 1) {
      return new Response('<html>login</html>', { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (rpcCalls === 2) {
      return new Response('Unauthorized', { status: 401 });
    }
    return new Response(JSON.stringify({ result: 'ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  try {
    const client = new OdooClient({ url: 'http://odoo.test', db: 'db', username: 'u', password: 'p' });
    const [a, b] = await Promise.all([
      client.odooCall<string>('sale.order', 'search'),
      client.odooCall<string>('sale.order', 'search'),
    ]);
    const c = await client.odooCall<string>('sale.order', 'search');
    assert.deepEqual([a, b, c], ['ok', 'ok', 'ok']);
    assert.equal(authCalls, 2); // 1 sesión inicial + 1 sola reautenticación compartida
  } finally {
    globalThis.fetch = originalFetch;
  }
});
