import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_ADMIN_FILTERS, parseAdminFilters, serializeAdminFilters } from './adminFilters';

test('sin parámetros devuelve los valores por defecto', () => {
  assert.deepEqual(parseAdminFilters(new URLSearchParams()), DEFAULT_ADMIN_FILTERS);
});

test('lee pestaña, vista, ingeniero, búsqueda, cliente y estado del link', () => {
  const params = new URLSearchParams('tab=orders&vista=agenda&ing=edgar-castro&q=PO2026&cliente=SUPRAJIT%20MEXICO&estado=overdue');
  assert.deepEqual(parseAdminFilters(params), {
    tab: 'orders', view: 'agenda', engineer: 'edgar-castro', search: 'PO2026', client: 'SUPRAJIT MEXICO', status: 'overdue',
  });
});

test('links antiguos tab=pending/agenda/report caen en Órdenes con su vista', () => {
  assert.deepEqual(parseAdminFilters(new URLSearchParams('tab=pending')), { ...DEFAULT_ADMIN_FILTERS, tab: 'orders', view: 'pending' });
  assert.deepEqual(parseAdminFilters(new URLSearchParams('tab=agenda&q=x')), { ...DEFAULT_ADMIN_FILTERS, tab: 'orders', view: 'agenda', search: 'x' });
  assert.deepEqual(parseAdminFilters(new URLSearchParams('tab=report')), { ...DEFAULT_ADMIN_FILTERS, tab: 'orders', view: 'company' });
});

test('ignora pestañas, vistas y estados inválidos en vez de romper la pantalla', () => {
  const params = new URLSearchParams('tab=hackeo&vista=<b>&estado=<script>');
  assert.deepEqual(parseAdminFilters(params), DEFAULT_ADMIN_FILTERS);
});

test('serializa solo lo que difiere del valor por defecto', () => {
  assert.equal(serializeAdminFilters(DEFAULT_ADMIN_FILTERS).toString(), '');
  const filters = {
    tab: 'deliveries', view: 'pending', engineer: '__unassigned__', search: 'ing. núñez', client: '', status: 'warning',
  } as const;
  const qs = serializeAdminFilters(filters);
  assert.deepEqual(parseAdminFilters(qs), filters);
  assert.equal(qs.has('cliente'), false);
  assert.equal(serializeAdminFilters({ ...DEFAULT_ADMIN_FILTERS, view: 'agenda' }).toString(), 'vista=agenda');
});

test('la pestaña de solicitudes viaja en el link', () => {
  assert.equal(parseAdminFilters(new URLSearchParams('tab=requests')).tab, 'requests');
  assert.equal(serializeAdminFilters({ ...DEFAULT_ADMIN_FILTERS, tab: 'requests' }).get('tab'), 'requests');
});
