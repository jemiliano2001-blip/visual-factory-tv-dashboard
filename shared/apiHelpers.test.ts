import assert from 'node:assert/strict';
import test from 'node:test';
import { NO_ACTOR, isActor, safeErrorSummary } from './apiHelpers';

test('isActor valida objetos con uid string y rechaza valores inválidos', () => {
  assert.equal(isActor({ uid: 'u1', email: null, name: null }), true);
  assert.equal(isActor({ uid: 'u2' }), true);
  assert.equal(isActor(null), false);
  assert.equal(isActor(undefined), false);
  assert.equal(isActor({}), false);
  assert.equal(isActor({ uid: 123 }), false);
  assert.equal(typeof NO_ACTOR, 'string');
});

test('safeErrorSummary normaliza espacios, recorta a 200 caracteres y soporta no-Error', () => {
  const err = new TypeError('  fallo   en\n  conexión  ');
  assert.deepEqual(safeErrorSummary(err), { name: 'TypeError', message: 'fallo en conexión' });

  const longErr = new Error('x'.repeat(260));
  assert.equal(safeErrorSummary(longErr).message.length, 200);

  assert.deepEqual(safeErrorSummary('algo   raro'), { name: 'UnknownError', message: 'algo raro' });
});
