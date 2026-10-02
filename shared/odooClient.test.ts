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
