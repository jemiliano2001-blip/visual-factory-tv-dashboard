import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import express, { NextFunction, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { runGeminiGenerate } from '../../shared/geminiProxy';
import {
  buildSpeechStreamRequest,
  pipeGeminiSpeechStream,
  serializeSpeechStreamEvent,
  validateSpeechStreamBody,
} from '../../shared/geminiSpeechStream';
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
  buildWebhookChannels,
  type NotifOrder,
  type WebhookChannels,
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
interface AuthPrincipal {
  expiresAt: number;
  isAdmin: boolean;
  isVerifiedAdmin: boolean;
}

const tokenCache = new Map<string, AuthPrincipal>(); // token -> principal
setInterval(() => {
  const now = Date.now();
  for (const [k, principal] of tokenCache) if (now > principal.expiresAt) tokenCache.delete(k);
}, 10 * 60 * 1000);

async function verifyFirebaseToken(token: string): Promise<AuthPrincipal | null> {
  const cached = tokenCache.get(token);
  if (cached && Date.now() < cached.expiresAt) return cached;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const principal = {
      expiresAt: decoded.exp * 1000,
      isAdmin: decoded.admin === true,
      isVerifiedAdmin: decoded.email_verified === true && decoded.firebase.sign_in_provider !== 'anonymous',
    };
    tokenCache.set(token, principal);
    return principal;
  } catch {
    return null;
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
  const principal = await verifyFirebaseToken(token).catch(() => null);
  if (!principal) { res.status(401).json({ error: 'Token inválido o expirado.' }); return; }
  res.locals.auth = principal;
  next();
});

function requireAdmin(_req: Request, res: Response, next: NextFunction) {
  if (res.locals.auth?.isAdmin === true && res.locals.auth?.isVerifiedAdmin === true) return next();
  res.status(403).json({ error: 'Se requiere el permiso administrativo.' });
}

// ─── Odoo + Gemini (módulo compartido con server.ts) ───────────────────────────
const odooClient = new OdooClient({
  url: process.env.ODOO_URL ?? '',
  db: process.env.ODOO_DB ?? '',
  username: process.env.ODOO_USERNAME ?? '',
  password: process.env.ODOO_PASSWORD ?? '',
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function generateAI(req: Request, res: Response) {
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
}

app.post('/api/ai/speech-stream', async (req: Request, res: Response) => {
  const validated = validateSpeechStreamBody(req.body);
  if (validated.ok === false) {
    res.status(400).json({ error: validated.error });
    return;
  }

  if (!process.env.GEMINI_API_KEY) {
    res.status(503).json({ error: 'Servicio de voz no configurado.' });
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const controller = new AbortController();
  const onRequestAborted = () => controller.abort();
  const onResponseClosed = () => {
    if (!res.writableEnded) controller.abort();
  };
  req.once('aborted', onRequestAborted);
  res.once('close', onResponseClosed);
  const request = buildSpeechStreamRequest(validated.text, controller.signal);
  const stream: AsyncIterable<unknown> = {
    async *[Symbol.asyncIterator](): AsyncGenerator<unknown> {
      yield* await ai.models.generateContentStream(request);
    },
  };

  try {
    await pipeGeminiSpeechStream(
      stream,
      event => {
        if (res.writable && !res.writableEnded) res.write(serializeSpeechStreamEvent(event));
      },
      controller,
    );
  } finally {
    req.off('aborted', onRequestAborted);
    res.off('close', onResponseClosed);
    if (res.writable && !res.writableEnded) res.end();
  }
});

app.post('/api/ai/generate', generateAI);
app.post('/api/ai/admin-generate', requireAdmin, generateAI);

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

async function runNotificationTask(task: (orders: NotifOrder[], channels: WebhookChannels) => Promise<void>) {
  const mainUrl = process.env.DISCORD_WEBHOOK_URL;
  const enabled = process.env.NOTIFICATIONS_ENABLED !== 'false';

  if (!mainUrl || !enabled) {
    console.log('[notifications] Desactivado (DISCORD_WEBHOOK_URL no configurado o NOTIFICATIONS_ENABLED=false)');
    return;
  }

  try {
    const orders = await odooClient.fetchInvoiceableOrders();
    const channels = buildWebhookChannels(mainUrl);
    await task(orders, channels);
  } catch (err) {
    console.error('[notifications] Error ejecutando tarea:', err);
  }
}

// 1. Scan cada 30 minutos (umbrales y eventos)
export const scanNotifications = onSchedule({ schedule: 'every 30 minutes', timeZone: TIME_ZONE }, async () => {
  await runNotificationTask(async (orders, channels) => {
    await checkThresholds(orders, channels);
    await checkEvents(orders, channels);

    // Lógica del reporte mensual
    const now = new Date();
    // Ajustar mes a la zona horaria
    const localStr = new Date(now.toLocaleString('en-US', { timeZone: TIME_ZONE }));
    const currentMonth = `${localStr.getFullYear()}-${String(localStr.getMonth() + 1).padStart(2, '0')}`;
    const state = await loadState();

    if (state.lastMonthlyReportMonth && state.lastMonthlyReportMonth !== currentMonth && localStr.getHours() >= 8) {
      await sendMonthlyReport(orders, channels.reportes);
      state.lastMonthlyReportMonth = currentMonth;
      await saveState(state, ['lastMonthlyReportMonth']);
    } else if (!state.lastMonthlyReportMonth) {
      state.lastMonthlyReportMonth = currentMonth;
      await saveState(state, ['lastMonthlyReportMonth']);
    }
  });
});

// 2. Lun-Sáb 8:00 AM — reporte matutino
export const morningReport = onSchedule({ schedule: '0 8 * * 1-6', timeZone: TIME_ZONE }, async () => {
  await runNotificationTask(async (orders, channels) => {
    await sendMorningReport(orders, channels.reportes);
  });
});

// 3. Lun-Sáb 1:00 PM — reporte mediodía
export const middayReport = onSchedule({ schedule: '0 13 * * 1-6', timeZone: TIME_ZONE }, async () => {
  await runNotificationTask(async (orders, channels) => {
    await sendMiddayReport(orders, channels.reportes);
  });
});

// 4. Lun-Jue + Sáb 5:00 PM — cierre de turno normal
export const endOfShiftReport = onSchedule({ schedule: '0 17 * * 1-4,6', timeZone: TIME_ZONE }, async () => {
  await runNotificationTask(async (orders, channels) => {
    await sendEndOfShiftReport(orders, channels.reportes);
  });
});

// 5. Viernes 5:00 PM — cierre de semana
export const weekendReport = onSchedule({ schedule: '0 17 * * 5', timeZone: TIME_ZONE }, async () => {
  await runNotificationTask(async (orders, channels) => {
    await sendWeekendReport(orders, channels.reportes);
  });
});

// 6. Lunes 9:00 AM — resumen semanal
export const weeklySummary = onSchedule({ schedule: '0 9 * * 1', timeZone: TIME_ZONE }, async () => {
  await runNotificationTask(async (orders, channels) => {
    await sendWeeklySummary(orders, channels.reportes);
  });
});
