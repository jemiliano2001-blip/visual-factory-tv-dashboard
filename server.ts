/**
 * server.ts — Servidor proxy Express para la API JSON-RPC de Odoo
 *
 * Propósito: Evitar CORS y proteger las credenciales de Odoo del lado del servidor.
 * Corre en un puerto separado (por defecto 3001) en paralelo con Vite dev (3000).
 *
 * Endpoints:
 *   GET /api/odoo/invoiceable-orders  → Órdenes de venta con invoice_status = 'to invoice'
 *   GET /api/odoo/status              → Estado de conexión con Odoo
 */

import express, { Request, Response, NextFunction } from 'express';
import * as dotenv from 'dotenv';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { OdooClient } from './shared/odooClient.ts';
import { crearAuthApi, extractBearerToken } from './shared/firebaseTokenPolicy.ts';
import {
  assignOrders, claimOrders, followOrders, normalizeOrderAssignments, parseAssignBody, parseOrderKeys, releaseOrders,
  type OrderAssignmentsPayload,
} from './shared/orderAssignments.ts';
import {
  createInvoiceRequests, loadOrderSnapshots, markInvoiceRequestDone, normalizeInvoiceRequests, parseCreateRequestsBody,
  reconcileWithOdoo, type InvoiceRequestsState, type OdooOrderSnapshot, type RequestActor,
} from './shared/invoiceRequests.ts';
import { isKnownSatCode } from './shared/satCatalogServer.ts';

// Carga .env.local primero (alta prioridad, no se sube a git),
// luego .env como fallback — mismo orden que Vite en desarrollo local.
if (existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
}
dotenv.config(); // carga .env como fallback (no sobreescribe variables ya definidas)

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Cabeceras de seguridad básicas en todas las respuestas
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ─── CORS — solo permite el frontend Vite ─────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3010',
    'http://localhost:4173',
    process.env.APP_URL || '',
  ].filter(Boolean);

  res.setHeader('Vary', 'Origin');
  const origin = req.headers.origin || '';
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// ─── Firebase API Key (para verificar ID tokens sin firebase-admin) ───────────
let FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || '';
if (!FIREBASE_API_KEY && existsSync('./firebase-applet-config.json')) {
  try {
    const cfg = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf-8')) as { apiKey?: string };
    FIREBASE_API_KEY = cfg.apiKey || '';
  } catch {
    console.warn('[Auth] No se pudo leer firebase-applet-config.json');
  }
}

// Caché en memoria de tokens ya verificados (clave → expiración). Evita una
// llamada a Google por cada poll (cada 5 min × pantallas activas).
const MAX_TOKEN_CACHE = 500;
const DEFAULT_TOKEN_TTL_MS = 5 * 60 * 1000;
function jwtExpirationMs(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp?: unknown };
    if (typeof payload.exp === 'number' && Number.isFinite(payload.exp)) {
      return Math.min(payload.exp * 1000, Date.now() + DEFAULT_TOKEN_TTL_MS);
    }
  } catch {
    // fallback al TTL fijo
  }
  return Date.now() + DEFAULT_TOKEN_TTL_MS;
}

const tokenCache = new Map<string, number>();
setInterval(() => {
  const now = Date.now();
  for (const [k, expiresAt] of tokenCache) if (now > expiresAt) tokenCache.delete(k);
}, 10 * 60 * 1000).unref();

async function verifyFirebaseToken(token: string): Promise<boolean> {
  const expiresAt = tokenCache.get(token);
  if (expiresAt && Date.now() < expiresAt) return true;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return false;
    const data = await res.json() as { users?: unknown[] };
    if (!data.users?.[0]) return false;
    const expMs = jwtExpirationMs(token);
    if (expMs > Date.now()) {
      if (!tokenCache.has(token) && tokenCache.size >= MAX_TOKEN_CACHE) {
        const oldest = tokenCache.keys().next().value;
        if (oldest !== undefined) tokenCache.delete(oldest);
      }
      tokenCache.set(token, expMs);
    }
    return true;
  } catch {
    return false;
  }
}

// ─── Seguridad (Auth Middleware) ──────────────────────────────────────────────
// Verifica Firebase ID tokens. El bypass de auth para conexiones locales es
// OPT-IN explícito (DEV_AUTH_BYPASS=true), de modo que falla CERRADO: si la
// variable se olvida en producción, se exige token igual. No depender de
// NODE_ENV: el túnel Cloudflare llega por 127.0.0.1 y "parecería" local, lo que
// dejaría todo abierto si NODE_ENV no fuera 'production'.
const authApi = crearAuthApi(verifyFirebaseToken);
app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
  if (process.env.DEV_AUTH_BYPASS === 'true') {
    const addr = req.socket.remoteAddress ?? '';
    if (addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1') {
      res.locals.actor = { uid: 'dev-local', email: null, name: 'Desarrollo local' };
      return next();
    }
  }

  const token = extractBearerToken(req.headers.authorization);
  if (token && !FIREBASE_API_KEY) {
    res.status(500).json({ error: 'Server misconfiguration: FIREBASE_API_KEY no configurado.' });
    return;
  }

  await authApi(req, res, next);
});

// ─── Configuración Odoo ────────────────────────────────────────────────────────
const odooClient = new OdooClient({
  url: process.env.ODOO_URL || '',
  db: process.env.ODOO_DB || '',
  username: process.env.ODOO_USERNAME || '',
  password: process.env.ODOO_PASSWORD || '',
});
const ODOO_URL = odooClient.getConfiguredUrl();
const PORT = parseInt(process.env.ODOO_PROXY_PORT || '3001', 10);

// Validación al arrancar
if (!odooClient.isConfigured()) {
  console.warn(
    '⚠️  [Odoo Proxy] Faltan variables de entorno ODOO_URL / ODOO_DB / ODOO_USERNAME / ODOO_PASSWORD.\n' +
    '   Copia .env.example a .env y completa los valores.'
  );
}

// ─── Chrome DevTools well-known endpoint (silences browser console noise) ────
// Chrome 136+ probes every local server for this file to enable DevTools features.
app.get('/.well-known/appspecific/com.chrome.devtools.json', (_req: Request, res: Response) => {
  res.json({ version: '1.0' });
});

// ─── GET /api/odoo/status ─────────────────────────────────────────────────────
app.get('/api/odoo/status', async (_req: Request, res: Response) => {
  if (!ODOO_URL) {
    res.status(503).json({
      connected: false,
      message: 'Variables de entorno de Odoo no configuradas',
    });
    return;
  }

  try {
    const session = await odooClient.getSession();
    await odooClient.odooCall('res.users', 'read', [[session.uid]], { fields: ['login'] });
    res.json({ connected: true, message: 'Conectado a Odoo correctamente', url: ODOO_URL });
  } catch (err) {
    console.error('[Odoo] Error en /api/odoo/status:', err);
    res.status(503).json({ connected: false, message: 'No se pudo conectar con Odoo.' });
  }
});

app.get('/api/odoo/invoiceable-orders', async (_req: Request, res: Response) => {
  if (!odooClient.isConfigured()) {
    res.status(503).json({
      error: 'Odoo no configurado. Revisa las variables de entorno ODOO_*.',
      orders: [],
    });
    return;
  }

  try {
    const { orders, truncated } = await odooClient.fetchInvoiceableOrdersCached();
    res.json({ orders, total: orders.length, truncated, lastUpdated: new Date().toISOString() });

  } catch (err) {
    console.error('[Odoo] Error al obtener órdenes:', err);
    res.status(500).json({ error: 'Error al consultar las órdenes en Odoo.', orders: [] });
  }
});

// ─── Asignación de órdenes a ingenieros SMV ───────────────────────────────────
// Persistencia local en archivo (ignorado por git); en Firebase vive en Firestore.
const isActor = (a: unknown): a is RequestActor => typeof a === 'object' && a !== null && typeof (a as RequestActor).uid === 'string';
const NO_ACTOR = 'Se requiere una cuenta de personal SMV.';
const ASSIGNMENTS_FILE = resolve(process.cwd(), '.local-order-assignments.json');

function writeJsonAtomic(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  renameSync(tmpPath, filePath);
}

function readAssignments(): OrderAssignmentsPayload {
  try {
    return normalizeOrderAssignments(JSON.parse(readFileSync(ASSIGNMENTS_FILE, 'utf-8')));
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return normalizeOrderAssignments(null);
    throw err;
  }
}

// El servidor local no lee el Hub ni Firebase Auth: la lista de acceso solo existe en producción.
app.get('/api/team-access', (_req: Request, res: Response) => {
  res.json({ available: false, members: [] });
});

app.get('/api/order-assignments', (_req: Request, res: Response) => {
  try {
    res.json(readAssignments());
  } catch (err) {
    console.error('[Assignments] Error leyendo asignaciones:', err);
    res.status(500).json({ error: 'No se pudieron leer las asignaciones.' });
  }
});

const changeAssignments = (mutate: (current: OrderAssignmentsPayload, actor: RequestActor, keys: string[]) => OrderAssignmentsPayload) =>
  (req: Request, res: Response) => {
    const actor = res.locals.actor;
    if (!isActor(actor)) {
      res.status(403).json({ error: NO_ACTOR });
      return;
    }
    let keys: string[];
    try {
      keys = parseOrderKeys(req.body);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'orderKeys inválido.' });
      return;
    }
    try {
      const next = mutate(readAssignments(), actor, keys);
      writeJsonAtomic(ASSIGNMENTS_FILE, next);
      res.json(next);
    } catch (err) {
      console.error('[Assignments] Error guardando asignaciones:', err);
      res.status(500).json({ error: 'No se pudieron guardar las asignaciones.' });
    }
  };

app.post('/api/order-assignments/claim', changeAssignments((cur, actor, keys) => claimOrders(cur, actor, keys)));
app.post('/api/order-assignments/follow', changeAssignments((cur, actor, keys) => followOrders(cur, actor, keys)));
app.post('/api/order-assignments/release', changeAssignments((cur, actor, keys) => releaseOrders(cur, actor.uid, keys)));
app.post('/api/order-assignments/assign', (req: Request, res: Response) => {
  const actor = res.locals.actor;
  if (!isActor(actor)) {
    res.status(403).json({ error: NO_ACTOR });
    return;
  }
  let parsed: ReturnType<typeof parseAssignBody>;
  try {
    parsed = parseAssignBody(req.body);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Datos de asignación inválidos.' });
    return;
  }
  try {
    const next = assignOrders(readAssignments(), actor, parsed.orderKeys, parsed.target);
    writeJsonAtomic(ASSIGNMENTS_FILE, next);
    res.json(next);
  } catch (err) {
    console.error('[Assignments] Error asignando ingeniero:', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'No se pudieron guardar las asignaciones.' });
  }
});

// ─── Solicitudes de factura/remisión ──────────────────────────────────────────
// Persistencia local en archivo (ignorado por git); en Firebase vive en Firestore.
const REQUESTS_FILE = resolve(process.cwd(), '.local-invoice-requests.json');

function readRequests(): InvoiceRequestsState {
  try {
    return normalizeInvoiceRequests(JSON.parse(readFileSync(REQUESTS_FILE, 'utf-8')));
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return normalizeInvoiceRequests(null);
    throw err;
  }
}


// Al leer, marca "hecha" lo que Odoo ya cumplió y agrega el avance. Si Odoo falla, devuelve lo guardado.
app.get('/api/invoice-requests', async (_req: Request, res: Response) => {
  try {
    const stored = readRequests();
    let orders: OdooOrderSnapshot[] = [];
    if (odooClient.isConfigured()) {
      try {
        orders = await loadOrderSnapshots(stored, {
          fetchCached: () => odooClient.fetchInvoiceableOrdersCached(),
          fetchByIds: ids => odooClient.fetchOrdersByIds(ids),
        });
      } catch (err) {
        console.warn('solicitudes: no se pudo consultar Odoo, se devuelve lo guardado:', err);
        res.json({ ...stored, progress: {} });
        return;
      }
    }
    // Sin await entre leer y escribir: otra petición no puede intercalarse.
    const current = readRequests();
    const out = reconcileWithOdoo(current, orders, new Date().toISOString());
    if (out.state !== current) writeJsonAtomic(REQUESTS_FILE, out.state);
    res.json({ ...out.state, progress: out.progress });
  } catch (err) {
    console.error('[InvoiceRequests] Error en GET:', err);
    res.status(500).json({ error: 'No se pudieron consultar las solicitudes.' });
  }
});

app.post('/api/invoice-requests', async (req: Request, res: Response) => {
  const actor = res.locals.actor;
  if (!isActor(actor)) { res.status(403).json({ error: NO_ACTOR }); return; }
  let drafts;
  try {
    drafts = parseCreateRequestsBody(req.body);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Solicitud inválida.' });
    return;
  }
  if (!odooClient.isConfigured()) { res.status(503).json({ error: 'Odoo no configurado.' }); return; }
  let orders;
  try {
    orders = (await odooClient.fetchInvoiceableOrders()).orders; // sin caché: las cantidades deben ser las de ahora
  } catch {
    res.status(503).json({ error: 'No se pudo consultar Odoo; no se guardó nada.' });
    return;
  }
  // Sin await entre leer y escribir: otra petición no puede intercalarse.
  try {
    const out = createInvoiceRequests(readRequests(), drafts, orders, { actor, now: new Date().toISOString(), newId: randomUUID, isKnownSatCode });
    if (out.created.length > 0) {
      writeJsonAtomic(REQUESTS_FILE, out.state);
      odooClient.invalidateOrdersCache();
    }
    res.json({ state: out.state, created: out.created, skipped: out.skipped, notified: false, emailed: false });
  } catch (err) {
    console.error('[InvoiceRequests] Error en POST:', err);
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('tamaño máximo')) {
      res.status(409).json({ error: msg });
      return;
    }
    res.status(500).json({ error: 'No se pudieron crear las solicitudes.' });
  }
});

app.post('/api/invoice-requests/:id/done', (req: Request, res: Response) => {
  const actor = res.locals.actor;
  if (!isActor(actor)) { res.status(403).json({ error: NO_ACTOR }); return; }
  try {
    const current = readRequests();
    const next = markInvoiceRequestDone(current, String(req.params.id), { actor, now: new Date().toISOString() });
    if (next !== current) writeJsonAtomic(REQUESTS_FILE, next);
    res.json(next);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'No se encontró la solicitud.') {
      res.status(404).json({ error: msg });
      return;
    }
    console.error('[InvoiceRequests] Error en POST done:', err);
    res.status(500).json({ error: 'No se pudo actualizar la solicitud.' });
  }
});

app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Ruta API no encontrada.' });
});

// ─── Frontend en producción ──────────────────────────────────────────────────
// Si existe dist/ (tras `npm run build`), el mismo proceso sirve la SPA. Así todo
// queda en un solo origen/puerto detrás del túnel de Cloudflare. En dev no existe
// dist/, así que esto no interfiere con Vite.
const distDir = resolve(process.cwd(), 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA fallback: cualquier ruta de cliente (/admin, /stats) devuelve index.html.
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(resolve(distDir, 'index.html'));
  });
  console.log(`   Sirviendo frontend desde ${distDir}`);
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'JSON inválido en la solicitud.' });
    return;
  }
  console.error('[Server] Error no controlado:', err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

const server = app.listen(PORT, () => {
  console.log(`\n🚀 Odoo Proxy corriendo en http://localhost:${PORT}`);
  console.log(`   Odoo URL: ${ODOO_URL || '⚠️  No configurada'}`);
  console.log(`   Endpoints:`);
  console.log(`     GET http://localhost:${PORT}/api/odoo/status`);
  console.log(`     GET http://localhost:${PORT}/api/odoo/invoiceable-orders\n`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
