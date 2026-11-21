import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBirthdayConfig, isBirthdayToday, buildBirthdayTheme, parseBirthdayForced } from './birthdayTheme';

test('parseBirthdayConfig acepta solo nombre, mes y día válidos', () => {
  assert.deepEqual(parseBirthdayConfig({ nombre: ' Ana ', mes: 1, dia: 3 }), { name: 'Ana', month: 1, day: 3 });
  assert.equal(parseBirthdayConfig({ nombre: '', mes: 1, dia: 3 }), null);
  assert.equal(parseBirthdayConfig({ nombre: 'Ana', mes: 13, dia: 3 }), null);
  assert.equal(parseBirthdayConfig({ nombre: 'Ana', mes: 1, dia: 32 }), null);
  assert.equal(parseBirthdayConfig({ nombre: 'Ana', mes: '1', dia: 3 }), null);
  assert.equal(parseBirthdayConfig(null), null);
  assert.equal(parseBirthdayConfig('<html>'), null);
});

test('el nombre se recorta a 40 caracteres', () => {
  const cfg = parseBirthdayConfig({ nombre: 'x'.repeat(80), mes: 5, dia: 5 });
  assert.equal(cfg?.name.length, 40);
});

test('isBirthdayToday compara mes y día locales', () => {
  const cfg = { name: 'Ana', month: 1, day: 3 };
  assert.equal(isBirthdayToday(cfg, new Date(2027, 0, 3, 8)), true);
  assert.equal(isBirthdayToday(cfg, new Date(2027, 0, 2, 23, 59)), false);
  assert.equal(isBirthdayToday(cfg, new Date(2027, 0, 4)), false);
});

test('buildBirthdayTheme arma un tema completo con el nombre en el saludo', () => {
  const t = buildBirthdayTheme({ name: 'Ana', month: 1, day: 3 });
  assert.equal(t.id, 'cumple');
  assert.equal(t.greeting, '¡Feliz cumpleaños, Ana!');
  assert.equal(t.scene, 'cumple');
  assert.ok(t.garland && t.particle && t.icon && t.palette.top.length > 0);
});

test('parseBirthdayForced detecta ?festivo=cumple', () => {
  assert.equal(parseBirthdayForced('?festivo=cumple'), true);
  assert.equal(parseBirthdayForced('?festivo=navidad'), false);
  assert.equal(parseBirthdayForced(''), false);
});
