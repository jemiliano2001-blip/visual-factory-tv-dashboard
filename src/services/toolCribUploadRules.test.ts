import assert from 'node:assert/strict';
import test from 'node:test';
import { validateUpload } from './toolCribUploadRules';

const pdf = { name: 'a.pdf', size: 1000, type: 'application/pdf' };

test('validateUpload acepta un PDF válido', () => {
  assert.deepEqual(validateUpload({ file: pdf, partNumber: 'AB-100', revision: 'A' }), { ok: true });
});

test('validateUpload rechaza archivos que no son PDF o pasan de 25 MB', () => {
  assert.equal(validateUpload({ file: { ...pdf, type: 'image/png' }, partNumber: 'AB-100', revision: 'A' }).ok, false);
  assert.equal(validateUpload({ file: { ...pdf, size: 26 * 1024 * 1024 }, partNumber: 'AB-100', revision: 'A' }).ok, false);
});

test('validateUpload exige número de parte (1 a 128) y revisión (1 a 32)', () => {
  assert.equal(validateUpload({ file: pdf, partNumber: '  ', revision: 'A' }).ok, false);
  assert.equal(validateUpload({ file: pdf, partNumber: 'X'.repeat(129), revision: 'A' }).ok, false);
  assert.equal(validateUpload({ file: pdf, partNumber: 'AB-100', revision: '' }).ok, false);
  assert.equal(validateUpload({ file: pdf, partNumber: 'AB-100', revision: 'R'.repeat(33) }).ok, false);
});
