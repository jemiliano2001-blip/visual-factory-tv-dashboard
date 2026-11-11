import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { crearAuthApi, esTokenAnonimo, identidadDeToken } from './firebaseTokenPolicy.ts';

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
  assert.match(src, /crearAuthApi\(/);
});

test('identidadDeToken devuelve uid, email y name para sesiones reales', () => {
  for (const p of ['password', 'google.com', 'custom']) {
    assert.deepEqual(
      identidadDeToken(jwt({ user_id: 'u1', email: 'a@smv.mx', name: 'Ana', firebase: { sign_in_provider: p } })),
      { uid: 'u1', email: 'a@smv.mx', name: 'Ana' },
      p,
    );
  }
  assert.deepEqual(identidadDeToken(jwt({ sub: 's1', firebase: { sign_in_provider: 'password' } })), { uid: 's1', email: null, name: null });
});

test('identidadDeToken falla cerrado: anónimo, ilegible o sin uid', () => {
  assert.equal(identidadDeToken(jwt({ user_id: 'u1', firebase: { sign_in_provider: 'anonymous' } })), null);
  assert.equal(identidadDeToken('no-es-jwt'), null);
  assert.equal(identidadDeToken(jwt({ firebase: { sign_in_provider: 'password' } })), null);
});

function correrAuth(authorization: string | undefined, valido: boolean) {
  const res = { code: 0, body: undefined as unknown, locals: {} as Record<string, unknown>,
    status(c: number) { this.code = c; return { json: (b: unknown) => { this.body = b; } }; } };
  let nexts = 0;
  return crearAuthApi(async () => valido)({ headers: { authorization } }, res, () => { nexts++; }).then(() => ({ res, nexts }));
}

test('crearAuthApi: 401 sin token, 401 inválido y 403 anónimo sin llamar next', async () => {
  const anon = jwt({ user_id: 'u1', firebase: { sign_in_provider: 'anonymous' } });
  const a = await correrAuth(undefined, true);
  assert.deepEqual([a.res.code, a.nexts], [401, 0]);
  const b = await correrAuth('Bearer x', false);
  assert.deepEqual([b.res.code, b.nexts], [401, 0]);
  const c = await correrAuth(`Bearer ${anon}`, true);
  assert.deepEqual([c.res.code, c.nexts], [403, 0]);
  // sesión no anónima pero sin uid: no hay identidad que registrar, falla cerrado
  const sinUid = await correrAuth(`Bearer ${jwt({ firebase: { sign_in_provider: 'password' } })}`, true);
  assert.deepEqual([sinUid.res.code, sinUid.nexts], [403, 0]);
});

test('crearAuthApi: token real llama next una vez y deja res.locals.actor', async () => {
  const t = jwt({ user_id: 'u1', email: 'a@smv.mx', name: 'Ana', firebase: { sign_in_provider: 'password' } });
  const r = await correrAuth(`Bearer ${t}`, true);
  assert.equal(r.nexts, 1);
  assert.equal(r.res.code, 0);
  assert.deepEqual(r.res.locals.actor, { uid: 'u1', email: 'a@smv.mx', name: 'Ana' });
});

test('functions/src/index.ts usa crearAuthApi y no el guard anónimo viejo', () => {
  const src = leer('functions', 'src', 'index.ts');
  assert.ok(src.includes('crearAuthApi('));
  assert.ok(!src.includes('esTokenAnonimo('));
  assert.ok(!src.includes("app.use('/api/order-assignments'"));
});
