import assert from 'node:assert/strict';
import test from 'node:test';
import type { OdooSaleOrder } from './odoo';
import { collectToolCribLines, type ToolCribLine } from './toolCrib';
import { normalizeAliasKey, resolveLineDrawing, type DrawingView, type PartAlias } from './toolCribMatching';

function lineOf(name: string): ToolCribLine {
  const order = {
    id: 1, name: '2026/S01992', customer_reference: null, partner_name: 'SUPRAJIT MEXICO',
    main_product: name, date_order: new Date().toISOString(), commitment_date: null,
    invoice_status: 'to invoice', currency: 'MXN', qty_total: 5, qty_delivered: 0, state: 'sale',
    salesperson: null, lines_count: 1, lines: [{ name, qty: 5, delivered: 0 }], deliveries: [], note: null,
  } as OdooSaleOrder;
  return collectToolCribLines([order])[0];
}

function view(partNumber: string, extra: Partial<DrawingView> = {}): DrawingView {
  return {
    partId: `p-${partNumber}`, partNumber, customer: 'SUPRAJIT', description: '',
    drawingId: `d-${partNumber}`, revision: 'A', sourcePath: '', pdfUrl: 'https://x/y.pdf', ...extra,
  };
}

test('normalizeAliasKey quita acentos, símbolos y espacios sobrantes', () => {
  assert.equal(normalizeAliasKey('  áb-1/2  x '), 'AB-1/2 X');
});

test('número de parte exacto liga el plano', () => {
  const r = resolveLineDrawing(lineOf('[ABC-123] Buje'), [view('ABC-123')], []);
  assert.equal(r.kind, 'match');
  if (r.kind === 'match') {
    assert.equal(r.via, 'exact');
    assert.equal(r.view.partNumber, 'ABC-123');
  }
});

test('identificadores distintos se vetan aunque compartan prefijo', () => {
  const r = resolveLineDrawing(lineOf('[90-1012-05] Eje'), [view('90-1012-06')], []);
  assert.equal(r.kind, 'none');
});

test('alias liga el plano indicado', () => {
  const alias: PartAlias = { id: 'a1', pattern: 'ZZ-9', partNumber: 'OTRO-777', drawingId: 'd1' };
  const r = resolveLineDrawing(lineOf('[ZZ-9] Eje especial'), [view('OTRO-777', { drawingId: 'd1' })], [alias]);
  assert.equal(r.kind, 'match');
  if (r.kind === 'match') assert.equal(r.via, 'alias');
});

test('alias a un plano que ya no está en la biblioteca da none, sin error', () => {
  const alias: PartAlias = { id: 'a1', pattern: 'ZZ-9', partNumber: 'OTRO-777', drawingId: 'borrado' };
  const r = resolveLineDrawing(lineOf('[ZZ-9] Eje especial'), [view('OTRO-777')], [alias]);
  assert.equal(r.kind, 'none');
});

test('parecido por descripción liga con puntaje >= 80', () => {
  const lib = [view('BUJE-BRONCE', { description: 'BUJE BRONCE SAE 660' })];
  const r = resolveLineDrawing(lineOf('Buje de bronce SAE 660'), lib, []);
  assert.equal(r.kind, 'match');
  if (r.kind === 'match') {
    assert.equal(r.via, 'fuzzy');
    assert.ok(r.score >= 80);
  }
  const otra = resolveLineDrawing(lineOf('Buje de bronce SAE 660'), [view('TORNILLO', { description: 'TORNILLO ACERO INOXIDABLE' })], []);
  assert.equal(otra.kind, 'none');
});

test('ISO gana sobre CAD cuando ambos pasan el umbral', () => {
  const lib = [view('ABC-123'), view('ABC-123.iso')];
  const r = resolveLineDrawing(lineOf('[ABC-123] Buje'), lib, []);
  assert.equal(r.kind, 'match');
  if (r.kind === 'match') assert.equal(r.view.partNumber, 'ABC-123.iso');
});

test('dos partes distintas con el mismo puntaje quedan ambiguas', () => {
  const a = view('AB-100', { partId: 'pa', drawingId: 'da' });
  const b = view('AB-100', { partId: 'pb', drawingId: 'db' });
  const r = resolveLineDrawing(lineOf('[AB-100] Eje'), [a, b], []);
  assert.equal(r.kind, 'ambiguous');
  if (r.kind === 'ambiguous') assert.deepEqual(r.candidates.map(c => c.partId).sort(), ['pa', 'pb']);
});

test('dos revisiones de la misma parte no son empate: gana la mayor', () => {
  const a = view('AB-100', { drawingId: 'd1', revision: 'A' });
  const b = view('AB-100', { drawingId: 'd2', revision: 'B' });
  const r = resolveLineDrawing(lineOf('[AB-100] Eje'), [a, b], []);
  assert.equal(r.kind, 'match');
  if (r.kind === 'match') assert.equal(r.view.revision, 'B');
});

test('alias cuyo plano ya no está en la biblioteca da none aunque el ligado automático sí encontraría otro', () => {
  const alias: PartAlias = { id: 'a1', pattern: 'AB-100', partNumber: 'AB-100', drawingId: 'desactivado' };
  const r = resolveLineDrawing(lineOf('[AB-100] Eje'), [view('AB-100')], [alias]);
  assert.equal(r.kind, 'none');
});
