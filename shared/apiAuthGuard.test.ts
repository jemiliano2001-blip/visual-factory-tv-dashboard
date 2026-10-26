import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createApiAuthGuard } from './apiAuthGuard.ts';

const jwt = (p: Record<string, unknown>) =>
  `${Buffer.from('{"alg":"RS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(p)).toString('base64url')}.firma`;
const REAL = jwt({ firebase: { sign_in_provider: 'password' } });
const ANON = jwt({ firebase: { sign_in_provider: 'anonymous' } });

async function withApp(fn: (base: string) => Promise<void>) {
  const app = express();
  app.use('/api', createApiAuthGuard(async (t) => t === REAL || t === ANON));
  app.get('/api/odoo/invoiceable-orders', (_q, r) => { r.json({ orders: [{ id: 1 }] }); });
  app.get('/api/odoo/status', (_q, r) => { r.json({ connected: true }); });
  const srv = app.listen(0);
  try { await fn(`http://127.0.0.1:${(srv.address() as AddressInfo).port}`); } finally { srv.close(); }
}

for (const ruta of ['/api/odoo/invoiceable-orders', '/api/odoo/status']) {
  test(`${ruta}: sin token → 401, token inválido → 401, anónimo → 403, cuenta real → 200`, () =>
    withApp(async (base) => {
      assert.equal((await fetch(base + ruta)).status, 401);
      assert.equal((await fetch(base + ruta, { headers: { Authorization: 'Bearer basura' } })).status, 401);
      assert.equal((await fetch(base + ruta, { headers: { Authorization: `Bearer ${ANON}` } })).status, 403);
      const ok = await fetch(base + ruta, { headers: { Authorization: `Bearer ${REAL}` } });
      assert.equal(ok.status, 200);
      assert.ok(Object.keys(await ok.json()).length > 0);
    }));
}

// La Cloud Function `api` (la que sirve /api/** en producción vía rewrite de Hosting)
// y server.ts deben usar el mismo guard; antes la Function aceptaba tokens anónimos.
for (const f of ['functions/src/index.ts', 'server.ts']) {
  test(`${f} protege /api con createApiAuthGuard`, () => {
    const src = readFileSync(resolve(import.meta.dirname, '..', f), 'utf8');
    assert.match(src, /app\.use\(\s*'\/api',\s*createApiAuthGuard\(/);
  });
}
