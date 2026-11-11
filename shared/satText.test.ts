import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSatText } from './satText';

test('normalizeSatText: mayúsculas, sin acentos ni signos, rodeado de espacios', () => {
  assert.equal(normalizeSatText('Fab. de Interfaces'), ' FAB DE INTERFACES ');
  assert.equal(normalizeSatText('Ñandú—ÁÉÍ'), ' NANDU AEI ');
  assert.equal(normalizeSatText('   ').trim(), '');
});
