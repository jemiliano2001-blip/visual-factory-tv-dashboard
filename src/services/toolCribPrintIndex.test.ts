import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPrintedIndex, type PrintLog } from './toolCribPrintIndex';

const log = (over: Partial<PrintLog>): PrintLog => ({
  id: 'l', drawingId: 'd', partId: 'p1', copies: 2, orderRef: '2026/S01992',
  printedByUid: 'u1', printedAtUTC: '2026-11-20T10:00:00.000Z', ...over,
});

test('buildPrintedIndex junta logs de la misma SO y parte con el más reciente', () => {
  const idx = buildPrintedIndex([
    log({ id: 'a', printedAtUTC: '2026-11-20T10:00:00.000Z', printedByUid: 'u1' }),
    log({ id: 'b', printedAtUTC: '2026-11-21T09:00:00.000Z', printedByUid: 'u2' }),
  ]);
  assert.deepEqual(idx.get('2026/S01992|p1'), { printedAtUTC: '2026-11-21T09:00:00.000Z', printedByUid: 'u2', count: 2 });
});

test('buildPrintedIndex ignora logs sin orderRef y no mezcla SO distintas', () => {
  const idx = buildPrintedIndex([
    log({ orderRef: null }),
    log({ orderRef: '2026/S02000' }),
  ]);
  assert.equal(idx.size, 1);
  assert.equal(idx.has('2026/S02000|p1'), true);
});
