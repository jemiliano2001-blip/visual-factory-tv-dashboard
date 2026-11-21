import assert from 'node:assert/strict';
import test from 'node:test';
import type { DrawingResolution, DrawingView } from './toolCribMatching';
import { DEFAULT_COPIES, formatPrintedLabel, printStateForLine } from './toolCribPrint';
import { buildPrintedIndex } from './toolCribPrintIndex';

const view = (over: Partial<DrawingView> = {}): DrawingView => ({
  partId: 'p1', partNumber: 'AB-100', customer: 'SUPRAJIT', description: '', drawingId: 'd1',
  revision: 'A', sourcePath: '', pdfUrl: 'https://x/y.pdf', ...over,
});
const match = (v: DrawingView): DrawingResolution => ({ kind: 'match', view: v, via: 'exact', score: 95 });
const log = { id: 'l', drawingId: 'd1', partId: 'p1', copies: 2, orderRef: '2026/S01992', printedByUid: 'u1', printedAtUTC: '2026-11-20T12:00:00.000Z' };

test('DEFAULT_COPIES es 2', () => assert.equal(DEFAULT_COPIES, 2));

test('printStateForLine: sin log y con PDF queda lista', () => {
  assert.deepEqual(printStateForLine(match(view()), new Map(), '2026/S01992'), { kind: 'ready' });
});

test('printStateForLine: con log de esa SO y parte queda impresa', () => {
  const s = printStateForLine(match(view()), buildPrintedIndex([log]), '2026/S01992');
  assert.deepEqual(s, { kind: 'printed', at: '2026-11-20T12:00:00.000Z', byUid: 'u1', count: 1 });
});

test('printStateForLine: el log de otra SO no cuenta', () => {
  const s = printStateForLine(match(view()), buildPrintedIndex([{ ...log, orderRef: '2026/S09999' }]), '2026/S01992');
  assert.equal(s.kind, 'ready');
});

test('printStateForLine: plano sin pdfUrl no es imprimible aunque haya log', () => {
  const s = printStateForLine(match(view({ pdfUrl: null })), buildPrintedIndex([log]), '2026/S01992');
  assert.equal(s.kind, 'no-pdf');
});

test('printStateForLine: ambigua y sin plano', () => {
  assert.equal(printStateForLine({ kind: 'ambiguous', candidates: [view()] }, new Map(), 'x').kind, 'ambiguous');
  assert.equal(printStateForLine({ kind: 'none' }, new Map(), 'x').kind, 'none');
});

test('formatPrintedLabel: fecha, "tú" y número de veces', () => {
  const base = { kind: 'printed' as const, at: '2026-11-21T12:00:00.000Z', byUid: 'u1', count: 1 };
  assert.equal(formatPrintedLabel(base, 'u2'), 'Impreso 21 nov');
  assert.equal(formatPrintedLabel(base, 'u1'), 'Impreso 21 nov · tú');
  assert.equal(formatPrintedLabel({ ...base, count: 3 }, 'u1'), 'Impreso 21 nov · tú (×3)');
  assert.equal(formatPrintedLabel({ ...base, at: null }, null), 'Impreso');
});
