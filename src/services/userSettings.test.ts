import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_ADMIN_FILTERS } from './adminFilters';
import { DEFAULT_USER_SETTINGS, sanitizeUserSettings, seedUserSettings, startFiltersFor } from './userSettings';

test('sanitizeUserSettings: basura cae a defaults', () => {
  assert.deepEqual(sanitizeUserSettings(null), DEFAULT_USER_SETTINGS);
  assert.deepEqual(sanitizeUserSettings({ startView: 'x', followedClients: 5, print: 3, appearance: 'y' }), DEFAULT_USER_SETTINGS);
});

test('sanitizeUserSettings: acota copias, normaliza y deduplica clientes', () => {
  const s = sanitizeUserSettings({
    startView: 'toolcrib',
    followedClients: ['Bosch ', 'bosch', '', 7, 'Suprajit'],
    print: { copies: 99, boardTicket: false },
    appearance: { theme: 'light', density: 'compact' },
  });
  assert.equal(s.startView, 'toolcrib');
  assert.deepEqual(s.followedClients, ['bosch', 'suprajit']);
  assert.deepEqual(s.print, { copies: 5, boardTicket: false });
  assert.deepEqual(s.appearance, { theme: 'light', density: 'compact' });
});

test('sanitizeUserSettings: copias no enteras o menores a 1 vuelven al default', () => {
  assert.equal(sanitizeUserSettings({ print: { copies: 0 } }).print.copies, DEFAULT_USER_SETTINGS.print.copies);
  assert.equal(sanitizeUserSettings({ print: { copies: 2.5 } }).print.copies, DEFAULT_USER_SETTINGS.print.copies);
});

test('seedUserSettings parte de lo que había en localStorage', () => {
  const s = seedUserSettings({ theme: 'light', density: 'compact' });
  assert.deepEqual(s.appearance, { theme: 'light', density: 'compact' });
  assert.equal(seedUserSettings({ theme: 'otro' }).appearance.theme, 'dark');
});

test('startFiltersFor: un link con parámetros manda', () => {
  const s = { ...DEFAULT_USER_SETTINGS, startView: 'toolcrib' as const };
  assert.equal(startFiltersFor(s, DEFAULT_ADMIN_FILTERS, true, ['Suprajit']), null);
});

test('startFiltersFor: sin parámetros abre la vista de inicio', () => {
  const s = { ...DEFAULT_USER_SETTINGS, startView: 'toolcrib' as const };
  const f = startFiltersFor(s, DEFAULT_ADMIN_FILTERS, false, []);
  assert.equal(f?.tab, 'orders');
  assert.equal(f?.view, 'toolcrib');
});

test('startFiltersFor: un solo cliente seguido se aplica con el nombre real de Odoo; varios no', () => {
  const one = { ...DEFAULT_USER_SETTINGS, followedClients: ['suprajit'] };
  assert.equal(startFiltersFor(one, DEFAULT_ADMIN_FILTERS, false, ['SUPRAJIT MX', 'Suprajit'])?.client, 'Suprajit');
  const many = { ...DEFAULT_USER_SETTINGS, followedClients: ['suprajit', 'bosch'] };
  assert.equal(startFiltersFor(many, DEFAULT_ADMIN_FILTERS, false, ['Suprajit', 'Bosch']), null);
});

test('startFiltersFor: sin nada que cambiar regresa null', () => {
  assert.equal(startFiltersFor(DEFAULT_USER_SETTINGS, DEFAULT_ADMIN_FILTERS, false, []), null);
});
