import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import express, { NextFunction, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { runGeminiGenerate } from '../../shared/geminiProxy';
import { OdooClient } from '../../shared/odooClient';
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
  saveState,
  type NotifOrder,
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

// Todas las rutas /api exigen un ID token de Firebase válido. La TV pública se
// autentica de forma anónima (App.tsx → signInAnonymously) y el frontend envía
// ese token, así que sigue funcionando sin login mientras la auth anónima esté
// habilitada (requisito de setup en CLAUDE.md). Iguala la postura de server.ts y
// evita exponer los datos de Odoo (clientes, productos, cantidades, notas) a
// cualquiera con la URL.
app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '') ?? '';
  if (!token) { res.status(401).json({ error: 'Se requiere autenticación.' }); return; }
  const valid = await verifyFirebaseToken(token).catch(() => false);
  if (!valid) { res.status(401).json({ error: 'Token inválido o expirado.' }); return; }
  next();
});

// ─── Odoo + Gemini (módulo compartido con server.ts) ───────────────────────────
const odooClient = new OdooClient({
  url: process.env.ODOO_URL ?? '',
  db: process.env.ODOO_DB ?? '',
  username: process.env.ODOO_USERNAME ?? '',
  password: process.env.ODOO_PASSWORD ?? '',
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.post('/api/ai/generate', async (req: Request, res: Response) => {
  if (!process.env.GEMINI_API_KEY) {
    res.status(503).json({ error: 'GEMINI_API_KEY no configurada en Cloud Functions.' });
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

app.get('/api/odoo/status', async (_req: Request, res: Response) => {
  if (!odooClient.getConfiguredUrl()) {
    res.status(503).json({ connected: false, message: 'Odoo no configurado' });
    return;
  }
  try {
    const session = await odooClient.getSession();
    await odooClient.odooCall('res.users', 'read', [[session.uid]], { fields: ['login'] });
    res.json({ connected: true, message: 'Conectado a Odoo' });
  } catch (err) {
    res.status(503).json({ connected: false, message: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/odoo/invoiceable-orders', async (_req: Request, res: Response) => {
  if (!odooClient.isConfigured()) {
    res.status(503).json({ error: 'Odoo no configurado. Agrega las env vars ODOO_* en functions/.env', orders: [] });
    return;
  }
  try {
    const orders = await odooClient.fetchInvoiceableOrders();
    res.json({ orders, total: orders.length, lastUpdated: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err), orders: [] });
  }
});

// ─── Export API ───────────────────────────────────────────────────────────────
export const api = onRequest({ region: 'us-central1', timeoutSeconds: 60, memory: '256MiB' }, app);

// ─── Scheduled Notifications ──────────────────────────────────────────────────
const TIME_ZONE = 'America/Chicago';

async function runNotificationTask(task: (orders: NotifOrder[], mainUrl: string, critUrl: string) => Promise<void>) {
  const mainUrl = process.env.DISCORD_WEBHOOK_URL;
  const critUrl = process.env.DISCORD_WEBHOOK_URL_CRITICOS || '';
  const enabled = process.env.NOTIFICATIONS_ENABLED !== 'false';

  if (!mainUrl || !enabled) {
    console.log('[notifications] Desactivado (DISCORD_WEBHOOK_URL no configurado o NOTIFICATIONS_ENABLED=false)');
    return;
  }

  try {
    const orders = await odooClient.fetchInvoiceableOrders();
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
