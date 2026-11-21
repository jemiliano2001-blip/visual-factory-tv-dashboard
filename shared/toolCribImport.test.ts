import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveDrawing } from './toolCribImport';

const d = (customer: 'KOHLER' | 'FISHER', rel: string) => deriveDrawing(customer, rel);

test('Kohler: el número de parte es la carpeta y el PDF con el mismo nombre es revisión A', () => {
  assert.deepEqual(d('KOHLER', '/69BR-80402/69BR-80402.pdf'), { partNumber: '69BR-80402', revision: 'A', confidence: 'alta', note: '' });
});

test('Kohler: sufijo -B es la revisión B', () => {
  const r = d('KOHLER', '/69FA-80005/69FA-80005-B.pdf');
  assert.equal(r.partNumber, '69FA-80005');
  assert.equal(r.revision, 'B');
});

test('Kohler: salta la carpeta contenedora genérica', () => {
  const r = d('KOHLER', '/numeros de parte de kolher 04-06-21/69SH-80003/69SH-80003 SMV-183.pdf');
  assert.equal(r.partNumber, '69SH-80003');
});

test('Kohler: copias "(2)" quedan con confianza media y nota', () => {
  const r = d('KOHLER', '/SMV-013/SMV013(2).pdf');
  assert.equal(r.partNumber, 'SMV-013');
  assert.equal(r.confidence, 'media');
  assert.match(r.note, /distinto nombre/);
});

test('Fisher: código E### desde la carpeta, con letra o sufijo LH/RH', () => {
  assert.equal(d('FISHER', '/E1011-WC TRACKS EST 350 GAGE 53 +-1MM/x.pdf').partNumber, 'E1011');
  assert.equal(d('FISHER', '/E453 LH y RH/E453 WCP55.PDF').partNumber, 'E453');
  assert.equal(d('FISHER', '/E761-RH/E761-RH.PDF').partNumber, 'E761-RH');
  assert.equal(d('FISHER', '/E683-E684/E683.PDF').partNumber, 'E683-E684');
  assert.equal(d('FISHER', '/E355R FINGERS RH LH/a.pdf').partNumber, 'E355R');
});

test('Fisher: ignora subcarpetas genéricas (dibujos originales) y usa la de arriba', () => {
  assert.equal(d('FISHER', '/E707/dibujos originales/E707.PDF').partNumber, 'E707');
});

test('Fisher: sin código E# cae al nombre de carpeta con confianza baja', () => {
  const r = d('FISHER', '/155711 - CLEVIS/155711_CATDRAWING-A.00.pdf');
  assert.equal(r.partNumber, '155711 - CLEVIS');
  assert.equal(r.confidence, 'baja');
});

test('PDF suelto en la raíz: usa el nombre del archivo, confianza baja', () => {
  const r = d('FISHER', '/E840.pdf');
  assert.equal(r.partNumber, 'E840');
  assert.equal(r.confidence, 'baja');
});

test('Fisher: carpeta ARCHIVO EDGAR se marca para revisar', () => {
  const r = d('FISHER', '/ARCHIVO EDGAR/AMVIL/SPRING MAKING MACHINE 3.PDF');
  assert.equal(r.confidence, 'baja');
  assert.match(r.note, /archivo/i);
});

test('acepta rutas con barra invertida de Windows', () => {
  assert.equal(d('KOHLER', ['', '69BU-80311', '69BU-80311.pdf'].join(String.fromCharCode(92))).partNumber, '69BU-80311');
});
