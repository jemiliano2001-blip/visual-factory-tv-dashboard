import { randomUUID } from 'node:crypto';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import express, { NextFunction, Request, Response } from 'express';
import { OdooClient } from '../../shared/odooClient';
import nodemailer from 'nodemailer';
import { crearAuthApi, esEmailVerificado, extractBearerToken } from '../../shared/firebaseTokenPolicy';
import { crearVerificadorHub } from '../../shared/hubAccess';
import { buildTeamAccess, isAdminClaim, type AuthUserInfo } from '../../shared/teamAccess';
import { buildMailEnvelope, buildRequestsEmail } from '../../shared/invoiceRequest';
import {
  claimOrders, normalizeOrderAssignments, parseOrderKeys, releaseOrders, type OrderAssignmentsPayload,
} from '../../shared/orderAssignments';
import {
  createInvoiceRequests, loadOrderSnapshots, markInvoiceRequestDone, normalizeInvoiceRequests, parseCreateRequestsBody,
  reconcileWithOdoo, type OdooOrderSnapshot, type RequestActor,
} from '../../shared/invoiceRequests';
import { isKnownSatCode } from '../../shared/satCatalogServer';
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
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// ─── CORS ─────────────────────────────────────────────────────────────────────
// En producción las peticiones llegan vía rewrite de Firebase Hosting (mismo
// origen) — no se necesita CORS. Solo se habilita para localhost en dev local.
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin ?? '';
  res.setHeader('Vary', 'Origin');
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// ─── Firebase Auth ─────────────────────────────────────────────────────────────
// Caché en memoria por instancia para no llamar a firebase-admin por cada poll.
const MAX_TOKEN_CACHE = 500;
const MAX_TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const tokenCache = new Map<string, number>(); // token -> expiración (ms)
setInterval(() => {
  const now = Date.now();
  for (const [k, expiresAt] of tokenCache) if (now > expiresAt) tokenCache.delete(k);
}, 10 * 60 * 1000).unref();

async function verifyFirebaseToken(token: string): Promise<boolean> {
  const expiresAt = tokenCache.get(token);
  if (expiresAt && Date.now() < expiresAt) return true;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    if (!tokenCache.has(token) && tokenCache.size >= MAX_TOKEN_CACHE) {
      const oldest = tokenCache.keys().next().value;
      if (oldest !== undefined) tokenCache.delete(oldest);
    }
    tokenCache.set(token, Math.min(decoded.exp * 1000, Date.now() + MAX_TOKEN_CACHE_TTL_MS));
    return true;
  } catch {
    return false;
  }
}

const isActor = (a: unknown): a is RequestActor => typeof a === 'object' && a !== null && typeof (a as RequestActor).uid === 'string';
const NO_ACTOR = 'Se requiere una cuenta de personal SMV.';

// ─── Health check público ──────────────────────────────────────────────────────
// Para monitores de uptime: va antes de la auth y solo dice si la API y Odoo
// responden (sin datos). El resultado se reutiliza 60 s para que sondear seguido
// no se traduzca en llamadas a Odoo.
const HEALTH_TTL_MS = 60_000;
let health: { at: number; odoo: Promise<boolean> } | null = null;
async function probeOdoo(): Promise<boolean> {
  try {
    const session = await odooClient.getSession();
    await odooClient.odooCall('res.users', 'read', [[session.uid]], { fields: ['login'] });
    return true;
  } catch (err) {
    logger.warn('[health] Odoo no responde:', err);
    return false;
  }
}
app.get('/api/health', async (_req: Request, res: Response) => {
  if (!health || Date.now() - health.at > HEALTH_TTL_MS) health = { at: Date.now(), odoo: probeOdoo() };
  const odoo = await health.odoo;
  res.setHeader('Cache-Control', 'no-store');
  res.status(odoo ? 200 : 503).json({ ok: odoo, odoo });
});

// Todas las rutas /api exigen un ID token de Firebase válido de una cuenta real:
// ya no hay sesión anónima (la TV entra con cuenta real) y los tokens anónimos
// reciben 403. Evita exponer los datos de Odoo (clientes, productos, cantidades,
// notas) a cualquiera con la URL; la identidad queda en res.locals.actor.
app.use('/api', crearAuthApi(verifyFirebaseToken));

// Solo entran cuentas activas de SMV Hub (colección `usuarios`, mismo proyecto Firebase).
// OJO: el Hub guarda `usuarios` en la base nombrada "compras-americanas", no en la "(default)" del dashboard.
const hubDb = () => getFirestore(admin.app(), 'compras-americanas');
const hubAccess = crearVerificadorHub(async uid => (await hubDb().doc(`usuarios/${uid}`).get()).data());
app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
  const actor = res.locals.actor;
  if (!isActor(actor)) { res.status(403).json({ error: NO_ACTOR }); return; }
  try {
    const token = extractBearerToken(req.headers.authorization);
    const access = await hubAccess(actor.uid, actor.email, esEmailVerificado(token));
    if (!access.allowed) {
      res.status(403).json({ error: 'Tu cuenta no tiene acceso al dashboard. Pide a administración que te active en SMV Hub.' });
      return;
    }
    // El nombre del operador vinculado en el Hub identifica a quien pide en solicitudes y correos.
    if (access.name) res.locals.actor = { ...actor, name: access.name };
    next();
  } catch (err) {
    logger.error('verificación de acceso al Hub falló:', err);
    res.status(503).json({ error: 'No se pudo verificar tu acceso. Intenta de nuevo en un momento.' });
  }
});

function createRateLimiter(maxRequests: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    const actor = res.locals.actor;
    const key = isActor(actor) ? actor.uid : (req.ip ?? 'anon');
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter(t => now - t < windowMs);
    if (recent.length >= maxRequests) {
      res.status(429).json({ error: 'Demasiadas solicitudes. Intenta en un minuto.' });
      return;
    }
    recent.push(now);
    if (!hits.has(key) && hits.size >= 500) {
      const oldest = hits.keys().next().value;
      if (oldest !== undefined) hits.delete(oldest);
    }
    hits.set(key, recent);
    next();
  };
}
const sensitiveRateLimit = createRateLimiter(15, 60_000);
// Escrituras sin correo (marcar hecha, asignar/soltar): tope holgado contra bucles o abuso.
const mutationRateLimit = createRateLimiter(60, 60_000);

let cachedTransportKey = '';
let cachedTransport: nodemailer.Transporter | null = null;
function getMailTransport(user: string, pass: string): nodemailer.Transporter {
  const key = `${user}\0${pass}`;
  if (!cachedTransport || cachedTransportKey !== key) {
    cachedTransport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
    cachedTransportKey = key;
  }
  return cachedTransport;
}

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
    logger.error('[Odoo] Error en /api/odoo/status:', err);
    res.status(503).json({ connected: false, message: 'No se pudo conectar con Odoo.' });
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
    logger.error('[Odoo] Error al obtener órdenes:', err);
    res.status(500).json({ error: 'Error al consultar las órdenes en Odoo.', orders: [] });
  }
});

// ─── Asignación de órdenes a ingenieros SMV ───────────────────────────────────
const assignmentsDoc = () => admin.firestore().doc('visual_factory_state/order_assignments');

app.get('/api/order-assignments', async (_req: Request, res: Response) => {
  try {
    res.json(normalizeOrderAssignments((await assignmentsDoc().get()).data()));
  } catch (err) {
    logger.error('[Assignments] Error leyendo asignaciones:', err);
    res.status(500).json({ error: 'No se pudieron leer las asignaciones.' });
  }
});

const changeAssignments = (mutate: (current: OrderAssignmentsPayload, actor: RequestActor, keys: string[]) => OrderAssignmentsPayload) =>
  async (req: Request, res: Response) => {
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
      const next = await admin.firestore().runTransaction(async tx => {
        const updated = mutate(normalizeOrderAssignments((await tx.get(assignmentsDoc())).data()), actor, keys);
        tx.set(assignmentsDoc(), updated);
        return updated;
      });
      res.json(next);
    } catch (err) {
      logger.error('[Assignments] Error guardando asignaciones:', err);
      res.status(500).json({ error: 'No se pudieron guardar las asignaciones.' });
    }
  };

app.post('/api/order-assignments/claim', mutationRateLimit, changeAssignments((cur, actor, keys) => claimOrders(cur, actor, keys)));
app.post('/api/order-assignments/release', mutationRateLimit, changeAssignments((cur, actor, keys) => releaseOrders(cur, actor.uid, keys)));

// ─── Solicitudes de factura/remisión ──────────────────────────────────────────
const requestsDoc = () => admin.firestore().doc('visual_factory_state/invoice_requests');

// Quién tiene acceso (Hub) y quién edita horarios (claim admin). Solo lectura y solo para editores.
app.get('/api/team-access', sensitiveRateLimit, async (_req: Request, res: Response) => {
  const actor = res.locals.actor;
  if (!isActor(actor)) { res.status(403).json({ error: NO_ACTOR }); return; }
  try {
    const caller = await admin.auth().getUser(actor.uid);
    if (!caller.emailVerified || !isAdminClaim(caller.customClaims)) {
      res.status(403).json({ error: 'Solo quien puede editar horarios ve esta lista.' });
      return;
    }
    // El proyecto es compartido: se pagina hasta agotar para no perder a nadie después de 1000 cuentas.
    const authUsers: AuthUserInfo[] = [];
    let pageToken: string | undefined;
    do {
      const page = await admin.auth().listUsers(1000, pageToken);
      for (const u of page.users) {
        authUsers.push({ uid: u.uid, email: u.email ?? null, displayName: u.displayName ?? null, customClaims: u.customClaims ?? null });
      }
      pageToken = page.pageToken;
    } while (pageToken);
    const hubSnap = await hubDb().collection('usuarios').get();
    const members = buildTeamAccess(hubSnap.docs.map(d => ({ uid: d.id, data: d.data() })), authUsers);
    res.json({ available: true, members });
  } catch (err) {
    logger.error('team-access falló:', err);
    res.status(503).json({ error: 'No se pudo leer la lista de acceso. Intenta de nuevo en un momento.' });
  }
});

// Al leer, marca "hecha" lo que Odoo ya cumplió y agrega el avance. Si Odoo falla, devuelve lo guardado.
app.get('/api/invoice-requests', async (_req: Request, res: Response) => {
  try {
    const stored = normalizeInvoiceRequests((await requestsDoc().get()).data());
    let orders: OdooOrderSnapshot[] = [];
    if (odooClient.isConfigured()) {
      try {
        orders = await loadOrderSnapshots(stored, {
          fetchCached: () => odooClient.fetchInvoiceableOrdersCached(),
          fetchByIds: ids => odooClient.fetchOrdersByIds(ids),
        });
      } catch (err) {
        logger.warn('solicitudes: no se pudo consultar Odoo, se devuelve lo guardado:', err);
        res.json({ ...stored, progress: {} });
        return;
      }
    }
    let out = reconcileWithOdoo(stored, orders, new Date().toISOString());
    if (out.state !== stored) {
      out = await admin.firestore().runTransaction(async tx => {
        const current = normalizeInvoiceRequests((await tx.get(requestsDoc())).data());
        const next = reconcileWithOdoo(current, orders, new Date().toISOString());
        if (next.state !== current) tx.set(requestsDoc(), next.state);
        return next;
      });
    }
    res.json({ ...out.state, progress: out.progress });
  } catch (err) {
    logger.error('[InvoiceRequests] Error en GET:', err);
    res.status(500).json({ error: 'No se pudieron consultar las solicitudes.' });
  }
});

app.post('/api/invoice-requests', sensitiveRateLimit, async (req: Request, res: Response) => {
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
  try {
    const result = await admin.firestore().runTransaction(async tx => {
      const current = normalizeInvoiceRequests((await tx.get(requestsDoc())).data());
      const out = createInvoiceRequests(current, drafts, orders, { actor, now: new Date().toISOString(), newId: randomUUID, isKnownSatCode });
      if (out.created.length > 0) tx.set(requestsDoc(), out.state);
      return out;
    });
    if (result.created.length > 0) odooClient.invalidateOrdersCache();
    // El registro ya quedó guardado: si falla el correo o Discord solo se reporta.
    let emailed = false;
    if (result.created.length > 0) {
      const { GMAIL_USER, GMAIL_APP_PASSWORD, INVOICE_MAIL_TO, INVOICE_MAIL_CC } = process.env;
      if (GMAIL_USER && GMAIL_APP_PASSWORD && INVOICE_MAIL_TO) {
        try {
          const transport = getMailTransport(GMAIL_USER, GMAIL_APP_PASSWORD);
          await transport.sendMail({
            ...buildMailEnvelope({ user: GMAIL_USER, to: INVOICE_MAIL_TO, cc: INVOICE_MAIL_CC || undefined }, actor),
            ...buildRequestsEmail(result.created, actor),
          });
          emailed = true;
        } catch (err) {
          logger.error('correo de solicitud falló:', err);
        }
      }
    }
    const notified = result.created.length > 0 ? await sendInvoiceRequestsNotice(result.created, actor) : false;
    res.json({ state: result.state, created: result.created, skipped: result.skipped, notified, emailed });
  } catch (err) {
    logger.error('[InvoiceRequests] Error en POST:', err);
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('tamaño máximo')) {
      res.status(409).json({ error: msg });
      return;
    }
    res.status(500).json({ error: 'No se pudieron crear las solicitudes.' });
  }
});

app.post('/api/invoice-requests/:id/done', mutationRateLimit, async (req: Request, res: Response) => {
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
      if (validationError === 'No se encontró la solicitud.') {
        res.status(404).json({ error: validationError });
        return;
      }
      logger.error('[InvoiceRequests] Error validando POST done:', validationError);
      res.status(500).json({ error: 'No se pudo actualizar la solicitud.' });
      return;
    }
    res.json(next);
  } catch (err) {
    logger.error('[InvoiceRequests] Error en POST done:', err);
    res.status(500).json({ error: 'No se pudo actualizar la solicitud.' });
  }
});

app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Ruta API no encontrada.' });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'JSON inválido en la solicitud.' });
    return;
  }
  logger.error('[Functions API] Error no controlado:', err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// ─── Export API ───────────────────────────────────────────────────────────────
export const api = onRequest({ region: 'us-central1', timeoutSeconds: 60, memory: '256MiB', maxInstances: 10 }, app);

// ─── Scheduled Notifications ──────────────────────────────────────────────────
const TIME_ZONE = 'America/Chicago';

async function runNotificationTask(task: (orders: NotifOrder[], channels: WebhookChannels) => Promise<void>) {
  const mainUrl = process.env.DISCORD_WEBHOOK_URL;
  const enabled = process.env.NOTIFICATIONS_ENABLED !== 'false';

  if (!mainUrl || !enabled) {
    logger.info('[notifications] Desactivado (DISCORD_WEBHOOK_URL no configurado o NOTIFICATIONS_ENABLED=false)');
    return;
  }

  try {
    const { orders } = await odooClient.fetchInvoiceableOrders();
    const channels = buildWebhookChannels(mainUrl);
    await task(orders, channels);
  } catch (err) {
    logger.error('[notifications] Error ejecutando tarea:', err);
  }
}

// 1. Scan cada 30 minutos (umbrales y eventos)
export const scanNotifications = onSchedule({ schedule: 'every 30 minutes', timeZone: TIME_ZONE, maxInstances: 1, concurrency: 1 }, async () => {
  await runNotificationTask(async (orders, channels) => {
    await checkThresholds(orders, channels);
    await checkEvents(orders, channels);

    // Lógica del reporte mensual (directamente en TIME_ZONE sin desplazar Date)
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', hour: '2-digit', hour12: false,
    }).formatToParts(now);
    const part = (type: string) => parts.find(p => p.type === type)?.value ?? '';
    const currentMonth = `${part('year')}-${part('month')}`;
    const currentHour = Number(part('hour')) % 24;
    const state = await loadState();

    if (state.lastMonthlyReportMonth && state.lastMonthlyReportMonth !== currentMonth && currentHour >= 8) {
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
