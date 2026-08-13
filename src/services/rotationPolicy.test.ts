import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_ROTATION_PAUSED, shouldAutoRotate } from './rotationPolicy';

test('la pausa no sobrevive la recarga: el estado inicial siempre es activo', () => {
  assert.equal(INITIAL_ROTATION_PAUSED, false);
});

test('la rotacion solo avanza cuando la TV tiene mas de una pagina y no esta pausada', () => {
  assert.equal(shouldAutoRotate({ isTVMode: true, pageCount: 2, highlightedOrder: false, paused: false }), true);
  assert.equal(shouldAutoRotate({ isTVMode: true, pageCount: 2, highlightedOrder: false, paused: true }), false);
  assert.equal(shouldAutoRotate({ isTVMode: true, pageCount: 1, highlightedOrder: false, paused: false }), false);
  assert.equal(shouldAutoRotate({ isTVMode: true, pageCount: 2, highlightedOrder: true, paused: false }), false);
});
