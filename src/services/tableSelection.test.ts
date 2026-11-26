import assert from 'node:assert/strict';
import test from 'node:test';
import { applyRangeSelection } from './tableSelection';

test('applyRangeSelection selecciona un elemento simple sin Shift', () => {
  const res = applyRangeSelection({
    orderedIds: ['1', '2', '3', '4'],
    current: {},
    anchorId: null,
    targetId: '2',
    checked: true,
    shiftKey: false,
  });
  assert.deepEqual(res.selection, { '2': true });
  assert.equal(res.nextAnchorId, '2');
});

test('applyRangeSelection marca rango inclusivo con Shift+Click hacia adelante y atrás', () => {
  const forward = applyRangeSelection({
    orderedIds: ['a', 'b', 'c', 'd', 'e'],
    current: { a: true },
    anchorId: 'a',
    targetId: 'd',
    checked: true,
    shiftKey: true,
  });
  assert.deepEqual(forward.selection, { a: true, b: true, c: true, d: true });
  assert.equal(forward.nextAnchorId, 'd');

  const backward = applyRangeSelection({
    orderedIds: ['a', 'b', 'c', 'd', 'e'],
    current: { d: true },
    anchorId: 'd',
    targetId: 'b',
    checked: true,
    shiftKey: true,
  });
  assert.deepEqual(backward.selection, { b: true, c: true, d: true });
  assert.equal(backward.nextAnchorId, 'b');
});

test('applyRangeSelection desmarca rango inclusivo con Shift+Click y limpia claves falsas', () => {
  const res = applyRangeSelection({
    orderedIds: ['1', '2', '3', '4'],
    current: { '1': true, '2': true, '3': true, '4': true },
    anchorId: '2',
    targetId: '3',
    checked: false,
    shiftKey: true,
  });
  assert.deepEqual(res.selection, { '1': true, '4': true });
});

test('applyRangeSelection cae a selección simple si el ancla no está en las filas visibles', () => {
  const res = applyRangeSelection({
    orderedIds: ['2', '3'],
    current: { '1': true },
    anchorId: '1',
    targetId: '3',
    checked: true,
    shiftKey: true,
  });
  assert.deepEqual(res.selection, { '1': true, '3': true });
  assert.equal(res.nextAnchorId, '3');
});
