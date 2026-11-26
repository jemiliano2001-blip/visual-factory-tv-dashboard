import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_ADMIN_FILTERS } from './adminFilters';
import {
  MAX_SAVED_VIEWS,
  MAX_SAVED_VIEW_NAME,
  addSavedView,
  normalizeSavedViews,
  removeSavedView,
  savedViewToFilters,
} from './savedViews';

test('addSavedView guarda, reemplaza duplicados por nombre y respeta límites', () => {
  const f1 = { ...DEFAULT_ADMIN_FILTERS, client: 'Bosch', status: 'overdue' as const };
  let views = addSavedView([], '  Urgentes   Bosch ', f1);
  assert.equal(views.length, 1);
  assert.equal(views[0].name, 'Urgentes Bosch');
  assert.deepEqual(savedViewToFilters(views[0]), f1);

  const f2 = { ...DEFAULT_ADMIN_FILTERS, client: 'Bosch', status: 'warning' as const };
  views = addSavedView(views, 'urgentes bosch', f2);
  assert.equal(views.length, 1);
  assert.deepEqual(savedViewToFilters(views[0]), f2);

  // Nombre vacío se ignora
  assert.equal(addSavedView(views, '   ', f1).length, 1);

  // Tope de nombre y de vistas
  let capped: ReturnType<typeof addSavedView> = [];
  for (let i = 0; i < MAX_SAVED_VIEWS + 4; i++) {
    capped = addSavedView(capped, `Vista ${i} ${'x'.repeat(50)}`, f1);
  }
  assert.equal(capped.length, MAX_SAVED_VIEWS);
  assert.ok(capped.every(v => v.name.length <= MAX_SAVED_VIEW_NAME));
});

test('removeSavedView y normalizeSavedViews limpian entradas inválidas', () => {
  const normalized = normalizeSavedViews([
    { id: 'v1', name: 'Mis atrasadas', query: 'estado=overdue&vista=invalida' },
    { id: '', name: 'Sin id', query: '' },
    { id: 'v2', name: 'mis atrasadas', query: 'estado=all' },
    null,
  ]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].id, 'v1');
  assert.equal(savedViewToFilters(normalized[0]).status, 'overdue');
  assert.equal(savedViewToFilters(normalized[0]).view, 'company');

  assert.deepEqual(removeSavedView(normalized, 'v1'), []);
});
