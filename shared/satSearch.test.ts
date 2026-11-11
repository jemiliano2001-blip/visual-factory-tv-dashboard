import assert from 'node:assert/strict';
import test from 'node:test';
import { SAT_CATALOG } from './satCatalogData';
import { satChoicesFor, suggestSatCandidates, type SatCatalog } from './satSearch';

const FAKE: SatCatalog = [
  ['27131703', 'Pistones de cilindro neumático'],
  ['27131500', 'Herramientas neumáticas'],
  ['73181900', 'Servicios de soldadura'],
  ['24141500', 'Suministros para seguridad y protección'],
  ['23152206', 'Protección de barrera'],
  ['31161500', 'Tornillos'],
];

test('busca por palabra específica sin acentos ni plural', () => {
  assert.equal(suggestSatCandidates('Cilindros neumáticos 40 mm', FAKE)[0].code, '27131703');
});

test('una palabra genérica sola no sugiere nada', () => {
  assert.deepEqual(suggestSatCandidates('Servicio', FAKE), []);
  assert.deepEqual(suggestSatCandidates('Herramientas', FAKE), []);
});

test('descripción vacía o solo medidas devuelve []', () => {
  for (const d of ['', '   ', '12 mm', '3/8', '1.5']) assert.deepEqual(suggestSatCandidates(d, FAKE), []);
});

test('respeta el límite y no repite claves', () => {
  assert.equal(suggestSatCandidates('protección barrera seguridad', FAKE, 1).length, 1);
  const r = suggestSatCandidates('protección barrera seguridad', FAKE);
  assert.ok(r.length <= 3);
  assert.equal(new Set(r.map(c => c.code)).size, r.length);
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].score >= r[i].score);
});

test('descripción enorme se acota', () => {
  const t0 = performance.now();
  const r = suggestSatCandidates('placa '.repeat(700), SAT_CATALOG);
  assert.ok(Array.isArray(r));
  assert.ok(performance.now() - t0 < 200);
});

test('satChoicesFor: la lista de Mary gana y no pide candidatas', () => {
  assert.deepEqual(satChoicesFor('Fixture estación 2', FAKE), { suggested: '23153000', candidates: [] });
});

test('satChoicesFor: sin lista de Mary y con catálogo devuelve candidatas', () => {
  const r = satChoicesFor('Barrera de protección', FAKE);
  assert.equal(r.suggested, null);
  assert.equal(r.candidates[0].code, '23152206');
});

test('satChoicesFor: sin catálogo', () => {
  assert.deepEqual(satChoicesFor('Barrera de protección', null), { suggested: null, candidates: [] });
});

test('integración con el catálogo real', () => {
  const codes = suggestSatCandidates('Reparación de componentes de maquinaria', SAT_CATALOG).map(c => c.code);
  assert.ok(codes.includes('72151802'), codes.join(','));
});
