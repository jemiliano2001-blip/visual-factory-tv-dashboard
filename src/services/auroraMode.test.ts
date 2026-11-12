import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuroraUrgent, nextAuroraMode, normalizeAuroraMode } from './auroraMode';

test('el botón recorre los tres modos y vuelve al primero', () => {
  assert.equal(nextAuroraMode('gemini-flow'), 'gemini-reactive');
  assert.equal(nextAuroraMode('gemini-reactive'), 'oled-minimal');
  assert.equal(nextAuroraMode('oled-minimal'), 'gemini-flow');
});

test('un valor guardado desconocido cae al modo por defecto', () => {
  assert.equal(normalizeAuroraMode('oled-minimal'), 'oled-minimal');
  assert.equal(normalizeAuroraMode('rojo'), 'gemini-flow');
  assert.equal(normalizeAuroraMode(true), 'gemini-flow');
  assert.equal(normalizeAuroraMode(null), 'gemini-flow');
});

test('la urgencia solo aplica en modo reactivo con más de la mitad vencida', () => {
  assert.equal(isAuroraUrgent('gemini-reactive', 0.51), true);
  assert.equal(isAuroraUrgent('gemini-reactive', 0.5), false);
  assert.equal(isAuroraUrgent('gemini-flow', 1), false);
  assert.equal(isAuroraUrgent('oled-minimal', 1), false);
});
