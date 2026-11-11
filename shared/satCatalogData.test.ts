import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import test from 'node:test';
import { SAT_CATALOG, SAT_CATALOG_VERSION } from './satCatalogData';
import { SAT_OHD_CATALOG } from './satOhd';

const DIVISIONES = ['23', '24', '26', '27', '30', '31', '32', '39', '40', '41', '43', '56', '72', '73', '81'];

test('catálogo SAT recortado: claves de 8 dígitos, únicas y de las divisiones esperadas', () => {
  const codes = SAT_CATALOG.map(([c]) => c);
  assert.ok(codes.every(c => /^\d{8}$/.test(c)));
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.every(c => DIVISIONES.includes(c.slice(0, 2))));
  assert.equal(SAT_CATALOG.length, 12152);
  assert.ok(SAT_CATALOG_VERSION.startsWith('phpcfdi-'));
});

test('catálogo SAT recortado: contiene todas las claves de la lista de OHD', () => {
  const codes = new Set(SAT_CATALOG.map(([c]) => c));
  for (const k of SAT_OHD_CATALOG) assert.ok(codes.has(k.code), `falta ${k.code}`);
  assert.ok(SAT_CATALOG.some(([c, n]) => c === '23152206' && n === 'Protección de barrera'));
});

test('catálogo SAT recortado: pesa menos de 800 KB', () => {
  assert.ok(statSync(new URL('./satCatalogData.ts', import.meta.url)).size < 800 * 1024);
});
