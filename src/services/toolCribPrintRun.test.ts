import assert from 'node:assert/strict';
import test from 'node:test';
import type { OdooSaleOrder } from './odoo';
import { collectToolCribLines } from './toolCrib';
import type { DrawingView } from './toolCribMatching';
import { runPrint, validatePrintInput, type PrintDeps, type PrintJob } from './toolCribPrintRun';

test('validatePrintInput acepta enteros válidos', () => {
  assert.deepEqual(validatePrintInput({ cantidad: '5', copies: 2 }), { ok: true, cantidad: 5 });
});

test('validatePrintInput rechaza cantidad vacía, 0, negativa o decimal', () => {
  for (const cantidad of ['', '0', '-3', '2.5', 'abc']) {
    assert.equal(validatePrintInput({ cantidad, copies: 2 }).ok, false, cantidad);
  }
});

test('validatePrintInput rechaza copias fuera de 1 a 5', () => {
  for (const copies of [0, 6, 1.5]) assert.equal(validatePrintInput({ cantidad: '3', copies }).ok, false, String(copies));
});

const order = {
  id: 1, name: '2026/S01992', customer_reference: '20264321', partner_name: 'SUPRAJIT', main_product: '[AB-100] Eje',
  date_order: new Date().toISOString(), commitment_date: null, invoice_status: 'to invoice', currency: 'MXN',
  qty_total: 5, qty_delivered: 0, state: 'sale', salesperson: null, lines_count: 1,
  lines: [{ name: '[AB-100] Eje', qty: 5, delivered: 0 }], deliveries: [], note: null,
} as OdooSaleOrder;
const line = collectToolCribLines([order])[0];
const view: DrawingView = {
  partId: 'p1', partNumber: 'AB-100', customer: 'SUPRAJIT', description: '', drawingId: 'd1', revision: 'A', sourcePath: '', pdfUrl: 'https://x/a.pdf',
};
const job: PrintJob = {
  copies: 2,
  items: [{ view, line, stamp: { soNumber: order.name, cantidad: '5', fecha: '21/11/2026' } }],
};

function deps(over: Partial<PrintDeps> = {}) {
  const calls: string[] = [];
  const d: PrintDeps = {
    fetchPdf: async () => { calls.push('fetch'); return new Uint8Array([1]); },
    build: async () => { calls.push('build'); return new Uint8Array([2]); },
    open: () => { calls.push('open'); },
    log: async x => { calls.push(`log:${x.orderRef}:${x.copies}:${x.partId}`); },
    ...over,
  };
  return { d, calls };
}

test('runPrint: descarga, genera, abre y al final registra una vez por partida', async () => {
  const { d, calls } = deps();
  await runPrint(d, job);
  assert.deepEqual(calls, ['fetch', 'build', 'open', 'log:2026/S01992:2:p1']);
});

test('runPrint: si falla la descarga no abre ni registra', async () => {
  const { d, calls } = deps({ fetchPdf: async () => { throw new Error('red'); } });
  await assert.rejects(() => runPrint(d, job), /red/);
  assert.deepEqual(calls, []);
});

test('runPrint: si falla la generación no abre ni registra', async () => {
  const { d, calls } = deps({ build: async () => { throw new Error('pdf'); } });
  await assert.rejects(() => runPrint(d, job), /pdf/);
  assert.deepEqual(calls, ['fetch']);
});

test('runPrint: si falla el registro, el PDF ya se abrió y el error nombra la SO', async () => {
  const rootCause = new Error('permiso');
  const { d, calls } = deps({ log: async () => { throw rootCause; } });
  await assert.rejects(
    () => runPrint(d, job),
    (err: unknown) =>
      err instanceof Error &&
      /2026\/S01992/.test(err.message) &&
      err.cause === rootCause,
  );
  assert.deepEqual(calls, ['fetch', 'build', 'open']);
});
