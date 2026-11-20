import assert from 'node:assert/strict';
import test from 'node:test';
import { format } from 'date-fns';
import { formatDataFreshness, STALE_THRESHOLD_MS } from './dataFreshness';

test('devuelve null para valores vacios o fechas invalidas', () => {
  assert.equal(formatDataFreshness(null, 1_000_000), null);
  assert.equal(formatDataFreshness(undefined, 1_000_000), null);
  assert.equal(formatDataFreshness('', 1_000_000), null);
  assert.equal(formatDataFreshness('no-es-una-fecha', 1_000_000), null);
});

test('formatea reloj, edad relativa reciente y no marca obsoleto antes de 10 min', () => {
  const base = new Date(2026, 10, 19, 10, 30, 0).getTime();
  const iso = new Date(base).toISOString();
  const expectedClock = format(new Date(base), 'HH:mm');

  // Desfase de reloj hacia el futuro se acota a 0
  const future = formatDataFreshness(iso, base - 5_000);
  assert.deepEqual(future, { clock: expectedClock, relative: 'ahora', stale: false, ageMs: 0 });

  const justNow = formatDataFreshness(iso, base + 59_000);
  assert.equal(justNow?.relative, 'ahora');
  assert.equal(justNow?.stale, false);

  const oneMin = formatDataFreshness(iso, base + 60_000);
  assert.equal(oneMin?.relative, 'hace 1 min');
  assert.equal(oneMin?.stale, false);

  const almostStale = formatDataFreshness(iso, base + STALE_THRESHOLD_MS - 1);
  assert.equal(almostStale?.relative, 'hace 9 min');
  assert.equal(almostStale?.stale, false);
});

test('marca stale exactamente desde 10 minutos y formatea horas y dias', () => {
  const base = Date.UTC(2026, 10, 19, 12, 0, 0);
  const iso = new Date(base).toISOString();

  const atTenMin = formatDataFreshness(iso, base + STALE_THRESHOLD_MS);
  assert.equal(atTenMin?.relative, 'hace 10 min');
  assert.equal(atTenMin?.stale, true);

  const oneHourFive = formatDataFreshness(iso, base + 65 * 60_000);
  assert.equal(oneHourFive?.relative, 'hace 1 h');
  assert.equal(oneHourFive?.stale, true);

  const threeHours = formatDataFreshness(iso, base + 3 * 60 * 60_000);
  assert.equal(threeHours?.relative, 'hace 3 h');

  const oneDay = formatDataFreshness(iso, base + 25 * 60 * 60_000);
  assert.equal(oneDay?.relative, 'hace 1 día');

  const twoDays = formatDataFreshness(iso, base + 49 * 60 * 60_000);
  assert.equal(twoDays?.relative, 'hace 2 días');
});
