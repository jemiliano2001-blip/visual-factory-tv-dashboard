import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_ENGINEERS, applyOrderAssignmentsMutation, getOrderEngineerId, normalizeOrderAssignments, slugifyEngineerId,
} from '../../shared/orderAssignments';

test('slugifyEngineerId quita acentos y símbolos', () => {
  assert.equal(slugifyEngineerId('Antonio Vázquez'), 'antonio-vazquez');
  assert.equal(slugifyEngineerId('  Ing. Pérez  '), 'ing-perez');
});

test('normalize siempre incluye los ingenieros por defecto y filtra lo inválido', () => {
  assert.deepEqual(normalizeOrderAssignments(null).engineers, DEFAULT_ENGINEERS);
  const out = normalizeOrderAssignments({
    engineers: [{ id: 'luis', name: 'Luis' }, { id: 'x', name: 'x' }, { id: 'rogelio', name: 'Otro' }, 7],
    assignments: { S01: 'luis', S02: 'fantasma', S03: 5 },
  });
  assert.deepEqual(out.engineers.map(e => e.id), ['edgar-castro', 'antonio-vazquez', 'rogelio', 'luis']);
  assert.deepEqual(out.assignments, { S01: 'luis' });
});

test('mutation asigna, desasigna, agrega y elimina ingenieros', () => {
  let state = normalizeOrderAssignments(null);
  state = applyOrderAssignmentsMutation(state, { orderKeys: ['S01', 'S02'], engineerId: 'rogelio' });
  assert.deepEqual(state.assignments, { S01: 'rogelio', S02: 'rogelio' });
  state = applyOrderAssignmentsMutation(state, { orderKeys: ['S01'], engineerId: null });
  assert.deepEqual(state.assignments, { S02: 'rogelio' });
  state = applyOrderAssignmentsMutation(state, { addEngineerName: 'Luis Pérez' });
  assert.ok(state.engineers.some(e => e.id === 'luis-perez'));
  state = applyOrderAssignmentsMutation(state, { removeEngineerId: 'rogelio' });
  assert.deepEqual(state.assignments, {});
  assert.equal(state.engineers.some(e => e.id === 'rogelio'), false);
});

test('mutation rechaza nombres inválidos, repetidos e ingenieros inexistentes', () => {
  const state = normalizeOrderAssignments(null);
  assert.throws(() => applyOrderAssignmentsMutation(state, { addEngineerName: 'a' }));
  assert.throws(() => applyOrderAssignmentsMutation(state, { addEngineerName: 'x'.repeat(51) }));
  assert.throws(() => applyOrderAssignmentsMutation(state, { addEngineerName: 'edgar castro' }));
  assert.throws(() => applyOrderAssignmentsMutation(state, { orderKeys: ['S01'], engineerId: 'nadie' }));
});

test('getOrderEngineerId busca por nombre y luego por id', () => {
  assert.equal(getOrderEngineerId({ S01: 'rogelio', '7': 'edgar-castro' }, { id: 7, name: 'S01' }), 'rogelio');
  assert.equal(getOrderEngineerId({ '7': 'edgar-castro' }, { id: 7, name: 'S01' }), 'edgar-castro');
  assert.equal(getOrderEngineerId({}, { id: 7, name: 'S01' }), null);
});
