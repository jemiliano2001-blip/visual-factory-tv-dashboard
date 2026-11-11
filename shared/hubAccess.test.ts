import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluarAccesoHub, crearVerificadorHub, HUB_BREAK_GLASS_EMAIL } from './hubAccess';

test('usuario activo del Hub entra y toma el nombre del operador', () => {
  assert.deepEqual(
    evaluarAccesoHub({ activo: true, operadorNombre: 'Aide' }, 'aide@smv.com'),
    { allowed: true, name: 'Aide' },
  );
});

test('usuario activo sin operador entra sin nombre', () => {
  assert.deepEqual(evaluarAccesoHub({ activo: true, operadorNombre: null }, 'a@smv.com'), { allowed: true, name: null });
  assert.deepEqual(evaluarAccesoHub({ activo: true, operadorNombre: '   ' }, 'a@smv.com'), { allowed: true, name: null });
});

test('inactivo, sin documento o campo activo no booleano true: no entra', () => {
  for (const doc of [{ activo: false }, undefined, null, {}, { activo: 'true' }, 'x', []]) {
    assert.equal(evaluarAccesoHub(doc, 'a@smv.com').allowed, false, JSON.stringify(doc));
  }
});

test('el correo de emergencia entra aunque no esté en el Hub, sin importar mayúsculas', () => {
  assert.equal(evaluarAccesoHub(undefined, HUB_BREAK_GLASS_EMAIL.toUpperCase()).allowed, true);
  assert.equal(evaluarAccesoHub({ activo: false }, HUB_BREAK_GLASS_EMAIL).allowed, true);
});

test('verificador: consulta una vez por uid dentro del TTL y vuelve a consultar al vencer', async () => {
  let calls = 0; let now = 1000;
  const check = crearVerificadorHub(async () => { calls++; return { activo: true, operadorNombre: 'Baez' }; }, { ttlMs: 60_000, now: () => now });
  assert.deepEqual(await check('u1', 'b@smv.com'), { allowed: true, name: 'Baez' });
  await check('u1', 'b@smv.com');
  assert.equal(calls, 1);
  now += 61_000;
  await check('u1', 'b@smv.com');
  assert.equal(calls, 2);
});

test('verificador: si la lectura falla, niega (falla cerrado) y no cachea el error', async () => {
  let fail = true; let calls = 0;
  const check = crearVerificadorHub(async () => { calls++; if (fail) throw new Error('boom'); return { activo: true }; }, { ttlMs: 60_000, now: () => 0 });
  await assert.rejects(() => check('u1', 'x@smv.com'), /boom/);
  fail = false;
  assert.equal((await check('u1', 'x@smv.com')).allowed, true);
  assert.equal(calls, 2);
});
