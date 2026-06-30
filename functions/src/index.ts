import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import express, { NextFunction, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import {
  checkThresholds,
  checkEvents,
  sendMorningReport,
  sendMiddayReport,
  sendEndOfShiftReport,
  sendWeeklySummary,
  sendWeekendReport,
  sendMonthlyReport,
  loadState,
  saveState
} from './notifications';

// Auto-init: en Cloud Functions el service account se configura automáticamente
if (!admin.apps.length) admin.initializeApp();

const app = express();
app.use(express.json());

// ─── CORS ─────────────────────────────────────────────────────────────────────
// En producción las peticiones llegan vía rewrite de Firebase Hosting (mismo
// origen) — no se necesita CORS. Solo se habilita para localhost en dev local.
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin ?? '';
  if (origin.startsWith('http://localhost')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// ─── Firebase Auth ─────────────────────────────────────────────────────────────
// Caché en memoria por instancia para no llamar a firebase-admin por cada poll.
const tokenCache = new Map<string, number>(); // token → exp timestamp ms
setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of tokenCache) if (now > exp) tokenCache.delete(k);
}, 10 * 60 * 1000);

async function verifyFirebaseToken(token: string): Promise<boolean> {
  const cached = tokenCache.get(token);
  if (cached && Date.now() < cached) return true;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    tokenCache.set(token, decoded.exp * 1000);
    return true;
  } catch {
    return false;
  }
}

// El TV dashboard es público (sin login) — estas rutas de solo lectura no
// pueden depender de un token de Firebase, porque la auth anónima puede estar
// deshabilitada o fallar en el navegador del taller. El resto de /api/* (p.ej.
// /api/ai/generate, que cuesta llamadas a Gemini) sigue exigiendo token.
const PUBLIC_GET_ROUTES = new Set(['/odoo/status', '/odoo/invoiceable-orders']);

app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET' && PUBLIC_GET_ROUTES.has(req.path)) { next(); return; }
  const token = req.headers.authorization?.replace('Bearer ', '') ?? '';
  if (!token) { res.status(401).json({ error: 'Se requiere autenticación.' }); return; }
  const valid = await verifyFirebaseToken(token).catch(() => false);
  if (!valid) { res.status(401).json({ error: 'Token inválido o expirado.' }); return; }
  next();
});

// ─── Odoo config ──────────────────────────────────────────────────────────────
const ODOO_URL      = (process.env.ODOO_URL ?? '').replace(/\/$/, '');
const ODOO_DB       = process.env.ODOO_DB ?? '';
const ODOO_USERNAME = process.env.ODOO_USERNAME ?? '';
const ODOO_PASSWORD = process.env.ODOO_PASSWORD ?? '';

// ─── Odoo session ─────────────────────────────────────────────────────────────
// La sesión se cachea en memoria por instancia para reutilizar la cookie de Odoo
// y no crear una sesión nueva en cada petición (poll cada 5 min × usuarios).
interface OdooSession { uid: number; sessionId: string; }
class OdooSessionExpiredError extends Error {}

let sessionPromise: Promise<OdooSession> | null = null;
let reauthing: Promise<OdooSession> | null = null;

function getSession(forceNew = false): Promise<OdooSession> {
  if (forceNew || !sessionPromise) {
    sessionPromise = authenticate().catch(err => { sessionPromise = null; throw err; });
  }
  return sessionPromise;
}

async function authenticate(): Promise<OdooSession> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(`${ODOO_URL}/web/session/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'call', id: 1,
        params: { db: ODOO_DB, login: ODOO_USERNAME, password: ODOO_PASSWORD },
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`Auth HTTP ${r.status}`);
    const json = (await r.json()) as { result?: { uid: number | false }; error?: { message: string } };
    if (json.error) throw new Error(json.error.message);
    const uid = json.result?.uid;
    if (!uid) throw new Error('Credenciales de Odoo incorrectas');
    const sessionId = r.headers.get('set-cookie')?.match(/session_id=([^;]+)/)?.[1] ?? '';
    return { uid, sessionId };
  } finally { clearTimeout(t); }
}

async function odooRpc<T>(
  session: OdooSession, model: string, method: string,
  args: unknown[] = [], kwargs: Record<string, unknown> = {},
): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(`${ODOO_URL}/web/dataset/call_kw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session.sessionId ? { Cookie: `session_id=${session.sessionId}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'call', id: Math.random() * 1e5 | 0,
        params: { model, method, args, kwargs },
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`Odoo HTTP ${r.status}`);
    const json = (await r.json()) as {
      result?: T;
      error?: { code?: number; message: string; data?: { message?: string; name?: string } };
    };
    if (json.error) {
      const msg = json.error.data?.message ?? json.error.message;
      if (json.error.code === 100 || json.error.data?.name === 'odoo.http.SessionExpiredException') {
        throw new OdooSessionExpiredError(msg);
      }
      throw new Error(`Odoo RPC: ${msg}`);
    }
    return json.result as T;
  } finally { clearTimeout(t); }
}

async function odooCall<T>(
  model: string, method: string, args: unknown[] = [], kwargs: Record<string, unknown> = {},
): Promise<T> {
  try {
    return await odooRpc<T>(await getSession(), model, method, args, kwargs);
  } catch (err) {
    if (!(err instanceof OdooSessionExpiredError)) throw err;
    if (!reauthing) reauthing = getSession(true).finally(() => { reauthing = null; });
    return odooRpc<T>(await reauthing!, model, method, args, kwargs);
  }
}

// ─── Tipos internos de Odoo ───────────────────────────────────────────────────
interface RawLine { id: number; name: string; display_type: string | false; product_uom_qty: number; qty_delivered: number; }
interface RawOrder { id: number; name: string; partner_id: [number, string] | false; date_order: string; commitment_date: string | false; invoice_status: string; currency_id: [number, string] | false; order_line: number[]; state: string; user_id: [number, string] | false; note: string | false; }
interface RawPicking { name: string; origin: string | false; state: string; date_done: string | false; }
interface RawMove { sale_line_id: [number, string] | false; quantity_done: number; }

// ─── Fetching de órdenes ─────────────────────────────────────────────────────
async function fetchOrders() {
  const ids = await odooCall<number[]>(
    'sale.order', 'search',
    [[['invoice_status', '=', 'to invoice'], ['state', 'in', ['sale', 'done']]]],
    { limit: 500, order: 'commitment_date asc, date_order asc' },
  );
  if (!ids.length) return [];

  const orders = await odooCall<RawOrder[]>('sale.order', 'read', [ids], {
    fields: ['name', 'partner_id', 'date_order', 'commitment_date', 'invoice_status', 'currency_id', 'order_line', 'state', 'user_id', 'note'],
  });

  const allLineIds = orders.flatMap(o => o.order_line);
  const linesMap = new Map<number, RawLine>();
  for (let i = 0; i < allLineIds.length; i += 500) {
    const batch = await odooCall<RawLine[]>('sale.order.line', 'read', [allLineIds.slice(i, i + 500)], {
      fields: ['name', 'display_type', 'product_uom_qty', 'qty_delivered'],
    });
    batch.forEach(l => linesMap.set(l.id, l));
  }

  const orderNameToId = new Map(orders.map(o => [o.name, o.id]));
  const pickingsByOrder = new Map<number, RawPicking[]>();
  try {
    const pickings = await odooCall<RawPicking[]>('stock.picking', 'search_read',
      [[['origin', 'in', orders.map(o => o.name)], ['picking_type_code', '=', 'outgoing']]],
      { fields: ['name', 'origin', 'state', 'date_done'], limit: 5000 },
    );
    for (const p of pickings) {
      const saleId = typeof p.origin === 'string' ? orderNameToId.get(p.origin) : undefined;
      if (!saleId) continue;
      if (!pickingsByOrder.has(saleId)) pickingsByOrder.set(saleId, []);
      pickingsByOrder.get(saleId)!.push(p);
    }
  } catch { /* remisiones opcionales */ }

  const movesBySaleLine = new Map<number, number>();
  let fetchedMoves = false;
  try {
    const lineIds = Array.from(linesMap.keys());
    for (let i = 0; i < lineIds.length; i += 500) {
      const moves = await odooCall<RawMove[]>('stock.move', 'search_read',
        [[['sale_line_id', 'in', lineIds.slice(i, i + 500)], ['state', '=', 'done'], ['picking_code', '=', 'outgoing']]],
        { fields: ['sale_line_id', 'quantity_done'], limit: 10000 },
      );
      for (const m of moves) {
        const lid = Array.isArray(m.sale_line_id) ? m.sale_line_id[0] : null;
        if (lid) movesBySaleLine.set(lid, (movesBySaleLine.get(lid) ?? 0) + m.quantity_done);
      }
    }
    fetchedMoves = true;
  } catch { /* movimientos opcionales */ }

  return orders.map(order => {
    const lines = order.order_line
      .map(id => linesMap.get(id))
      .filter((l): l is RawLine => !!l && !l.display_type);
    const totalQty     = lines.reduce((s, l) => s + l.product_uom_qty, 0);
    const deliveredQty = lines.reduce((s, l) =>
      s + (fetchedMoves ? (movesBySaleLine.get(l.id) ?? 0) : l.qty_delivered), 0);
    return {
      id:              order.id,
      name:            order.name,
      partner_name:    order.partner_id ? order.partner_id[1] : 'Desconocido',
      main_product:    lines[0]?.name ?? 'Sin descripción',
      date_order:      order.date_order,
      commitment_date: order.commitment_date || null,
      invoice_status:  order.invoice_status,
      currency:        order.currency_id ? order.currency_id[1] : 'MXN',
      qty_total:       totalQty,
      qty_delivered:   deliveredQty,
      state:           order.state,
      salesperson:     order.user_id ? order.user_id[1] : null,
      note:            typeof order.note === 'string' ? order.note : null,
      lines_count:     lines.length,
      lines: lines.map(l => ({
        name:      l.name,
        qty:       l.product_uom_qty,
        delivered: fetchedMoves ? (movesBySaleLine.get(l.id) ?? 0) : l.qty_delivered,
      })),
      deliveries: (pickingsByOrder.get(order.id) ?? []).map(p => ({
        name:      p.name,
        state:     p.state,
        date_done: typeof p.date_done === 'string' ? p.date_done : null,
      })),
    };
  });
}

// ─── Endpoints ────────────────────────────────────────────────────────────────
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.post('/api/ai/generate', async (req: Request, res: Response) => {
  if (!process.env.GEMINI_API_KEY) {
    res.status(503).json({ error: 'GEMINI_API_KEY no configurada en Cloud Functions.' });
    return;
  }

  try {
    const { model, contents, config } = req.body;
    if (!model || !contents) {
      res.status(400).json({ error: 'Faltan parámetros requeridos: model y contents.' });
      return;
    }

    const response = await ai.models.generateContent({ model, contents, config });
    
    res.json({
      text: response.text,
      candidates: response.candidates,
    });
  } catch (err) {
    console.error('[Gemini AI Error]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/odoo/status', async (_req: Request, res: Response) => {
  if (!ODOO_URL) { res.status(503).json({ connected: false, message: 'Odoo no configurado' }); return; }
  try {
    const session = await getSession();
    await odooCall('res.users', 'read', [[session.uid]], { fields: ['login'] });
    res.json({ connected: true, message: 'Conectado a Odoo' });
  } catch (err) {
    res.status(503).json({ connected: false, message: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/odoo/invoiceable-orders', async (_req: Request, res: Response) => {
  if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_PASSWORD) {
    res.status(503).json({ error: 'Odoo no configurado. Agrega las env vars ODOO_* en functions/.env', orders: [] });
    return;
  }
  try {
    const orders = await fetchOrders();
    res.json({ orders, total: orders.length, lastUpdated: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err), orders: [] });
  }
});

// ─── Export API ───────────────────────────────────────────────────────────────
export const api = onRequest({ region: 'us-central1', timeoutSeconds: 60, memory: '256MiB' }, app);

// ─── Scheduled Notifications ──────────────────────────────────────────────────
const TIME_ZONE = 'America/Chicago';

async function runNotificationTask(task: (orders: any[], mainUrl: string, critUrl: string) => Promise<void>) {
  const mainUrl = process.env.DISCORD_WEBHOOK_URL;
  const critUrl = process.env.DISCORD_WEBHOOK_URL_CRITICOS || '';
  const enabled = process.env.NOTIFICATIONS_ENABLED !== 'false';

  if (!mainUrl || !enabled) {
    console.log('[notifications] Desactivado (DISCORD_WEBHOOK_URL no configurado o NOTIFICATIONS_ENABLED=false)');
    return;
  }

  try {
    const orders = await fetchOrders();
    await task(orders, mainUrl, critUrl);
  } catch (err) {
    console.error('[notifications] Error ejecutando tarea:', err);
  }
}

// 1. Scan cada 30 minutos (umbrales y eventos)
export const scanNotifications = onSchedule({ schedule: 'every 30 minutes', timeZone: TIME_ZONE }, async () => {
  await runNotificationTask(async (orders, mainUrl, critUrl) => {
    await checkThresholds(orders, mainUrl, critUrl);
    await checkEvents(orders, mainUrl);

    // Lógica del reporte mensual
    const now = new Date();
    // Ajustar mes a la zona horaria
    const localStr = new Date(now.toLocaleString('en-US', { timeZone: TIME_ZONE }));
    const currentMonth = `${localStr.getFullYear()}-${String(localStr.getMonth() + 1).padStart(2, '0')}`;
    const state = await loadState();

    if (state.lastMonthlyReportMonth && state.lastMonthlyReportMonth !== currentMonth && localStr.getHours() >= 8) {
      await sendMonthlyReport(orders, mainUrl);
      state.lastMonthlyReportMonth = currentMonth;
      await saveState(state);
    } else if (!state.lastMonthlyReportMonth) {
      state.lastMonthlyReportMonth = currentMonth;
      await saveState(state);
    }
  });
});

// 2. Lun-Sáb 8:00 AM — reporte matutino
export const morningReport = onSchedule({ schedule: '0 8 * * 1-6', timeZone: TIME_ZONE }, async () => {
  await runNotificationTask(async (orders, mainUrl) => {
    await sendMorningReport(orders, mainUrl);
  });
});

// 3. Lun-Sáb 1:00 PM — reporte mediodía
export const middayReport = onSchedule({ schedule: '0 13 * * 1-6', timeZone: TIME_ZONE }, async () => {
  await runNotificationTask(async (orders, mainUrl) => {
    await sendMiddayReport(orders, mainUrl);
  });
});

// 4. Lun-Jue + Sáb 5:00 PM — cierre de turno normal
export const endOfShiftReport = onSchedule({ schedule: '0 17 * * 1-4,6', timeZone: TIME_ZONE }, async () => {
  await runNotificationTask(async (orders, mainUrl) => {
    await sendEndOfShiftReport(orders, mainUrl);
  });
});

// 5. Viernes 5:00 PM — cierre de semana
export const weekendReport = onSchedule({ schedule: '0 17 * * 5', timeZone: TIME_ZONE }, async () => {
  await runNotificationTask(async (orders, mainUrl) => {
    await sendWeekendReport(orders, mainUrl);
  });
});

// 6. Lunes 9:00 AM — resumen semanal
export const weeklySummary = onSchedule({ schedule: '0 9 * * 1', timeZone: TIME_ZONE }, async () => {
  await runNotificationTask(async (orders, mainUrl) => {
    await sendWeeklySummary(orders, mainUrl);
  });
});
