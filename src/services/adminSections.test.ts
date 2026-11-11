import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_ADMIN_FILTERS, UNASSIGNED_ENGINEER, parseAdminFilters, type AdminFilters,
} from './adminFilters';
import {
  ADMIN_SECTIONS, MOBILE_PRIMARY_SECTIONS, activeFilterChips, adminSectionHref, clearFilter,
  filtersForSection, getSection, hasActiveFilters, isInMoreMenu, restoreSavedFilters, sectionFromFilters,
} from './adminSections';

test('sección ↔ filtros ida y vuelta para las 6 secciones', () => {
  assert.equal(ADMIN_SECTIONS.length, 6);
  for (const { id } of ADMIN_SECTIONS) {
    assert.equal(sectionFromFilters(filtersForSection(id, DEFAULT_ADMIN_FILTERS)), id);
  }
});

test('filtersForSection conserva q, cliente, estado e ing', () => {
  const f: AdminFilters = { ...DEFAULT_ADMIN_FILTERS, search: 'PO2026', client: 'BOSCH', status: 'overdue', engineer: 'u-1' };
  const out = filtersForSection('deliveries', f);
  assert.equal(out.tab, 'deliveries');
  assert.deepEqual(
    [out.search, out.client, out.status, out.engineer],
    ['PO2026', 'BOSCH', 'overdue', 'u-1'],
  );
});

test('filtersForSection a una vista de órdenes fija tab=orders', () => {
  const out = filtersForSection('agenda', { ...DEFAULT_ADMIN_FILTERS, tab: 'config' });
  assert.equal(out.tab, 'orders');
  assert.equal(out.view, 'agenda');
});

test('links legados marcan la sección correcta', () => {
  const sec = (q: string) => sectionFromFilters(parseAdminFilters(new URLSearchParams(q)));
  assert.equal(sec('tab=pending'), 'pending');
  assert.equal(sec('tab=agenda'), 'agenda');
  assert.equal(sec('tab=report'), 'company');
  assert.equal(sec('tab=basura'), 'company');
});

test('pestañas que no son de órdenes ignoran la vista', () => {
  assert.equal(sectionFromFilters({ ...DEFAULT_ADMIN_FILTERS, tab: 'requests', view: 'agenda' }), 'requests');
});

test('adminSectionHref', () => {
  assert.equal(adminSectionHref('company', null), '/admin');
  assert.equal(adminSectionHref('pending', null), '/admin?vista=pending');
  assert.equal(
    adminSectionHref('deliveries', { ...DEFAULT_ADMIN_FILTERS, search: 'x' }),
    '/admin?tab=deliveries&q=x',
  );
});

test('reparto móvil: 4 fijos y el resto en Más', () => {
  assert.deepEqual([...MOBILE_PRIMARY_SECTIONS], ['company', 'pending', 'agenda', 'deliveries']);
  assert.ok(isInMoreMenu('requests') && isInMoreMenu('config'));
  assert.ok(!isInMoreMenu('agenda'));
});

test('etiquetas, grupos y barra de controles por sección', () => {
  assert.equal(getSection('company').label, 'Por compañía');
  assert.equal(getSection('config').group, 'settings');
  assert.equal(getSection('company').group, 'orders');
  assert.deepEqual(
    ADMIN_SECTIONS.filter(s => s.hasToolbar).map(s => s.id),
    ['company', 'pending', 'agenda', 'deliveries'],
  );
});

test('hasActiveFilters ignora búsqueda de solo espacios', () => {
  assert.equal(hasActiveFilters({ ...DEFAULT_ADMIN_FILTERS, search: '   ' }), false);
  assert.equal(hasActiveFilters({ ...DEFAULT_ADMIN_FILTERS, client: 'X' }), true);
});

test('chips de filtros activos', () => {
  const f: AdminFilters = {
    ...DEFAULT_ADMIN_FILTERS, search: ' PO1 ', client: 'BOSCH', engineer: UNASSIGNED_ENGINEER, status: 'overdue',
  };
  const chips = activeFilterChips(f, { engineerName: () => null, statusLabel: () => 'Atrasadas' });
  assert.deepEqual(chips, [
    { key: 'search', label: 'Búsqueda: PO1' },
    { key: 'client', label: 'Cliente: BOSCH' },
    { key: 'engineer', label: 'Ingeniero: sin asignar' },
    { key: 'status', label: 'Estado: Atrasadas' },
  ]);
});

test('chip de ingeniero desconocido se muestra y se puede quitar', () => {
  const f: AdminFilters = { ...DEFAULT_ADMIN_FILTERS, engineer: 'u-viejo' };
  const chips = activeFilterChips(f, { engineerName: () => null, statusLabel: () => '' });
  assert.deepEqual(chips, [{ key: 'engineer', label: 'Ingeniero: desconocido' }]);
});

test('búsqueda de solo espacios no genera chip', () => {
  const chips = activeFilterChips({ ...DEFAULT_ADMIN_FILTERS, search: '  ' }, { engineerName: () => null, statusLabel: () => '' });
  assert.deepEqual(chips, []);
});

test('clearFilter limpia solo el filtro indicado', () => {
  const f: AdminFilters = { ...DEFAULT_ADMIN_FILTERS, tab: 'deliveries', search: 'a', engineer: 'u-1', status: 'overdue' };
  assert.equal(clearFilter(f, 'status').status, 'all');
  assert.equal(clearFilter(f, 'engineer').engineer, '');
  assert.equal(clearFilter(f, 'search').search, '');
  assert.equal(clearFilter(f, 'client').client, '');
  assert.equal(clearFilter(f, 'status').tab, 'deliveries');
});

test('restoreSavedFilters: sin filtros en el link restaura los guardados y respeta sección del link', () => {
  const saved: AdminFilters = { ...DEFAULT_ADMIN_FILTERS, view: 'agenda', search: 'PO1', client: 'BOSCH' };
  // Entrar por "Por compañía" (/admin limpio) no debe cambiar la sección a la vista guardada.
  const company = restoreSavedFilters(DEFAULT_ADMIN_FILTERS, saved);
  assert.deepEqual(company, { ...DEFAULT_ADMIN_FILTERS, search: 'PO1', client: 'BOSCH' });
  // Entrar por otra sección (/admin?tab=deliveries) conserva esa sección y recupera los filtros.
  const deliveries = restoreSavedFilters({ ...DEFAULT_ADMIN_FILTERS, tab: 'deliveries' }, saved);
  assert.equal(deliveries?.tab, 'deliveries');
  assert.equal(deliveries?.search, 'PO1');
});

test('restoreSavedFilters: no pisa filtros del link ni restaura nada vacío', () => {
  const saved: AdminFilters = { ...DEFAULT_ADMIN_FILTERS, search: 'PO1' };
  assert.equal(restoreSavedFilters({ ...DEFAULT_ADMIN_FILTERS, client: 'X' }, saved), null);
  assert.equal(restoreSavedFilters(DEFAULT_ADMIN_FILTERS, DEFAULT_ADMIN_FILTERS), null);
  assert.equal(restoreSavedFilters(DEFAULT_ADMIN_FILTERS, null), null);
});
