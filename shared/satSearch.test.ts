import assert from 'node:assert/strict';
import test from 'node:test';
import { SAT_CATALOG } from './satCatalogData';
import { rankMaryCandidates, suggestSatOhdCode } from './satOhd';
import { SAT_OFFICIAL_BLOCKLIST, satChoicesFor, suggestSatCandidates, type SatCatalog } from './satSearch';

const FAKE: SatCatalog = [
  ['27131703', 'Pistones de cilindro neumático'],
  ['27131500', 'Herramientas neumáticas'],
  ['73181900', 'Servicios de soldadura'],
  ['24141500', 'Suministros para seguridad y protección'],
  ['23152206', 'Protección de barrera'],
  ['31161500', 'Tornillos'],
  ['15101505', 'Gasolina'],
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
  suggestSatCandidates('placa', SAT_CATALOG);
  const t0 = performance.now();
  const r = suggestSatCandidates('placa '.repeat(700), SAT_CATALOG);
  assert.ok(Array.isArray(r));
  assert.ok(performance.now() - t0 < 1500);
});

test('satChoicesFor: la lista de Mary gana y no pide oficiales', () => {
  const r = satChoicesFor('Fixture estación 2', FAKE);
  assert.equal(r.suggested, '23153000');
  assert.ok(r.maryCandidates.some(c => c.code === '23153000'));
  assert.deepEqual(r.officialCandidates, []);
});

test('satChoicesFor: sin Mary y con catálogo devuelve oficiales', () => {
  const r = satChoicesFor('Cilindros neumáticos 40 mm', FAKE);
  // "neumático" puede no estar en Mary; si Mary pega, official vacío — exigir al menos una vía
  if (r.maryCandidates.length === 0) {
    assert.equal(r.suggested, null);
    assert.equal(r.officialCandidates[0]?.code, '27131703');
  } else {
    assert.deepEqual(r.officialCandidates, []);
  }
});

test('satChoicesFor: sin catálogo solo Mary', () => {
  const r = satChoicesFor('Barrera de protección', null);
  assert.equal(r.officialCandidates.length, 0);
  assert.ok(r.maryCandidates.length >= 1);
});

test('POLYTECH: candidatas Mary, sin suggested ni spill oficial', () => {
  const r = satChoicesFor('Polytech 40 mm', FAKE);
  assert.equal(r.suggested, null);
  assert.ok(r.maryCandidates.length >= 2);
  assert.deepEqual(r.officialCandidates, []);
});

test('retrabajo de tanques: Mary gana; oficiales no traen petróleo', () => {
  const r = satChoicesFor('RETRABAJO DE TANQUES', SAT_CATALOG);
  assert.ok(r.maryCandidates.some(c => c.code === '73152100'));
  assert.equal(suggestSatOhdCode('RETRABAJO DE TANQUES'), '73152100');
  for (const c of r.officialCandidates) {
    assert.equal(SAT_OFFICIAL_BLOCKLIST.some(t => c.name.toUpperCase().includes(t)), false);
  }
  // Con Mary presente, official debe ir vacío
  assert.deepEqual(r.officialCandidates, []);
});

test('blocklist: gasolina no sale si la descripción no habla de petróleo', () => {
  const r = suggestSatCandidates('tanque de almacenamiento industrial', FAKE);
  assert.equal(r.some(c => c.code === '15101505'), false);
});

test('integración con el catálogo real', () => {
  const codes = suggestSatCandidates('Reparación de componentes de maquinaria', SAT_CATALOG).map(c => c.code);
  assert.ok(codes.includes('72151802'), codes.join(','));
});

test('rankMaryCandidates respeta el mínimo', () => {
  assert.ok(rankMaryCandidates('Fixture').every(c => c.score >= 4));
});
