import assert from 'node:assert/strict';
import test from 'node:test';
import { computeTVGrid } from './tvGrid';

// Tamaños medidos del área de la rejilla (sin encabezado ni pie) en el navegador.
test('1920×1080 (rejilla 1864×877): 5×4 = 20 tarjetas con SO de 24 px', () => {
  const g = computeTVGrid({ width: 1864, height: 877, isTVMode: true });
  assert.equal(g.cols, 5);
  assert.equal(g.rows, 4);
  assert.equal(g.ordersPerPage, 20);
});

test('pantallas chicas nunca devuelven 0 columnas ni 0 filas', () => {
  const hd = computeTVGrid({ width: 1224, height: 519, isTVMode: true });
  assert.equal(hd.cols, 3);
  assert.equal(hd.rows, 2);
  const tiny = computeTVGrid({ width: 300, height: 150, isTVMode: true });
  assert.equal(tiny.cols, 1);
  assert.equal(tiny.rows, 1);
  assert.equal(tiny.ordersPerPage, 1);
});

test('modo escritorio conserva columnas por breakpoint y sin paginación', () => {
  const g = computeTVGrid({ width: 1864, height: 877, isTVMode: false });
  assert.equal(g.cols, 5);
  assert.equal(g.ordersPerPage, 999);
  assert.ok(g.rows >= 4);
});

test('nunca más de 6 columnas aunque la pantalla sea enorme', () => {
  assert.equal(computeTVGrid({ width: 3784, height: 1900, isTVMode: true }).cols, 6);
});
