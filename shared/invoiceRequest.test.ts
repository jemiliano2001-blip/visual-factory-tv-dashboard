import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRequestsEmail, buildMailEnvelope, shortenDescription } from './invoiceRequest';

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
  assert.match(mail.text, /S02176 — Bosch <Qro> \(PO 20264321\)/);
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

test('correo de solicitudes: OHD lleva la clave SAT por partida', () => {
  const mail = buildRequestsEmail([
    req({ partnerName: 'OHD OPERATORS', satKeys: [{ lineId: 1, name: 'Fixture', code: '23153000' }] }),
    req({ orderName: 'S02177', type: 'remision', lines: [{ lineId: 5, name: 'Placa', qty: 2, unit: 'Pza' }], satKeys: [{ lineId: 5, name: 'Placa', code: '23153035' }] }),
  ], actor);
  assert.match(mail.text, /Fixture — Clave SAT 23153000/);
  assert.match(mail.text, /2 Pza — Placa — Clave SAT 23153035/);
  assert.match(mail.html, /Clave SAT 23153035/);
});

test('shortenDescription: quita la lista de "Incluye", corta en palabra y deja lo corto intacto', () => {
  const largo = 'Integración de luces de estado en línea SX en estación 10, 11 y 12 Fabricación de bases para luces indicadoras, cableado y programación de luces a secuencia de PLC y HMI. Incluye: * Luces de estado * Caja botonera';
  const corto = shortenDescription(largo);
  assert.ok(corto.length <= 91);
  assert.ok(corto.endsWith('…'));
  assert.ok(!/Incluye|Caja botonera/.test(corto));
  assert.equal(corto, 'Integración de luces de estado en línea SX en estación 10, 11 y 12 Fabricación de bases…');
  assert.equal(shortenDescription('Pin de remache WCD01-1745-102 (wescon)'), 'Pin de remache WCD01-1745-102 (wescon)');
  assert.equal(shortenDescription('<p>Placa  de\n acero</p>'), 'Placa de acero');
  assert.equal(shortenDescription('Incluye: tornillos'), 'Incluye: tornillos');
});

test('correo de solicitudes: la descripción larga sale resumida', () => {
  const largo = 'Integración de luces de estado en línea SX en estación 10, 11 y 12 Fabricación de bases para luces indicadoras, cableado y programación de luces a secuencia de PLC y HMI. Incluye: * Luces de estado * Caja botonera';
  const mail = buildRequestsEmail([req({ satKeys: [{ lineId: 1, name: largo, code: '32151900' }] })], actor);
  assert.match(mail.text, /Fabricación de bases… — Clave SAT 32151900/);
  assert.doesNotMatch(mail.text, /Caja botonera/);
});

test('correo: clave fuera de la lista lleva la marca; de la lista o sin inList no', () => {
  const mk = (inList?: boolean) => buildRequestsEmail([{
    orderName: 'S1', partnerName: 'OHD', customerReference: null, type: 'factura',
    satKeys: [{ lineId: 1, name: 'Guarda', code: '23152206', ...(inList === undefined ? {} : { inList }) }],
  }], { email: null, name: 'Ana', uid: 'u' });
  const fuera = mk(false);
  assert.match(fuera.text, /Clave SAT 23152206 \(fuera de la lista de OHD, validar\)/);
  assert.match(fuera.html, /Clave SAT 23152206 \(fuera de la lista de OHD, validar\)/);
  for (const m of [mk(true), mk()]) assert.doesNotMatch(m.text, /fuera de la lista/);
});
