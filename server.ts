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
import { existsSync } from 'fs';
import { resolve } from 'node:path';
import { startNotifications } from './src/services/notificationService.js';

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// ─── Seguridad (Auth Middleware) ──────────────────────────────────────────────
// Solo gatea /api: los archivos estáticos del frontend los protege Cloudflare
// Access en el borde. El bearer es defensa en profundidad para el proxy de Odoo.
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  const apiSecret = process.env.API_SECRET;

  // Sin secreto configurado → solo se permite acceso local (conveniencia de dev).
  // En cuanto se define API_SECRET (despliegue real) se EXIGE siempre: nunca se
  // confía en la dirección de origen, que un reverse proxy reescribe a 127.0.0.1.
  if (!apiSecret) {
    const addr = req.socket.localAddress ?? '';
    if (addr === '127.0.0.1' || addr === '::1') return next();
    res.status(500).json({ error: 'Server misconfiguration: API_SECRET no configurado.' });
    return;
  }

  const clientSecret = req.headers.authorization?.replace('Bearer ', '');
  if (clientSecret !== apiSecret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
});

// ─── Configuración Odoo ────────────────────────────────────────────────────────
const ODOO_URL      = (process.env.ODOO_URL      || '').replace(/\/$/, '');
const ODOO_DB       = process.env.ODOO_DB        || '';
const ODOO_USERNAME = process.env.ODOO_USERNAME  || '';
const ODOO_PASSWORD = process.env.ODOO_PASSWORD  || '';
const PORT          = parseInt(process.env.ODOO_PROXY_PORT || '3001', 10);

// Validación al arrancar
if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_PASSWORD) {
  console.warn(
    '⚠️  [Odoo Proxy] Faltan variables de entorno ODOO_URL / ODOO_DB / ODOO_USERNAME / ODOO_PASSWORD.\n' +
    '   Copia .env.example a .env y completa los valores.'
  );
}

// ─── Utilidad: llamada JSON-RPC a Odoo con sesión ────────────────────────────

interface OdooSession {
  uid: number;
  sessionId: string; // cookie session_id de Odoo
}

/** Error específico: la sesión de Odoo caducó y hay que reautenticar. */
class OdooSessionExpiredError extends Error {}

// Sesión cacheada entre peticiones. Antes se autenticaba en CADA endpoint
// (2 sesiones nuevas en Odoo por ciclo de polling, nunca liberadas); la cookie
// de Odoo vive horas, así que se reutiliza y solo se renueva al expirar.
let sessionPromise: Promise<OdooSession> | null = null;
let reauthing: Promise<OdooSession> | null = null;

function getSession(forceNew = false): Promise<OdooSession> {
  if (forceNew || !sessionPromise) {
    sessionPromise = authenticate().catch(err => {
      sessionPromise = null; // no cachear intentos fallidos
      throw err;
    });
  }
  return sessionPromise;
}

async function authenticate(): Promise<OdooSession> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${ODOO_URL}/web/session/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        id: 1,
        params: {
          db: ODOO_DB,
          login: ODOO_USERNAME,
          password: ODOO_PASSWORD,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Error de autenticación HTTP: ${response.status}`);
    }

    const json = (await response.json()) as {
      result?: { uid: number | false };
      error?: { message: string };
    };

    if (json.error) {
      throw new Error(`Error de autenticación: ${json.error.message}`);
    }

    const uid = json.result?.uid;
    if (!uid) {
      throw new Error('Credenciales de Odoo incorrectas (uid es false)');
    }

    // Extraer la cookie session_id que Odoo usa para autorizar las llamadas RPC
    const setCookie = response.headers.get('set-cookie') || '';
    const sessionMatch = setCookie.match(/session_id=([^;]+)/);
    const sessionId = sessionMatch ? sessionMatch[1] : '';

    if (!sessionId) {
      console.warn('[Odoo] No se encontró session_id en la respuesta. Las llamadas RPC pueden fallar.');
    }

    return { uid, sessionId };
  } finally {
    clearTimeout(timeout);
  }
}

// Llamada RPC autenticada con cookie de sesión (Odoo 15+)
async function odooRpc<T = unknown>(
  session: OdooSession,
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {}
): Promise<T> {
  const body = {
    jsonrpc: '2.0',
    method: 'call',
    id: Math.floor(Math.random() * 100000),
    params: { model, method, args, kwargs },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(`${ODOO_URL}/web/dataset/call_kw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Pasar la cookie de sesión para que Odoo reconozca la autenticación
        ...(session.sessionId ? { Cookie: `session_id=${session.sessionId}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Odoo HTTP error: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as {
      result?: T;
      error?: { code?: number; message: string; data?: { message?: string; name?: string } };
    };

    if (json.error) {
      const msg = json.error.data?.message || json.error.message || 'Error desconocido de Odoo';
      // code 100 / SessionExpiredException = la cookie caducó: reautenticable
      if (json.error.code === 100 || json.error.data?.name === 'odoo.http.SessionExpiredException') {
        throw new OdooSessionExpiredError(msg);
      }
      throw new Error(`Odoo RPC Error: ${msg}`);
    }

    return json.result as T;
  } finally {
    clearTimeout(timeout);
  }
}

// RPC usando la sesión cacheada; si Odoo reporta sesión expirada, reautentica
// una vez y reintenta la misma llamada.
async function odooCall<T = unknown>(
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {}
): Promise<T> {
  try {
    return await odooRpc<T>(await getSession(), model, method, args, kwargs);
  } catch (err) {
    if (err instanceof OdooSessionExpiredError) {
      console.warn('[Odoo] Sesión expirada — reautenticando…');
      if (!reauthing) {
        reauthing = getSession(true).finally(() => { reauthing = null; });
      }
      return await odooRpc<T>(await reauthing, model, method, args, kwargs);
    }
    throw err;
  }
}

// ─── Tipos de respuesta de Odoo ───────────────────────────────────────────────
interface OdooRawOrderLine {
  id: number;
  name: string;
  /** 'line_section' | 'line_note' para líneas decorativas; false en productos */
  display_type: string | false;
  product_uom_qty: number;
  qty_delivered: number;
  price_unit: number;
  price_subtotal: number;
}

interface OdooRawOrder {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  amount_total: number;
  amount_untaxed: number;
  date_order: string;
  commitment_date: string | false;
  invoice_status: string;
  currency_id: [number, string] | false;
  order_line: number[];
  state: string;
  user_id: [number, string] | false;
}

interface OdooRawPicking {
  id: number;
  name: string;
  sale_id: [number, string] | false;
  origin: string | false;
  state: string;
  date_done: string | false;
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
    // Lectura mínima del propio usuario: valida que la sesión cacheada siga
    // viva y que Odoo responda, sin crear una sesión nueva por cada chequeo.
    const session = await getSession();
    await odooCall('res.users', 'read', [[session.uid]], { fields: ['login'] });
    res.json({ connected: true, message: 'Conectado a Odoo correctamente', url: ODOO_URL });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ connected: false, message: msg });
  }
});

export async function fetchInvoiceableOrders() {
  // 1) Buscar IDs de órdenes con invoice_status = 'to invoice'
  const orderIds = await odooCall<number[]>(
    'sale.order',
    'search',
    [[
      ['invoice_status', '=', 'to invoice'],
      ['state', 'in', ['sale', 'done']],
    ]],
    { limit: 500, order: 'commitment_date asc, date_order asc' }
  );

  if (orderIds.length === 0) {
    return [];
  }

  // 2) Leer los campos de las órdenes
  const orders = await odooCall<OdooRawOrder[]>(
    'sale.order',
    'read',
    [orderIds],
    {
      fields: [
        'name',
        'partner_id',
        'amount_total',
        'amount_untaxed',
        'date_order',
        'commitment_date',
        'invoice_status',
        'currency_id',
        'order_line',
        'state',
        'user_id',
      ],
    }
  );

  // 3) Leer TODAS las líneas de productos
  const allLineIds = orders.flatMap(o => o.order_line);
  const linesMap = new Map<number, OdooRawOrderLine>();
  const LINE_BATCH_SIZE = 500;

  for (let i = 0; i < allLineIds.length; i += LINE_BATCH_SIZE) {
    const lines = await odooCall<OdooRawOrderLine[]>(
      'sale.order.line',
      'read',
      [allLineIds.slice(i, i + LINE_BATCH_SIZE)],
      {
        fields: [
          'name',
          'display_type',
          'product_uom_qty',
          'qty_delivered',
          'price_unit',
          'price_subtotal',
        ],
      }
    );
    lines.forEach(l => linesMap.set(l.id, l));
  }

  // 4) Fetch remisiones (traslados de SALIDA) por origin (nombre de la SO)
  const pickingsByOrder = new Map<number, OdooRawPicking[]>();
  let allPickings: OdooRawPicking[] = [];
  try {
    // Construir mapa nombre→id para vincular pickings por origin
    const orderNameToId = new Map<string, number>();
    for (const o of orders) orderNameToId.set(o.name, o.id);
    const orderNames = orders.map(o => o.name);

    allPickings = await odooCall<OdooRawPicking[]>(
      'stock.picking',
      'search_read',
      [[
        ['origin', 'in', orderNames],
        ['picking_type_code', '=', 'outgoing'],
      ]],
      { fields: ['name', 'sale_id', 'origin', 'state', 'date_done'], limit: 5000 }
    );
    for (const p of allPickings) {
      // Vincular por origin (nombre de la SO) → id de la orden
      const originName = typeof p.origin === 'string' ? p.origin : null;
      const saleId = originName ? orderNameToId.get(originName) : null;
      if (!saleId) continue;
      if (!pickingsByOrder.has(saleId)) pickingsByOrder.set(saleId, []);
      pickingsByOrder.get(saleId)!.push(p);
    }
  } catch (err) {
    console.warn('[Odoo] No se pudieron cargar remisiones (stock.picking):', err instanceof Error ? err.message : err);
  }

  // 4b) Fetch líneas de movimiento (stock.move) por sale_line_id para cantidad real entregada
  const movesBySaleLine = new Map<number, number>();
  let fetchedMoves = false;
  try {
    // Buscar movimientos done directamente por sale_line_id (más confiable que picking_id)
    const allSaleLineIds = Array.from(linesMap.keys());
    if (allSaleLineIds.length > 0) {
      // Batches de 500 para no sobrecargar Odoo
      const MOVE_BATCH = 500;
      for (let i = 0; i < allSaleLineIds.length; i += MOVE_BATCH) {
        const batch = allSaleLineIds.slice(i, i + MOVE_BATCH);
        const moves = await odooCall<any[]>(
          'stock.move',
          'search_read',
          [[
            ['sale_line_id', 'in', batch],
            ['state', '=', 'done'],
            ['picking_code', '=', 'outgoing'],
          ]],
          { fields: ['sale_line_id', 'quantity_done'], limit: 10000 }
        );

        for (const m of moves) {
          const saleLineId = Array.isArray(m.sale_line_id) ? m.sale_line_id[0] : null;
          if (!saleLineId) continue;
          const doneQty = m.quantity_done ?? 0;
          const current = movesBySaleLine.get(saleLineId) || 0;
          movesBySaleLine.set(saleLineId, current + doneQty);
        }
      }
      fetchedMoves = true;
    }
  } catch (err) {
    console.warn('[Odoo] No se pudieron cargar movimientos (stock.move):', err instanceof Error ? err.message : err);
  }

  // 5) Construir respuesta normalizada
  const normalized = orders.map(order => {
    const lines = order.order_line
      .map(id => linesMap.get(id))
      .filter((l): l is OdooRawOrderLine => !!l && !l.display_type);

    const mainLine = lines[0];
    const mainProductName = mainLine?.name || 'Sin descripción';

    const totalQty     = lines.reduce((s, l) => s + l.product_uom_qty, 0);
    const deliveredQty = lines.reduce((s, l) => {
      const realDone = fetchedMoves ? (movesBySaleLine.get(l.id) || 0) : l.qty_delivered;
      return s + realDone;
    }, 0);

    // ponytail: montos y precios (amount_total/untaxed, price_unit/subtotal) son
    // CONFIDENCIALES y la UI no los muestra — no se envían al navegador. Si algún
    // día se necesita un KPI con montos, exponerlo por un endpoint aparte y con auth real.
    return {
      id:              order.id,
      name:            order.name,
      partner_name:    order.partner_id ? order.partner_id[1] : 'Desconocido',
      main_product:    mainProductName,
      date_order:      order.date_order,
      commitment_date: order.commitment_date || null,
      invoice_status:  order.invoice_status,
      currency:        order.currency_id ? order.currency_id[1] : 'MXN',
      qty_total:       totalQty,
      qty_delivered:   deliveredQty,
      state:           order.state,
      salesperson:     order.user_id ? order.user_id[1] : null,
      lines_count:     lines.length,
      lines: lines.map(l => {
        const realDone = fetchedMoves ? (movesBySaleLine.get(l.id) || 0) : l.qty_delivered;
        return {
          name:       l.name,
          qty:        l.product_uom_qty,
          delivered:  realDone,
        };
      }),
      deliveries: (pickingsByOrder.get(order.id) ?? []).map(p => ({
        name:      p.name,
        state:     p.state,
        date_done: typeof p.date_done === 'string' ? p.date_done : null,
      })),
    };
  });

  return normalized;
}

app.get('/api/odoo/invoiceable-orders', async (_req: Request, res: Response) => {
  if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_PASSWORD) {
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

  startNotifications(fetchInvoiceableOrders).catch(console.error);
});
