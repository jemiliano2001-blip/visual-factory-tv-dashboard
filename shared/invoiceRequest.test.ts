import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildInvoiceRequestEmail, sendInvoiceRequest, MAX_INVOICE_REQUEST_ORDERS,
  type InvoiceRequestOrder, type MailConfig,
} from './invoiceRequest';

const order = (over: Partial<InvoiceRequestOrder> = {}): InvoiceRequestOrder => ({
  name: 'S02176',
  customer_reference: '20264321',
  partner_name: 'Bosch <Querétaro>',
  lines: [
    { name: 'Flecha 12mm', qty: 10, delivered: 10, unit: 'Pza' },
    { name: 'Buje', qty: 5, delivered: 2, unit: 'Pza' },
  ],
  deliveries: [
    { name: 'WH/OUT/00042', state: 'done', date_done: '2026-11-05 15:30:00' },
    { name: 'WH/OUT/00050', state: 'assigned', date_done: null },
    { name: 'WH/OUT/00001', state: 'cancel', date_done: null },
  ],
  ...over,
});

const config: MailConfig = { from: 'jemiliano2001@gmail.com', to: 'ams@maquinadosvasquez.com', cc: 'jemiliano2001@gmail.com' };

test('correo de una orden: pide factura de esa SO con piezas y remisiones, sin canceladas', () => {
  const mail = buildInvoiceRequestEmail([order()]);
  assert.equal(mail.subject, 'Solicitud de factura: S02176');
  assert.match(mail.text, /Buen día/);
  assert.match(mail.text, /una factura para la S02176/);
  assert.match(mail.text, /PO 20264321/);
  assert.match(mail.text, /10 de 10 Pza.*Flecha 12mm/);
  assert.match(mail.text, /2 de 5 Pza.*Buje/);
  assert.match(mail.text, /WH\/OUT\/00042/);
  assert.doesNotMatch(mail.text, /WH\/OUT\/00001/);
});

test('varias órdenes: asunto y saludo en plural', () => {
  const mail = buildInvoiceRequestEmail([order(), order({ name: 'S02177' })]);
  assert.equal(mail.subject, 'Solicitud de facturas: S02176, S02177');
  assert.match(mail.text, /las siguientes órdenes/);
});

test('el HTML escapa los datos de Odoo', () => {
  const mail = buildInvoiceRequestEmail([order()]);
  assert.match(mail.html, /Bosch &lt;Querétaro&gt;/);
  assert.doesNotMatch(mail.html, /<Querétaro>/);
});

test('sin órdenes lanza', () => {
  assert.throws(() => buildInvoiceRequestEmail([]));
});

test('envía una vez con destinatario, copia y remitente configurados, tomando los datos de Odoo', async () => {
  const sent: Record<string, unknown>[] = [];
  const result = await sendInvoiceRequest({
    names: ['S02176'],
    orders: [order(), order({ name: 'S09999' })],
    config,
    transport: { sendMail: async (m) => { sent.push(m); } },
  });
  assert.deepEqual(result, { sent: ['S02176'] });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'ams@maquinadosvasquez.com');
  assert.equal(sent[0].cc, 'jemiliano2001@gmail.com');
  assert.equal(sent[0].from, 'jemiliano2001@gmail.com');
  assert.doesNotMatch(String(sent[0].text), /S09999/);
});

test('rechaza órdenes que no están en Odoo sin enviar nada', async () => {
  let calls = 0;
  await assert.rejects(
    sendInvoiceRequest({ names: ['S02176', 'S00000'], orders: [order()], config, transport: { sendMail: async () => { calls++; } } }),
    /S00000/,
  );
  assert.equal(calls, 0);
});

test('rechaza lista vacía, duplicados y exceso de órdenes', async () => {
  const transport = { sendMail: async () => { assert.fail('no debe enviar'); } };
  await assert.rejects(sendInvoiceRequest({ names: [], orders: [order()], config, transport }));
  await assert.rejects(sendInvoiceRequest({ names: ['S02176', 'S02176'], orders: [order()], config, transport }));
  const many = Array.from({ length: MAX_INVOICE_REQUEST_ORDERS + 1 }, (_, i) => `S${i}`);
  await assert.rejects(sendInvoiceRequest({ names: many, orders: many.map(n => order({ name: n })), config, transport }));
});
