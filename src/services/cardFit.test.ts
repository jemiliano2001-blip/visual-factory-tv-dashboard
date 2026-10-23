import assert from 'node:assert/strict';
import test from 'node:test';
import { CARD_FIT_CLASSES, getCardFit, type CardFitTier } from './cardFit';

const TIERS: CardFitTier[] = ['xs', 'sm', 'md', 'lg', 'xl'];
const fit = (width: number, height: number, lineCount: number, extra: { hasReference?: boolean; showPartner?: boolean } = {}) =>
  getCardFit({ width, height, lineCount, hasReference: false, showPartner: false, ...extra });

test('S01840 (≈360×240, una partida): letra más grande y descripción con renglones de sobra', () => {
  const f = fit(360, 240, 1);
  assert.equal(f.tier, 'md');
  assert.ok(f.lineClamp >= 2);
  assert.equal(f.maxVisibleLines, 1);
});

test('el espacio que sobra después de la descripción muestra compromiso y remisiones', () => {
  const f = fit(360, 300, 1);
  assert.equal(f.showCommitment, true);
  assert.equal(f.showDeliveries, true);
});

test('tarjeta grande usa el escalón más grande', () => {
  assert.equal(fit(600, 450, 1).tier, 'xl');
});

test('tarjeta apretada baja a xs y aún muestra una partida', () => {
  const f = fit(200, 100, 1);
  assert.equal(f.tier, 'xs');
  assert.equal(f.maxVisibleLines, 1);
});

test('muchas partidas: solo las que caben enteras, sin bajar la letra', () => {
  const f = fit(360, 240, 8);
  assert.ok(f.maxVisibleLines >= 1 && f.maxVisibleLines < 8);
  assert.equal(f.lineClamp, 1);
  assert.equal(f.tier, fit(360, 240, 1).tier);
});

test('el escalón no depende de cuántas partidas trae la orden', () => {
  for (const [w, h] of [[360, 206], [443, 169], [346, 198]]) {
    assert.equal(fit(w, h, 1).tier, fit(w, h, 4, { hasReference: true }).tier, `${w}x${h}`);
  }
});

test('nunca pinta una partida cortada a la mitad: deja un renglón para "+N más"', () => {
  const f = fit(370, 125, 3);
  assert.equal(f.tier, 'xs');
  assert.equal(f.maxVisibleLines, 1);
  assert.equal(f.lineClamp, 1);
});

test('sin medir todavía (0×0) usa sm para no parpadear', () => {
  const f = fit(0, 0, 3);
  assert.equal(f.tier, 'sm');
  assert.equal(f.maxVisibleLines, 2);
});

test('PO y cliente ocupan renglón y pueden bajar el escalón', () => {
  assert.equal(fit(360, 190, 1).tier, 'md');
  assert.equal(fit(360, 190, 1, { hasReference: true, showPartner: true }).tier, 'sm');
});

test('a más altura con el mismo ancho, el escalón nunca baja', () => {
  let last = 0;
  for (let h = 60; h <= 700; h += 5) {
    const idx = TIERS.indexOf(fit(600, h, 2).tier);
    assert.ok(idx >= last, `bajó en altura ${h}`);
    last = idx;
  }
});

test('cada escalón define todas sus clases y el SO crece de xs a xl', () => {
  const keys = ['pad', 'heading', 'meta', 'line', 'qty', 'pct', 'small', 'icon', 'bar'];
  for (const tier of TIERS) assert.deepEqual(Object.keys(CARD_FIT_CLASSES[tier]).sort(), [...keys].sort());
  assert.deepEqual(TIERS.map(t => CARD_FIT_CLASSES[t].heading), ['text-sm', 'text-lg', 'text-2xl', 'text-3xl', 'text-4xl']);
});

test('si solo cabe un renglón, el "+N" va pegado a la cantidad', () => {
  const f = fit(370, 105, 3);
  assert.equal(f.maxVisibleLines, 1);
  assert.equal(f.moreInline, true);
  assert.equal(fit(370, 125, 3).moreInline, false);
});

test('tarjetas del mismo tamaño usan el mismo escalón, tengan PO o no', () => {
  assert.equal(fit(443, 169, 1).tier, fit(443, 169, 1, { hasReference: true }).tier);
});

test('descripción corta: no reserva renglones que no usa y muestra la fecha compromiso', () => {
  const f = getCardFit({ width: 360, height: 213, lineCount: 1, hasReference: false, showPartner: false, longestLineChars: 30 });
  assert.equal(f.lineClamp, 1);
  assert.equal(f.showCommitment, true);
});

test('descripción larga: sí usa los renglones de sobra', () => {
  const f = getCardFit({ width: 360, height: 213, lineCount: 1, hasReference: false, showPartner: false, longestLineChars: 60 });
  assert.equal(f.lineClamp, 2);
});
