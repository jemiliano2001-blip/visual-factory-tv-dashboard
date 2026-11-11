import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_ENGINEERS, actorEngineerId, claimOrders, getOrderEngineerId, normalizeOrderAssignments, parseOrderKeys, releaseOrders,
} from '../../shared/orderAssignments';

test('normalize siempre incluye los ingenieros por defecto y filtra lo inválido', () => {
  assert.deepEqual(normalizeOrderAssignments(null).engineers, DEFAULT_ENGINEERS);
  const out = normalizeOrderAssignments({
    engineers: [{ id: 'luis', name: 'Luis' }, { id: 'x', name: 'x' }, { id: 'rogelio', name: 'Otro' }, 7],
    assignments: { S01: 'luis', S02: 'fantasma', S03: 5 },
  });
  assert.deepEqual(out.engineers.map(e => e.id), ['luis']);
  assert.deepEqual(out.assignments, { S01: 'luis' });
});

test('Edgar, Antonio y Rogelio ya no aparecen en la lista; sus asignaciones antiguas se descartan', () => {
  assert.deepEqual(normalizeOrderAssignments(null).engineers, []);
  const out = normalizeOrderAssignments({ assignments: { S01: 'rogelio', S02: 'edgar-castro', S03: 'antonio-vazquez' } });
  assert.deepEqual(out.assignments, {});
});

test('los ingenieros sembrados por código se quitan de la lista guardada; las cuentas conectadas se quedan', () => {
  const out = normalizeOrderAssignments({
    engineers: [
      { id: 'edgar-castro', name: 'Edgar Castro' },
      { id: 'antonio-vazquez', name: 'Antonio Vázquez' },
      { id: 'rogelio', name: 'Rogelio' },
      { id: 'u-A1', name: 'Emiliano Vázquez' },
    ],
    assignments: { S01: 'u-A1', S02: 'rogelio' },
  });
  assert.deepEqual(out.engineers, [{ id: 'u-A1', name: 'Emiliano Vázquez' }]);
  assert.deepEqual(out.assignments, { S01: 'u-A1' });
});

test('claimOrders: cada quien se asigna a sí mismo y queda en la lista con su nombre', () => {
  const ana = { uid: 'A1', name: 'Ana Ruiz', email: 'ana@smv.com' };
  let state = normalizeOrderAssignments(null);
  state = claimOrders(state, ana, ['S01', 'S02']);
  assert.deepEqual(state.assignments, { S01: actorEngineerId('A1'), S02: actorEngineerId('A1') });
  assert.deepEqual(state.engineers.find(e => e.id === actorEngineerId('A1')), { id: 'u-A1', name: 'Ana Ruiz' });
  state = claimOrders(state, { ...ana, name: 'Ana R.' }, ['S03']);
  assert.equal(state.engineers.filter(e => e.id === 'u-A1').length, 1);
  assert.equal(state.engineers.find(e => e.id === 'u-A1')?.name, 'Ana R.');
});

test('claimOrders: puede tomar una orden que tenía otra persona', () => {
  let state = normalizeOrderAssignments({ engineers: [{ id: 'u-C3', name: 'Carla' }], assignments: { S01: 'u-C3' } });
  state = claimOrders(state, { uid: 'B2', name: null, email: 'beto@smv.com' }, ['S01']);
  assert.equal(state.assignments.S01, 'u-B2');
  assert.equal(state.engineers.find(e => e.id === 'u-B2')?.name, 'beto@smv.com');
});

test('releaseOrders: solo suelta lo propio', () => {
  const ana = { uid: 'A1', name: 'Ana', email: null };
  let state = normalizeOrderAssignments({ engineers: [{ id: 'u-C3', name: 'Carla' }], assignments: { S09: 'u-C3' } });
  state = claimOrders(state, ana, ['S01']);
  state = releaseOrders(state, 'A1', ['S01', 'S09']);
  assert.deepEqual(state.assignments, { S09: 'u-C3' });
});

test('claimOrders y parseOrderKeys validan la entrada', () => {
  const state = normalizeOrderAssignments(null);
  assert.throws(() => claimOrders(state, { uid: '', name: 'x', email: null }, ['S01']));
  assert.deepEqual(parseOrderKeys({ orderKeys: ['S01'] }), ['S01']);
  assert.throws(() => parseOrderKeys({ orderKeys: [] }));
  assert.throws(() => parseOrderKeys({ orderKeys: [1] }));
  assert.throws(() => parseOrderKeys(null));
});

test('getOrderEngineerId busca por nombre y luego por id', () => {
  assert.equal(getOrderEngineerId({ S01: 'rogelio', '7': 'edgar-castro' }, { id: 7, name: 'S01' }), 'rogelio');
  assert.equal(getOrderEngineerId({ '7': 'edgar-castro' }, { id: 7, name: 'S01' }), 'edgar-castro');
  assert.equal(getOrderEngineerId({}, { id: 7, name: 'S01' }), null);
});
