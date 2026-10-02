import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_ADMIN_FILTERS, parseAdminFilters, serializeAdminFilters } from './adminFilters';

test('sin parámetros devuelve los valores por defecto', () => {
  assert.deepEqual(parseAdminFilters(new URLSearchParams()), DEFAULT_ADMIN_FILTERS);
});

test('lee pestaña, búsqueda, cliente y estado del link', () => {
  const params = new URLSearchParams('tab=agenda&q=PO2026&cliente=SUPRAJIT%20MEXICO&estado=overdue');
  assert.deepEqual(parseAdminFilters(params), {
    tab: 'agenda', search: 'PO2026', client: 'SUPRAJIT MEXICO', status: 'overdue',
  });
});

test('ignora pestañas y estados inválidos en vez de romper la pantalla', () => {
  const params = new URLSearchParams('tab=hackeo&estado=<script>');
  assert.deepEqual(parseAdminFilters(params), DEFAULT_ADMIN_FILTERS);
});

test('serializa solo lo que difiere del valor por defecto', () => {
  assert.equal(serializeAdminFilters(DEFAULT_ADMIN_FILTERS).toString(), '');
  const qs = serializeAdminFilters({ tab: 'orders', search: 'ing. núñez', client: '', status: 'warning' });
  assert.deepEqual(parseAdminFilters(qs), { tab: 'orders', search: 'ing. núñez', client: '', status: 'warning' });
  assert.equal(qs.has('cliente'), false);
});
