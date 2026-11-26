import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequestContextMiddleware, resolveRequestId, type RequestLogInfo } from './requestContext';

test('resolveRequestId conserva IDs válidos y reemplaza valores ausentes o inseguros', () => {
  assert.equal(resolveRequestId('req-abc-12345'), 'req-abc-12345');
  assert.equal(resolveRequestId(['trace_01.xyz', 'other']), 'trace_01.xyz');

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert.match(resolveRequestId(undefined), uuidRegex);
  assert.match(resolveRequestId('corto'), uuidRegex);
  assert.match(resolveRequestId('bad\nid-injection'), uuidRegex);
  assert.match(resolveRequestId('bad space id 123'), uuidRegex);
});

test('createRequestContextMiddleware propaga X-Request-Id y registra métricas sin query string', () => {
  const logs: RequestLogInfo[] = [];
  const mw = createRequestContextMiddleware(info => logs.push(info));

  const headers: Record<string, string> = {};
  let finishCb: (() => void) | null = null;
  const captureFinish = (fn: () => void) => {
    finishCb = fn;
  };
  let nextCalled = false;

  const res = {
    statusCode: 200,
    locals: { actor: { uid: 'uid-99' } } as Record<string, unknown>,
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    on(event: 'finish', listener: () => void) {
      if (event === 'finish') captureFinish(listener);
    },
  };

  mw(
    {
      headers: { 'x-request-id': 'client-trace-42' },
      method: 'post',
      originalUrl: '/api/invoice-requests?secret=123',
    },
    res,
    () => {
      nextCalled = true;
    },
  );

  assert.equal(nextCalled, true);
  assert.equal(res.locals.requestId, 'client-trace-42');
  assert.equal(headers['X-Request-Id'], 'client-trace-42');
  if (!finishCb) assert.fail('Expected finish listener');
  (finishCb as () => void)();

  assert.equal(logs.length, 1);
  assert.equal(logs[0].requestId, 'client-trace-42');
  assert.equal(logs[0].method, 'POST');
  assert.equal(logs[0].path, '/api/invoice-requests');
  assert.equal(logs[0].statusCode, 200);
  assert.equal(logs[0].actorUid, 'uid-99');
});
