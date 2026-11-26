import assert from 'node:assert/strict';
import test from 'node:test';
import { readOnlineSnapshot, subscribeOnlineStatus, type OnlineEventTargetLike } from './useOnlineStatus';

test('readOnlineSnapshot lee navigator.onLine y asume true por defecto', () => {
  assert.equal(readOnlineSnapshot(undefined), true);
  assert.equal(readOnlineSnapshot({}), true);
  assert.equal(readOnlineSnapshot({ onLine: false }), false);
  assert.equal(readOnlineSnapshot({ onLine: true }), true);
});

test('subscribeOnlineStatus registra y limpia listeners online/offline', () => {
  const listeners = new Map<string, Set<() => void>>();
  const target: OnlineEventTargetLike = {
    addEventListener(type, fn) {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
  };

  let changes = 0;
  const unsubscribe = subscribeOnlineStatus(() => {
    changes += 1;
  }, target);

  assert.equal(listeners.get('online')?.size, 1);
  assert.equal(listeners.get('offline')?.size, 1);

  for (const fn of listeners.get('offline') ?? []) fn();
  for (const fn of listeners.get('online') ?? []) fn();
  assert.equal(changes, 2);

  unsubscribe();
  assert.equal(listeners.get('online')?.size, 0);
  assert.equal(listeners.get('offline')?.size, 0);
});
