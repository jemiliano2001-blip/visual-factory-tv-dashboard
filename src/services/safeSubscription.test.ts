import assert from 'node:assert/strict';
import test from 'node:test';
import { guardSubscription } from './safeSubscription';

// Simula el SDK de Firestore con el cliente "muerto" (firebase-js-sdk #10310, ca9/b815):
// onSnapshot y la funcion unsubscribe lanzan de forma sincrona.

test('si la suscripcion lanza, no propaga: reporta y devuelve un unsubscribe inofensivo', () => {
  const errors: Error[] = [];
  const unsub = guardSubscription(() => {
    throw new Error('FIRESTORE INTERNAL ASSERTION FAILED (ID: ca9)');
  }, (e) => errors.push(e));

  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /ca9/);
  assert.doesNotThrow(() => unsub());
});

test('si el unsubscribe lanza, no propaga y se reporta', () => {
  const errors: Error[] = [];
  const unsub = guardSubscription(() => () => {
    throw new Error('FIRESTORE INTERNAL ASSERTION FAILED (ID: b815)');
  }, (e) => errors.push(e));

  assert.equal(errors.length, 0);
  assert.doesNotThrow(() => unsub());
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /b815/);
});

test('camino normal: delega el unsubscribe real una vez por llamada', () => {
  let calls = 0;
  const unsub = guardSubscription(() => () => { calls++; }, () => assert.fail('sin errores'));
  unsub();
  assert.equal(calls, 1);
});

test('un onError que tambien lanza no rompe el cleanup', () => {
  const unsub = guardSubscription(() => { throw new Error('x'); }, () => { throw new Error('y'); });
  assert.doesNotThrow(() => unsub());
});
