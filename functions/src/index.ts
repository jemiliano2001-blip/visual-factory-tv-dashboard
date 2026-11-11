import { randomUUID } from 'node:crypto';
import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import express, { NextFunction, Request, Response } from 'express';
import { OdooClient } from '../../shared/odooClient';
import { crearAuthApi } from '../../shared/firebaseTokenPolicy';
import {
  applyOrderAssignmentsMutation, normalizeOrderAssignments, parseOrderAssignmentsPatch,
} from '../../shared/orderAssignments';
import {
  createInvoiceRequests, markInvoiceRequestDone, normalizeInvoiceRequests, parseCreateRequestsBody, type RequestActor,
} from '../../shared/invoiceRequests';
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
  sendInvoiceRequestsNotice,
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
const tokenCache = new Map<string, number>(); // token -> expiración (ms)
setInterval(() => {
  const now = Date.now();
  for (const [k, expiresAt] of tokenCache) if (now > expiresAt) tokenCache.delete(k);
}, 10 * 60 * 1000);

async function verifyFirebaseToken(token: string): Promise<boolean> {
  const expiresAt = tokenCache.get(token);
  if (expiresAt && Date.now() < expiresAt) return true;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    tokenCache.set(token, decoded.exp * 1000);
    return true;
  } catch {
    return false;
  }
}

// Todas las rutas /api exigen un ID token de Firebase válido de una cuenta real:
// ya no hay sesión anónima (la TV entra con cuenta real) y los tokens anónimos
// reciben 403. Evita exponer los datos de Odoo (clientes, productos, cantidades,
// notas) a cualquiera con la URL; la identidad queda en res.locals.actor.
app.use('/api', crearAuthApi(verifyFirebaseToken));

// ─── Odoo (módulo compartido con server.ts) ───────────────────────────
const odooClient = new OdooClient({
  url: process.env.ODOO_URL ?? '',
  db: process.env.ODOO_DB ?? '',
  username: process.env.ODOO_USERNAME ?? '',
  password: process.env.ODOO_PASSWORD ?? '',
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
    const { orders, truncated } = await odooClient.fetchInvoiceableOrdersCached();
    res.json({ orders, total: orders.length, truncated, lastUpdated: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err), orders: [] });
  }
});

// ─── Asignación de órdenes a ingenieros SMV ───────────────────────────────────
const assignmentsDoc = () => admin.firestore().doc('visual_factory_state/order_assignments');

app.get('/api/order-assignments', async (_req: Request, res: Response) => {
  try {
    res.json(normalizeOrderAssignments((await assignmentsDoc().get()).data()));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/order-assignments', async (req: Request, res: Response) => {
  let patch;
  try {
    patch = parseOrderAssignmentsPatch(req.body);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    return;
  }
  let validationError: string | null = null;
  try {
    const next = await admin.firestore().runTransaction(async tx => {
      const current = normalizeOrderAssignments((await tx.get(assignmentsDoc())).data());
      let updated;
      try {
        updated = applyOrderAssignmentsMutation(current, patch);
      } catch (err) {
        validationError = err instanceof Error ? err.message : String(err);
        return null;
      }
      tx.set(assignmentsDoc(), updated);
      return updated;
    });
    if (validationError !== null) {
      res.status(400).json({ error: validationError });
      return;
    }
    res.json(next);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Solicitudes de factura/remisión ──────────────────────────────────────────
const requestsDoc = () => admin.firestore().doc('visual_factory_state/invoice_requests');
const isActor = (a: unknown): a is RequestActor => typeof a === 'object' && a !== null && typeof (a as RequestActor).uid === 'string';
const NO_ACTOR = 'Se requiere una cuenta de personal SMV.';

app.get('/api/invoice-requests', async (_req: Request, res: Response) => {
  try {
    res.json(normalizeInvoiceRequests((await requestsDoc().get()).data()));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/invoice-requests', async (req: Request, res: Response) => {
  let drafts;
  try {
    drafts = parseCreateRequestsBody(req.body);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    return;
  }
  const actor = res.locals.actor;
  if (!isActor(actor)) { res.status(403).json({ error: NO_ACTOR }); return; }
  if (!odooClient.isConfigured()) { res.status(503).json({ error: 'Odoo no configurado.' }); return; }
  let orders;
  try {
    orders = (await odooClient.fetchInvoiceableOrdersCached()).orders;
  } catch {
    res.status(503).json({ error: 'No se pudo consultar Odoo; no se guardó nada.' });
    return;
  }
  try {
    const result = await admin.firestore().runTransaction(async tx => {
      const current = normalizeInvoiceRequests((await tx.get(requestsDoc())).data());
      const out = createInvoiceRequests(current, drafts, orders, { actor, now: new Date().toISOString(), newId: randomUUID });
      if (out.created.length > 0) tx.set(requestsDoc(), out.state);
      return out;
    });
    const notified = result.created.length > 0 ? await sendInvoiceRequestsNotice(result.created, actor) : false;
    res.json({ state: result.state, created: result.created, skipped: result.skipped, notified });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/invoice-requests/:id/done', async (req: Request, res: Response) => {
  const actor = res.locals.actor;
  if (!isActor(actor)) { res.status(403).json({ error: NO_ACTOR }); return; }
  let validationError: string | null = null;
  try {
    const next = await admin.firestore().runTransaction(async tx => {
      const current = normalizeInvoiceRequests((await tx.get(requestsDoc())).data());
      let updated;
      try {
        updated = markInvoiceRequestDone(current, String(req.params.id), { actor, now: new Date().toISOString() });
      } catch (err) {
        validationError = err instanceof Error ? err.message : String(err);
        return null;
      }
      if (updated !== current) tx.set(requestsDoc(), updated);
      return updated;
    });
    if (validationError !== null) {
      res.status(validationError === 'No se encontró la solicitud.' ? 404 : 500).json({ error: validationError });
      return;
    }
    res.json(next);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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
    const { orders } = await odooClient.fetchInvoiceableOrders();
    const channels = buildWebhookChannels(mainUrl);
    await task(orders, channels);
  } catch (err) {
    console.error('[notifications] Error ejecutando tarea:', err);
  }
}

// 1. Scan cada 30 minutos (umbrales y eventos)
export const scanNotifications = onSchedule({ schedule: 'every 30 minutes', timeZone: TIME_ZONE, maxInstances: 1, concurrency: 1 }, async () => {
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
