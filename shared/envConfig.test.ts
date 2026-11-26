import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFunctionsEnv, parseServerEnv, redactEnvSummary } from './envConfig';

test('parseServerEnv aplica defaults seguros, coerción tipada e inmutabilidad', () => {
  const res = parseServerEnv({});
  assert.equal(res.ok, true);
  assert.deepEqual(res.errors, []);
  assert.equal(res.config.ODOO_PROXY_PORT, 3001);
  assert.equal(res.config.DEV_AUTH_BYPASS, false);
  assert.equal(Object.isFrozen(res.config), true);

  const custom = parseServerEnv({
    ODOO_URL: 'https://odoo.smv.mx',
    ODOO_PROXY_PORT: '4010',
    DEV_AUTH_BYPASS: 'true',
    APP_URL: 'https://dashboardsmv.web.app',
  });
  assert.equal(custom.ok, true);
  assert.equal(custom.config.ODOO_PROXY_PORT, 4010);
  assert.equal(custom.config.DEV_AUTH_BYPASS, true);
});

test('parseServerEnv acumula errores múltiples sin exponer secretos', () => {
  const res = parseServerEnv({
    ODOO_URL: 'ftp://odoo.smv.mx',
    ODOO_PROXY_PORT: '99999',
    APP_URL: 'no-es-url',
    DEV_AUTH_BYPASS: 'si',
    ODOO_PASSWORD: 'mi-secreto-super-privado',
  });
  assert.equal(res.ok, false);
  assert.equal(res.errors.length, 4);
  assert.equal(res.errors.join(' ').includes('mi-secreto-super-privado'), false);
});

test('parseFunctionsEnv valida webhooks, enteros y booleanos', () => {
  const ok = parseFunctionsEnv({
    ODOO_URL: 'https://odoo.smv.mx',
    DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/123/secret-token',
    STALL_THRESHOLD_DAYS: '5',
    DISCORD_LARGE_ORDER_LINES: '8',
    NOTIFICATIONS_ENABLED: 'false',
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.config.STALL_THRESHOLD_DAYS, 5);
  assert.equal(ok.config.DISCORD_LARGE_ORDER_LINES, 8);
  assert.equal(ok.config.NOTIFICATIONS_ENABLED, false);

  const bad = parseFunctionsEnv({
    DISCORD_WEBHOOK_URL: 'notaurl-secret',
    STALL_THRESHOLD_DAYS: '0',
    DISCORD_LARGE_ORDER_LINES: 'abc',
    NOTIFICATIONS_ENABLED: '1',
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.length, 4);
  assert.equal(bad.errors.join(' ').includes('notaurl-secret'), false);
});

test('redactEnvSummary oculta secretos, tokens de webhook y credenciales en URLs', () => {
  const serverRes = parseServerEnv({
    ODOO_URL: 'https://user:pass@odoo.smv.mx',
    ODOO_PASSWORD: 'odoo-secret-password',
    FIREBASE_API_KEY: 'AIza-fake-key',
  });
  const serverSummary = redactEnvSummary(serverRes.config);
  assert.equal(serverSummary.ODOO_PASSWORD, '[REDACTED]');
  assert.equal(serverSummary.FIREBASE_API_KEY, '[REDACTED]');
  assert.equal(String(serverSummary.ODOO_URL).includes('pass'), false);

  const fnRes = parseFunctionsEnv({
    GMAIL_APP_PASSWORD: 'gmail-app-password',
    DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/111/super-secret',
  });
  const fnSummary = redactEnvSummary(fnRes.config);
  assert.equal(fnSummary.GMAIL_APP_PASSWORD, '[REDACTED]');
  assert.equal(fnSummary.DISCORD_WEBHOOK_URL, '[REDACTED]');
  assert.equal(fnSummary.DISCORD_WEBHOOK_URL_CRITICOS, '(vacío)');
});
