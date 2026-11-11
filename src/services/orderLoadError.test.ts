import test from 'node:test';
import assert from 'node:assert/strict';
import { isAccessError, loadErrorLabel } from './orderLoadError';

test('los fallos de acceso, sesión o token no se presentan como Odoo caído', () => {
  for (const message of [
    'Tu cuenta no tiene acceso a este tablero.',
    'No se pudo verificar tu acceso. Intenta de nuevo.',
    'Token inválido o expirado. Vuelve a iniciar sesión.',
    'No hay sesión de Firebase. Inicia sesión con tu cuenta de personal SMV.',
    'No se pudo obtener el token de sesión. Recarga la página.',
  ]) {
    assert.equal(isAccessError(message), true, message);
    assert.equal(loadErrorLabel(message), message);
  }
});

test('los demás fallos sí se rotulan como falta de conexión a Odoo', () => {
  for (const message of ['Sin conexión al proxy de Odoo: Failed to fetch', 'Error HTTP 500', 'Odoo RPC timeout']) {
    assert.equal(isAccessError(message), false, message);
    assert.equal(loadErrorLabel(message), `SIN CONEXIÓN A ODOO — ${message}`);
  }
});
