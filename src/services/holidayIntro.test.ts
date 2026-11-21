import test from 'node:test';
import assert from 'node:assert/strict';
import { localDateKey, introStorageKey, shouldShowIntro } from './holidayIntro';

test('localDateKey formatea YYYY-MM-DD en hora local con ceros', () => {
  assert.equal(localDateKey(new Date(2026, 11, 5)), '2026-12-05');
});

test('introStorageKey arma la clave por festivo y fecha local', () => {
  assert.equal(
    introStorageKey('navidad', new Date(2026, 11, 5)),
    'vftv:festivo:visto:navidad:2026-12-05'
  );
  assert.notEqual(
    introStorageKey('anio-nuevo', new Date(2026, 11, 31)),
    introStorageKey('anio-nuevo', new Date(2027, 0, 1))
  );
});

test('shouldShowIntro respeta visto, forced y reducedMotion', () => {
  assert.equal(shouldShowIntro({ stored: null, forced: false, reducedMotion: false }), true);
  assert.equal(shouldShowIntro({ stored: '1', forced: false, reducedMotion: false }), false);
  assert.equal(shouldShowIntro({ stored: '1', forced: true, reducedMotion: false }), true);
  assert.equal(shouldShowIntro({ stored: null, forced: true, reducedMotion: true }), false);
});

test('el saludo de cumpleaños cambia de clave cada hora; los demás festivos, solo por día', () => {
  const a = new Date(2027, 0, 3, 9, 5);
  const b = new Date(2027, 0, 3, 10, 5);
  assert.notEqual(introStorageKey('cumple', a), introStorageKey('cumple', b));
  assert.equal(introStorageKey('reyes', a), introStorageKey('reyes', b));
});
