import assert from 'node:assert/strict';
import test from 'node:test';
import { HUB_BREAK_GLASS_EMAIL } from './hubAccess';
import { buildTeamAccess, isAdminClaim, parseTeamAccessResponse } from './teamAccess';

test('parseTeamAccessResponse devuelve el JSON si la respuesta es 200', async () => {
  const body = { available: true, members: [{ name: 'A', active: true, canEditSchedules: false }] };
  assert.deepEqual(await parseTeamAccessResponse(Response.json(body)), body);
});

test('parseTeamAccessResponse lanza el mensaje del servidor en errores', async () => {
  await assert.rejects(parseTeamAccessResponse(Response.json({ error: 'Solo editores.' }, { status: 403 })), /Solo editores\./);
});

test('parseTeamAccessResponse sin cuerpo útil lanza Error HTTP', async () => {
  await assert.rejects(parseTeamAccessResponse(new Response('x', { status: 500 })), /Error HTTP 500/);
});

test('parseTeamAccessResponse rechaza una forma inesperada', async () => {
  await assert.rejects(parseTeamAccessResponse(Response.json({ nada: 1 })), /respuesta inesperada/i);
});

const auth = (uid: string, over: Partial<{ email: string | null; displayName: string | null; customClaims: Record<string, unknown> | null }> = {}) =>
  ({ uid, email: null, displayName: null, customClaims: null, ...over });

test('usuario del Hub activo sin claim → acceso sí, edita no', () => {
  const out = buildTeamAccess([{ uid: 'u1', data: { activo: true, operadorNombre: 'Edgar' } }], [auth('u1')]);
  assert.deepEqual(out, [{ name: 'Edgar', active: true, canEditSchedules: false }]);
});

test('usuario del Hub con activo false → acceso no', () => {
  const [m] = buildTeamAccess([{ uid: 'u1', data: { activo: false, operadorNombre: 'Ana' } }], [auth('u1')]);
  assert.equal(m.active, false);
});

test('admin de Auth sin documento en el Hub → aparece, sin acceso, con permiso de editar', () => {
  const [m] = buildTeamAccess([], [auth('u2', { displayName: 'Rosa', customClaims: { admin: true } })]);
  assert.deepEqual(m, { name: 'Rosa', active: false, canEditSchedules: true });
});

test('admin con el correo break-glass sin documento → acceso sí', () => {
  const [m] = buildTeamAccess([], [auth('u3', { email: HUB_BREAK_GLASS_EMAIL, displayName: 'Emiliano', customClaims: { admin: true } })]);
  assert.equal(m.active, true);
});

test('documento del Hub sin usuario de Auth → aparece con el nombre del Hub', () => {
  const [m] = buildTeamAccess([{ uid: 'x', data: { activo: true, operadorNombre: 'Luis' } }], []);
  assert.deepEqual(m, { name: 'Luis', active: true, canEditSchedules: false });
});

test('nombre: operadorNombre → displayName → "Sin nombre", nunca el correo', () => {
  const out = buildTeamAccess(
    [{ uid: 'a', data: { activo: true, operadorNombre: 'Hub' } }, { uid: 'b', data: { activo: true } }, { uid: 'c', data: { activo: true } }],
    [auth('a', { displayName: 'Auth' }), auth('b', { displayName: 'Auth B' }), auth('c', { email: 'c@x.com' })],
  );
  assert.deepEqual(out.map(m => m.name).sort(), ['Auth B', 'Hub', 'Sin nombre'].sort());
});

test('isAdminClaim solo acepta admin === true', () => {
  assert.equal(isAdminClaim({ admin: true }), true);
  for (const c of [{ admin: 'true' }, {}, null, undefined]) assert.equal(isAdminClaim(c), false);
});

test('orden: con acceso primero, luego por nombre es-MX; sin uid ni correo en la salida', () => {
  const out = buildTeamAccess(
    [{ uid: '1', data: { activo: false, operadorNombre: 'Aaa' } }, { uid: '2', data: { activo: true, operadorNombre: 'Zeta' } }, { uid: '3', data: { activo: true, operadorNombre: 'Beto' } }],
    [auth('2', { email: 'z@x.com' })],
  );
  assert.deepEqual(out.map(m => m.name), ['Beto', 'Zeta', 'Aaa']);
  assert.ok(out.every(m => Object.keys(m).sort().join() === 'active,canEditSchedules,name'));
});

test('usuario de Auth sin Hub, sin claim y sin ser break-glass no aparece', () => {
  assert.deepEqual(buildTeamAccess([], [auth('anon'), auth('otro', { displayName: 'De otra app' })]), []);
});

test('el correo break-glass aparece aunque no tenga claim ni documento', () => {
  const out = buildTeamAccess([], [auth('bg', { email: HUB_BREAK_GLASS_EMAIL, displayName: 'Emiliano' })]);
  assert.deepEqual(out, [{ name: 'Emiliano', active: true, canEditSchedules: false }]);
});

test('sin datos → lista vacía', () => {
  assert.deepEqual(buildTeamAccess([], []), []);
});
