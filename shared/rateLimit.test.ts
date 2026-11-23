import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryRateLimiter } from './rateLimit';

function invoke(limiter: ReturnType<typeof createMemoryRateLimiter>, uid: string) {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body: unknown = null;
  let nextCalled = false;
  limiter(
    { ip: '127.0.0.1' },
    {
      locals: { actor: { uid } },
      setHeader(name, value) { headers[name] = value; },
      status(code) {
        statusCode = code;
        return { json(b) { body = b; return b; } };
      },
    },
    () => { nextCalled = true; },
  );
  return { statusCode, body, headers, nextCalled };
}

test('rate limiter permite hasta maxRequests, luego responde 429 con Retry-After y recupera tras ventana', () => {
  let t = 1_000;
  const limiter = createMemoryRateLimiter({ maxRequests: 2, windowMs: 60_000, now: () => t });

  assert.equal(invoke(limiter, 'u1').nextCalled, true);
  t += 10_000;
  assert.equal(invoke(limiter, 'u1').nextCalled, true);

  const blocked = invoke(limiter, 'u1');
  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers['Retry-After'], '50');

  // Otro usuario mantiene su propia cuota
  assert.equal(invoke(limiter, 'u2').nextCalled, true);

  // Avanza más allá de la primera petición
  t = 62_000;
  assert.equal(invoke(limiter, 'u1').nextCalled, true);
});
