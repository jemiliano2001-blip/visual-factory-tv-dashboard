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
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { runGeminiGenerate } from './shared/geminiProxy.ts';
import { OdooClient } from './shared/odooClient.ts';

// Carga .env.local primero (alta prioridad, no se sube a git),
// luego .env como fallback — mismo orden que Vite en desarrollo local.
if (existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
}
dotenv.config(); // carga .env como fallback (no sobreescribe variables ya definidas)

const app = express();
app.use(express.json());

// ─── CORS — solo permite el frontend Vite ─────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:4173',
    process.env.APP_URL || '',
  ].filter(Boolean);

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
// llamada a Google por cada poll (cada 30s × usuarios activos).
const tokenCache = new Map<string, number>();
setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of tokenCache) if (now > exp) tokenCache.delete(k);
}, 10 * 60 * 1000);

async function verifyFirebaseToken(token: string): Promise<boolean> {
  const cached = tokenCache.get(token);
  if (cached && Date.now() < cached) return true;
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
    if (!data.users?.length) return false;
    tokenCache.set(token, Date.now() + 5 * 60 * 1000); // caché 5 min
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
app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
  if (process.env.DEV_AUTH_BYPASS === 'true') {
    const addr = req.socket.localAddress ?? '';
    if (addr === '127.0.0.1' || addr === '::1') return next();
  }

  const token = req.headers.authorization?.replace('Bearer ', '') || '';
  if (!token) {
    res.status(401).json({ error: 'Se requiere autenticación.' });
    return;
  }

  if (!FIREBASE_API_KEY) {
    res.status(500).json({ error: 'Server misconfiguration: FIREBASE_API_KEY no configurado.' });
    return;
  }

  const valid = await verifyFirebaseToken(token).catch(() => false);
  if (!valid) {
    res.status(401).json({ error: 'Token inválido o expirado. Vuelve a iniciar sesión.' });
    return;
  }

  next();
});

// ─── Gemini AI Proxy ────────────────────────────────────────────────────────
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.post('/api/ai/generate', async (req: Request, res: Response) => {
  if (!process.env.GEMINI_API_KEY) {
    res.status(503).json({ error: 'GEMINI_API_KEY no configurada en el servidor.' });
    return;
  }

  try {
    const result = await runGeminiGenerate(
      (model, contents, config) =>
        ai.models.generateContent({ model, contents, config } as Parameters<typeof ai.models.generateContent>[0])
          .then(response => ({ text: response.text, candidates: response.candidates })),
      req.body,
    );
    if (result.ok === false) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result.payload);
  } catch (err) {
    console.error('[Gemini AI Error]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Configuración Odoo ────────────────────────────────────────────────────────
const odooClient = new OdooClient({
  url: process.env.ODOO_URL || '',
  db: process.env.ODOO_DB || '',
  username: process.env.ODOO_USERNAME || '',
  password: process.env.ODOO_PASSWORD || '',
});
const ODOO_URL      = odooClient.getConfiguredUrl();
const ODOO_DB       = process.env.ODOO_DB        || '';
const ODOO_USERNAME = process.env.ODOO_USERNAME  || '';
const ODOO_PASSWORD = process.env.ODOO_PASSWORD  || '';
const PORT          = parseInt(process.env.ODOO_PROXY_PORT || '3001', 10);

// Validación al arrancar
if (!odooClient.isConfigured()) {
  console.warn(
    '⚠️  [Odoo Proxy] Faltan variables de entorno ODOO_URL / ODOO_DB / ODOO_USERNAME / ODOO_PASSWORD.\n' +
    '   Copia .env.example a .env y completa los valores.'
  );
}

export async function fetchInvoiceableOrders() {
  return odooClient.fetchInvoiceableOrders();
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
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ connected: false, message: msg });
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
    const normalized = await fetchInvoiceableOrders();
    console.log(`[Odoo] Retornando ${normalized.length} órdenes a facturar`);
    res.json({ orders: normalized, total: normalized.length, lastUpdated: new Date().toISOString() });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Odoo] Error al obtener órdenes:', msg);
    res.status(500).json({ error: msg, orders: [] });
  }
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

app.listen(PORT, () => {
  console.log(`\n🚀 Odoo Proxy corriendo en http://localhost:${PORT}`);
  console.log(`   Odoo URL: ${ODOO_URL || '⚠️  No configurada'}`);
  console.log(`   Endpoints:`);
  console.log(`     GET http://localhost:${PORT}/api/odoo/status`);
  console.log(`     GET http://localhost:${PORT}/api/odoo/invoiceable-orders\n`);
});
