import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeExcelCell } from './exportExcel.ts';

test('sanitizeExcelCell neutraliza fórmulas peligrosas (CWE-1236)', () => {
  assert.equal(sanitizeExcelCell('=CMD|"/C calc"!A0'), '\'=CMD|"/C calc"!A0');
  assert.equal(sanitizeExcelCell('+1+1'), '\'+1+1');
  assert.equal(sanitizeExcelCell('-2+3'), '\'-2+3');
  assert.equal(sanitizeExcelCell('@SUM(A1:A2)'), '\'@SUM(A1:A2)');
  assert.equal(sanitizeExcelCell(' =1+1'), '\' =1+1');
  assert.equal(sanitizeExcelCell('\t=1'), '\'\t=1');
  assert.equal(sanitizeExcelCell('\r123'), '\'\r123');
});

test('sanitizeExcelCell conserva texto normal intacto', () => {
  assert.equal(sanitizeExcelCell('2026/S01234'), '2026/S01234');
  assert.equal(sanitizeExcelCell('PO.20264321'), 'PO.20264321');
  assert.equal(sanitizeExcelCell('Pieza - Aluminio A6061'), 'Pieza - Aluminio A6061');
  assert.equal(sanitizeExcelCell(''), '');
});
