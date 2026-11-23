import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express, { type NextFunction, type Request, type Response } from 'express';
import { crearAuthApi, esEmailVerificado, extractBearerToken } from '../../shared/firebaseTokenPolicy';
import { crearVerificadorHub } from '../../shared/hubAccess';
import { createMemoryRateLimiter } from '../../shared/rateLimit';
import {
  createInvoiceRequests, isValidRequestId, lookupIdempotentReplay, normalizeIdempotencyKey,
  normalizeInvoiceRequests, parseCreateRequestsBody, recordIdempotencyKey,
  type InvoiceRequestsState, type RequestActor, type RequestableOrder,
} from '../../shared/invoiceRequests';

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

async function createTestServer(opts?: { rateLimitMax?: number }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const hubDocs: Record<string, unknown> = {
    'op-uid': { activo: true, operadorNombre: 'Ana Operadora' },
    'tv-uid': { activo: true, operadorNombre: 'Pantalla TV', rol: 'tv' },
  };
  const hubCheck = crearVerificadorHub(async uid => hubDocs[uid]);

  app.use('/api', crearAuthApi(async token => token !== 'invalid-token'));
  app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
    const actor = res.locals.actor as RequestActor;
    const token = extractBearerToken(req.headers.authorization);
    const access = await hubCheck.withWrite(actor.uid, actor.email, esEmailVerificado(token));
    if (!access.allowed) {
      res.status(403).json({ error: 'Sin acceso' });
      return;
    }
    res.locals.canWrite = access.canWrite;
    next();
  });

  const limiter = createMemoryRateLimiter({ maxRequests: opts?.rateLimitMax ?? 10, windowMs: 60_000 });
  const requireWrite = (_req: Request, res: Response, next: NextFunction) => {
    if (res.locals.canWrite !== true) {
      res.status(403).json({ error: 'Solo lectura' });
      return;
    }
    next();
  };

  let state: InvoiceRequestsState = normalizeInvoiceRequests(null);
  let seq = 0;
  const orders: RequestableOrder[] = [
    { id: 10, name: '2026/S00010', partner_name: 'Cliente Test', lines: [{ id: 1, name: 'Placa', qty: 5, delivered: 0 }] },
  ];

  app.get('/api/ping', limiter, (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/invoice-requests', requireWrite, limiter, (req, res) => {
    let key: string | null = null;
    try {
      key = normalizeIdempotencyKey(req.get('Idempotency-Key'));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }
    let drafts;
    try {
      drafts = parseCreateRequestsBody(req.body);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }
    const payloadHash = createHash('sha256').update(JSON.stringify(drafts)).digest('hex');
    const replay = lookupIdempotentReplay(state, key, payloadHash);
    if (replay.status === 'conflict') {
      res.status(409).json({ error: 'Conflicto de Idempotency-Key' });
      return;
    }
    if (replay.status === 'hit') {
      res.json({ state, created: replay.created, skipped: [], replayed: true });
      return;
    }
    const now = '2026-11-23T12:00:00.000Z';
    const actor = res.locals.actor as RequestActor;
    const out = createInvoiceRequests(state, drafts, orders, { actor, now, newId: () => `req-${++seq}` });
    if (out.created.length > 0) {
      state = recordIdempotencyKey(out.state, key, payloadHash, out.created.map(r => r.id), now);
    }
    res.json({ state, created: out.created, skipped: out.skipped });
  });

  app.post('/api/invoice-requests/:id/done', requireWrite, limiter, (req, res) => {
    const id = String(req.params.id ?? '');
    if (!isValidRequestId(id)) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    res.json({ id, ok: true });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: 'JSON inválido' });
      return;
    }
    res.status(500).json({ error: 'Error interno' });
  });

  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => server.close(err => (err ? reject(err) : resolve()))),
  };
}

test('integración HTTP: auth, RBAC solo lectura, cabeceras, rate limit, idempotencia y validación', async () => {
  const srv = await createTestServer({ rateLimitMax: 4 });
  const opToken = makeJwt({ sub: 'op-uid', email: 'op@smv.mx', email_verified: true, firebase: { sign_in_provider: 'password' } });
  const tvToken = makeJwt({ sub: 'tv-uid', email: 'tv@smv.mx', email_verified: true, firebase: { sign_in_provider: 'password' } });
  const anonToken = makeJwt({ sub: 'anon-1', firebase: { sign_in_provider: 'anonymous' } });

  try {
    // 1. Sin token → 401 + cabeceras de seguridad
    const noAuth = await fetch(`${srv.baseUrl}/api/ping`);
    assert.equal(noAuth.status, 401);
    assert.equal(noAuth.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(noAuth.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(noAuth.headers.get('cache-control'), 'no-store');

    // 2. Sesión anónima → 403
    const anonRes = await fetch(`${srv.baseUrl}/api/ping`, { headers: { Authorization: `Bearer ${anonToken}` } });
    assert.equal(anonRes.status, 403);

    // 3. Cuenta TV solo lectura puede GET pero recibe 403 en POST
    const tvGet = await fetch(`${srv.baseUrl}/api/ping`, { headers: { Authorization: `Bearer ${tvToken}` } });
    assert.equal(tvGet.status, 200);
    const tvPost = await fetch(`${srv.baseUrl}/api/invoice-requests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tvToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ orderId: 10, type: 'remision', lines: [{ lineId: 1, qty: 1 }] }]),
    });
    assert.equal(tvPost.status, 403);

    // 4. Idempotency-Key: primer POST crea, segundo replay sin duplicar, payload distinto → 409
    const body1 = JSON.stringify([{ orderId: 10, type: 'remision', lines: [{ lineId: 1, qty: 2 }] }]);
    const r1 = await fetch(`${srv.baseUrl}/api/invoice-requests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opToken}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'idem-test-0001' },
      body: body1,
    });
    assert.equal(r1.status, 200);
    const j1 = await r1.json() as { created: Array<{ id: string }>; replayed?: boolean };
    assert.equal(j1.created.length, 1);
    assert.equal(j1.replayed, undefined);

    const r2 = await fetch(`${srv.baseUrl}/api/invoice-requests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opToken}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'idem-test-0001' },
      body: body1,
    });
    assert.equal(r2.status, 200);
    const j2 = await r2.json() as { created: Array<{ id: string }>; replayed?: boolean };
    assert.equal(j2.replayed, true);
    assert.deepEqual(j2.created.map(x => x.id), j1.created.map(x => x.id));

    const rConflict = await fetch(`${srv.baseUrl}/api/invoice-requests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opToken}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'idem-test-0001' },
      body: JSON.stringify([{ orderId: 10, type: 'remision', lines: [{ lineId: 1, qty: 1 }] }]),
    });
    assert.equal(rConflict.status, 409);

    // 5. ID inválido → 400; 5ta llamada de opToken dispara 429 con Retry-After
    const badId = await fetch(`${srv.baseUrl}/api/invoice-requests/bad!id/done`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opToken}` },
    });
    assert.equal(badId.status, 400);

    const limited = await fetch(`${srv.baseUrl}/api/ping`, {
      headers: { Authorization: `Bearer ${opToken}` },
    });
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) >= 1);
  } finally {
    await srv.close();
  }
});
