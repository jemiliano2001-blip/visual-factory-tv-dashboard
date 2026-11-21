import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { buildPrintPdf, cleanFilename, sanitizeWinAnsi, stampDetailLine, wrapStampText, type PlanoOtStamp } from './planoOt';

async function blankPdf(pages = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([600, 400]);
  return doc.save();
}

const stamp: PlanoOtStamp = { soNumber: '2026/S01992', cantidad: '5', fecha: '21/11/2026', poNumber: '20264321' };

test('sanitizeWinAnsi conserva acentos y ñ y reemplaza lo que WinAnsi no tiene', () => {
  const out = sanitizeWinAnsi('Ñandú “x” — ✓ 漢');
  assert.ok(out.includes('Ñandú'));
  assert.ok(!/[^\x00-\xFF]/.test(out));
  assert.ok(out.includes('"x"'));
});

test('wrapStampText parte un texto largo sin exceder el ancho', () => {
  const measure = (t: string) => t.length * 10;
  const lines = wrapStampText('ABCDEFGHIJKLMNOP', measure, 50);
  assert.ok(lines.length > 1);
  assert.ok(lines.every(l => measure(l) <= 50));
  assert.equal(lines.join(''), 'ABCDEFGHIJKLMNOP');
});

test('stampDetailLine omite el PO cuando viene vacío', () => {
  assert.equal(stampDetailLine({ fecha: '21/11/2026', poNumber: '' }), 'FECHA: 21/11/2026');
  assert.equal(stampDetailLine({ fecha: '21/11/2026', poNumber: '123' }), 'FECHA: 21/11/2026     PO: 123');
});

test('cleanFilename limpia caracteres inválidos', () => {
  assert.equal(cleanFilename('2026/S01992'), '2026-S01992');
  assert.equal(cleanFilename('', 'orden'), 'orden');
});

test('buildPrintPdf repite cada plano por copia: 2 planos x 2 copias = 4 páginas', async () => {
  const bytes = await buildPrintPdf([
    { pdfBytes: await blankPdf(), stamp, copies: 2 },
    { pdfBytes: await blankPdf(), stamp, copies: 2 },
  ]);
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 4);
});

test('buildPrintPdf con ficha de pizarrón la agrega una vez por plano, antes de las copias', async () => {
  const bytes = await buildPrintPdf([{ pdfBytes: await blankPdf(), stamp: { ...stamp, mode: 'both' }, copies: 2 }]);
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 3);
});

test('buildPrintPdf sin planos lanza error', async () => {
  await assert.rejects(() => buildPrintPdf([]), /No hay planos/);
});

test('buildPrintPdf rechaza copias inválidas', async () => {
  const pdfBytes = await blankPdf();
  await assert.rejects(() => buildPrintPdf([{ pdfBytes, stamp, copies: 0 }]), /copias/i);
});

test('sanitizeWinAnsi no deja caracteres de control (salto de línea, tab, 0x85)', () => {
  assert.ok(!/[\x00-\x1F\x7F-\x9F]/.test(sanitizeWinAnsi('A\nB\tC\u0085D')));
});

test('buildPrintPdf con ficha no falla si la descripción trae saltos de línea', async () => {
  const pdfBytes = await blankPdf();
  const bytes = await buildPrintPdf([{ pdfBytes, stamp: { ...stamp, mode: 'both', piezaDescripcion: '[ABC-123] BUJE\nACERO 4140\tX', partNumber: 'A\nB', customer: 'SUP\nRAJIT' }, copies: 1 }]);
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2);
});
