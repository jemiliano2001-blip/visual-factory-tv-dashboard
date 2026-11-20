import test from 'node:test';
import assert from 'node:assert/strict';
import { getActiveHoliday, holidayGreeting, parseHolidayOverride, HOLIDAYS } from './holidayTheme';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12);
const id = (date: Date) => getActiveHoliday(date)?.id ?? null;

test('fuera de ventana no hay festivo', () => {
  assert.equal(id(d(2026, 11, 20)), null);
  assert.equal(id(d(2026, 11, 30)), null);
  assert.equal(id(d(2027, 1, 7)), null);
  assert.equal(id(d(2027, 2, 15)), null);
  assert.equal(id(d(2027, 5, 11)), null);
});

test('bordes de cada ventana', () => {
  assert.equal(id(d(2026, 12, 1)), 'navidad');
  assert.equal(id(d(2026, 12, 26)), 'navidad');
  assert.equal(id(d(2026, 12, 27)), 'anio-nuevo');
  assert.equal(id(d(2027, 1, 2)), 'anio-nuevo');
  assert.equal(id(d(2027, 1, 3)), 'reyes');
  assert.equal(id(d(2027, 1, 6)), 'reyes');
  assert.equal(id(d(2027, 2, 10)), 'san-valentin');
  assert.equal(id(d(2027, 2, 14)), 'san-valentin');
  assert.equal(id(d(2027, 5, 6)), 'madres');
  assert.equal(id(d(2027, 5, 10)), 'madres');
});

test('el saludo de Año Nuevo usa el año que entra', () => {
  const theme = HOLIDAYS.find(h => h.id === 'anio-nuevo')!;
  assert.equal(holidayGreeting(theme, d(2026, 12, 31)), '¡Feliz Año 2027!');
  assert.equal(holidayGreeting(theme, d(2027, 1, 1)), '¡Feliz Año 2027!');
});

test('override ?festivo= acepta solo ids válidos', () => {
  assert.equal(parseHolidayOverride('?festivo=navidad')?.id, 'navidad');
  assert.equal(parseHolidayOverride('?festivo=nada'), null);
  assert.equal(parseHolidayOverride(''), null);
});

test('cada festivo tiene garland y scene y Año Nuevo usa confeti', () => {
  for (const h of HOLIDAYS) {
    assert.ok(h.garland);
    assert.ok(h.scene);
  }
  const anioNuevo = HOLIDAYS.find(h => h.id === 'anio-nuevo')!;
  assert.equal(anioNuevo.particle, 'confeti');
});
