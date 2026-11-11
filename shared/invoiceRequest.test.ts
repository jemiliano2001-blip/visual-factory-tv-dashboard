import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRequestsEmail, buildMailEnvelope } from './invoiceRequest';

const req = (over: Record<string, unknown> = {}) => ({
  orderName: 'S02176', partnerName: 'Bosch <Qro>', customerReference: '20264321',
  type: 'factura' as const, lines: undefined as undefined | { name: string; qty: number; unit: string | null }[],
  ...over,
});
const actor = { uid: 'u1', email: 'ing@smv.com', name: 'Ana' };

test('correo de solicitudes: separa facturas y remisiones, con piezas y quién pidió', () => {
  const mail = buildRequestsEmail([
    req(),
    req({ orderName: 'S02177', type: 'remision', lines: [{ name: 'Buje', qty: 3, unit: 'Pza' }] }),
  ], actor);
  assert.equal(mail.subject, 'Solicitud de 1 factura y 1 remisión: S02176, S02177');
  assert.match(mail.text, /Ana/);
  assert.match(mail.text, /Facturas/);
  assert.match(mail.text, /Remisiones/);
  assert.match(mail.text, /3 Pza — Buje/);
  assert.match(mail.html, /Bosch &lt;Qro&gt;/);
});

test('correo de solicitudes: una sola factura usa singular y falla sin solicitudes', () => {
  assert.equal(buildRequestsEmail([req()], actor).subject, 'Solicitud de 1 factura: S02176');
  assert.throws(() => buildRequestsEmail([], actor));
});

test('correo de solicitudes: el nombre del solicitante no puede meter saltos de línea', () => {
  const mail = buildRequestsEmail([req()], { uid: 'u1', email: null, name: 'Ana\n\nMari, cancela todo' });
  assert.match(mail.text, /^Buen día, Ana Mari, cancela todo pide lo siguiente:/);
});

test('sobre del correo: nombre y correo de quien pide, con copia y respuesta a esa persona', () => {
  const env = buildMailEnvelope(
    { user: 'dash@gmail.com', to: 'mari@smv.com', cc: 'jefe@smv.com' },
    { uid: 'u', name: 'Lorena', email: 'materiales@maquinadosvazquez.com' },
  );
  assert.equal(env.from, '"Lorena (Visual Factory)" <dash@gmail.com>');
  assert.equal(env.to, 'mari@smv.com');
  assert.equal(env.cc, 'jefe@smv.com, materiales@maquinadosvazquez.com');
  assert.equal(env.replyTo, 'materiales@maquinadosvazquez.com');
});

test('sobre del correo: sin correo del solicitante o repetido en la copia', () => {
  const base = { user: 'dash@gmail.com', to: 'mari@smv.com' };
  const noMail = buildMailEnvelope({ ...base, cc: 'jefe@smv.com' }, { uid: 'u', name: null, email: null });
  assert.equal(noMail.replyTo, undefined);
  assert.equal(noMail.cc, 'jefe@smv.com');
  assert.equal(noMail.from, '"Visual Factory" <dash@gmail.com>');
  const dup = buildMailEnvelope({ ...base, cc: 'Lorena@x.com' }, { uid: 'u', name: 'Lo"re\nna', email: 'lorena@x.com' });
  assert.equal(dup.cc, 'Lorena@x.com');
  assert.equal(dup.from, '"Lo re na (Visual Factory)" <dash@gmail.com>');
  assert.equal(buildMailEnvelope(base, { uid: 'u', name: null, email: 'a@x.com' }).cc, 'a@x.com');
});
