import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { esTokenAnonimo } from './firebaseTokenPolicy.ts';

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'RS256' })}.${b64(payload)}.firma`;
}

test('un token de sesión anónima se rechaza', () => {
  assert.equal(esTokenAnonimo(jwt({ firebase: { sign_in_provider: 'anonymous' } })), true);
});

test('tokens de Google, correo/contraseña y SSO (custom) se aceptan', () => {
  for (const p of ['google.com', 'password', 'custom']) {
    assert.equal(esTokenAnonimo(jwt({ firebase: { sign_in_provider: p } })), false, p);
  }
});

test('un token ilegible o sin proveedor falla cerrado', () => {
  assert.equal(esTokenAnonimo('no-es-jwt'), true);
  assert.equal(esTokenAnonimo(jwt({})), true);
});

const leer = (...ruta: string[]) => readFileSync(resolve(import.meta.dirname, '..', ...ruta), 'utf8');

test('el cliente no crea sesiones anónimas automáticas (A2)', () => {
  assert.equal(/signInAnonymously\s*\(/.test(leer('src', 'App.tsx')), false);
});

test('la TV en "/" exige usuario real igual que /admin y /stats (A1)', () => {
  assert.match(leer('src', 'App.tsx'), /<ProtectedRoute>\s*<TVDashboard\s*\/>\s*<\/ProtectedRoute>/);
});

test('el servidor rechaza tokens anónimos con 403 (A1)', () => {
  const src = leer('server.ts');
  assert.match(src, /esTokenAnonimo/);
  assert.match(src, /status\(403\)/);
});
