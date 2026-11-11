import test from 'node:test';
import assert from 'node:assert/strict';
import { SAT_OHD_CATALOG, isOhdPartner, isSatOhdCode, suggestSatOhdCode } from './satOhd.ts';

test('catálogo OHD: claves de 8 dígitos y sin repetir', () => {
  const codes = SAT_OHD_CATALOG.map(k => k.code);
  assert.ok(codes.every(c => /^\d{8}$/.test(c)));
  assert.equal(new Set(codes).size, codes.length);
  assert.equal(isSatOhdCode('31391500'), true);
  assert.equal(isSatOhdCode('99999999'), false);
  assert.equal(isSatOhdCode(31391500), false);
});

test('OHD se reconoce por nombre, sin confundir otros clientes', () => {
  assert.equal(isOhdPartner('OHD OPERATORS DE MEXICO'), true);
  assert.equal(isOhdPartner('Overhead Door Corporation'), true);
  assert.equal(isOhdPartner('JOHDSON CONTROLS'), false);
  assert.equal(isOhdPartner('Bosch'), false);
});

test('sugerencia: sin acentos ni mayúsculas, plural y frase más larga gana', () => {
  assert.equal(suggestSatOhdCode('Fixture de sujeción para estación 3'), '23153000');
  assert.equal(suggestSatOhdCode('Troqueles para doblez'), '23251800');
  assert.equal(suggestSatOhdCode('Reparación de cilindro'), '72151802');
  assert.equal(suggestSatOhdCode('Placa de acero 1/2"'), '23153035');
  assert.equal(suggestSatOhdCode('Fab. y dis. de placa de aluminio'), '31391705');
  assert.equal(suggestSatOhdCode('Programación estación 5'), '32151700');
});

test('sugerencia: empate entre claves o sin coincidencia no sugiere', () => {
  assert.equal(suggestSatOhdCode('Polytech 40 mm'), null); // 4 claves distintas
  assert.equal(suggestSatOhdCode('Punzón 3 mm'), null); // troqueles vs. herramientas de corte
  assert.equal(suggestSatOhdCode('Buje bronce'), null);
  assert.equal(suggestSatOhdCode('Topete'), '31391500'); // "TOPE" al inicio de palabra
  assert.equal(suggestSatOhdCode('Estopero'), null); // "TOPE" dentro de palabra no cuenta
});
