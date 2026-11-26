import { createHash, randomUUID } from 'node:crypto';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import express, { NextFunction, Request, Response } from 'express';
import { OdooClient } from '../../shared/odooClient';
import { createTransport, type Transporter } from 'nodemailer';
import { crearAuthApi, extractBearerToken } from '../../shared/firebaseTokenPolicy';
import { crearVerificadorHub } from '../../shared/hubAccess';
import { buildTeamAccess, isAdminClaim, type AuthUserInfo } from '../../shared/teamAccess';
import { buildMailEnvelope, buildRequestsEmail } from '../../shared/invoiceRequest';
import {
  AssignmentValidationError, assertAssignmentsWithinSizeLimit, assignOrders, claimOrders, followOrders,
  normalizeOrderAssignments, parseAssignBody, parseOrderKeys, releaseOrders, type OrderAssignmentsPayload,
} from '../../shared/orderAssignments';
import {
  backfillRequestMeta, createInvoiceRequests, isValidRequestId, loadOrderSnapshots, lookupIdempotentReplay,
  markInvoiceRequestDone, missingMetaOrderIds, normalizeIdempotencyKey, normalizeInvoiceRequests,
  parseCreateRequestsBody, reconcileWithOdoo, recordIdempotencyKey,
  type OdooOrderMetaSnapshot, type OdooOrderSnapshot, type RequestActor,
} from '../../shared/invoiceRequests';
import { createMemoryRateLimiter } from '../../shared/rateLimit';
import { buildAuditEntry, type AuditLogEntry } from '../../shared/auditLog';
import { parseFunctionsEnv, type FunctionsEnvConfig } from '../../shared/envConfig';
import { createRequestContextMiddleware } from '../../shared/requestContext';
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
  sendWebhook,
  buildWebhookChannels,
  sendInvoiceRequestsNotice,
  type NotifOrder,
  type WebhookChannels,
} from './notifications';

// Auto-init: en Cloud Functions el service account se configura automáticamente
if (!admin.apps.length) admin.initializeApp();

// Secret Manager (mínimo privilegio por carga de trabajo; nunca leer .value() en top-level)
const SECRET_ODOO_PASSWORD = defineSecret('ODOO_PASSWORD');
const SECRET_GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');
const SECRET_DISCORD_WEBHOOK_URL = defineSecret('DISCORD_WEBHOOK_URL');
const SECRET_DISCORD_WEBHOOK_URL_CRITICAS = defineSecret('DISCORD_WEBHOOK_URL_CRITICAS');
const SECRET_DISCORD_WEBHOOK_URL_REPORTES = defineSecret('DISCORD_WEBHOOK_URL_REPORTES');

const API_SECRETS = [
  SECRET_ODOO_PASSWORD,
  SECRET_GMAIL_APP_PASSWORD,
  SECRET_DISCORD_WEBHOOK_URL,
];

const NOTIFICATION_SECRETS = [
  SECRET_ODOO_PASSWORD,
  SECRET_DISCORD_WEBHOOK_URL,
  SECRET_DISCORD_WEBHOOK_URL_CRITICAS,
  SECRET_DISCORD_WEBHOOK_URL_REPORTES,
];

function readSecretSafe(secret: ReturnType<typeof defineSecret>, envKey: string): string {
  try {
    const val = secret.value();
    if (typeof val === 'string' && val.length > 0) return val;
  } catch {
    // Secreto no vinculado a esta función o lectura durante discovery
  }
  return process.env[envKey] ?? '';
}

let cachedEnvConfig: Readonly<FunctionsEnvConfig> | null = null;
function getRuntimeEnv(): Readonly<FunctionsEnvConfig> {
  if (cachedEnvConfig) return cachedEnvConfig;
  const parsed = parseFunctionsEnv({
    ...process.env,
    ODOO_PASSWORD: readSecretSafe(SECRET_ODOO_PASSWORD, 'ODOO_PASSWORD'),
    GMAIL_APP_PASSWORD: readSecretSafe(SECRET_GMAIL_APP_PASSWORD, 'GMAIL_APP_PASSWORD'),
    DISCORD_WEBHOOK_URL: readSecretSafe(SECRET_DISCORD_WEBHOOK_URL, 'DISCORD_WEBHOOK_URL'),
    DISCORD_WEBHOOK_URL_CRITICAS: readSecretSafe(SECRET_DISCORD_WEBHOOK_URL_CRITICAS, 'DISCORD_WEBHOOK_URL_CRITICAS'),
    DISCORD_WEBHOOK_URL_REPORTES: readSecretSafe(SECRET_DISCORD_WEBHOOK_URL_REPORTES, 'DISCORD_WEBHOOK_URL_REPORTES'),
  });
  if (!parsed.ok) {
    logger.error('[config] Variables de entorno inválidas:', { errors: parsed.errors });
  }
  cachedEnvConfig = parsed.config;
  return cachedEnvConfig;
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Cabeceras de seguridad básicas en todas las respuestas de la Cloud Function
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
});

app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// ─── CORS ─────────────────────────────────────────────────────────────────────
// En producción las peticiones llegan vía rewrite de Firebase Hosting (mismo
// origen) — no se necesita CORS. Solo se habilita para localhost en dev local.
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin ?? '';
  res.setHeader('Vary', 'Origin');
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key, X-Request-Id');
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id');
  }
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

app.use('/api', createRequestContextMiddleware(info => {
  logger.info('[http]', info);
}));

// ─── Helpers de errores seguros y auditoría ───────────────────────────────────
function safeErrorSummary(err: unknown): { name: string; message: string } {
  if (err instanceof Error) {
    return {
      name: err.name || 'Error',
      message: err.message.replace(/\s+/g, ' ').trim().slice(0, 200),
    };
  }
  return { name: 'UnknownError', message: String(err).replace(/\s+/g, ' ').trim().slice(0, 200) };
}

async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await admin.firestore().collection('audit_logs').add(entry);
  } catch (err) {
    logger.warn('[audit] No se pudo escribir evento de auditoría:', safeErrorSummary(err));
  }
}

// ─── Firebase Auth ─────────────────────────────────────────────────────────────
// Caché en memoria por instancia para no llamar a firebase-admin por cada poll.
interface VerifiedTokenMeta {
  expiresAt: number;
  emailVerified: boolean;
  readOnlyClaim: boolean;
}
const MAX_TOKEN_CACHE = 500;
const MAX_TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const tokenCache = new Map<string, VerifiedTokenMeta>();
setInterval(() => {
  const now = Date.now();
  for (const [k, meta] of tokenCache) if (now > meta.expiresAt) tokenCache.delete(k);
}, 10 * 60 * 1000).unref();

async function verifyTokenAndGetMeta(token: string): Promise<VerifiedTokenMeta | null> {
  const cached = tokenCache.get(token);
  if (cached && Date.now() < cached.expiresAt) return cached;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const meta: VerifiedTokenMeta = {
      expiresAt: Math.min(decoded.exp * 1000, Date.now() + MAX_TOKEN_CACHE_TTL_MS),
      emailVerified: decoded.email_verified === true,
      readOnlyClaim: decoded.readOnly === true || decoded.role === 'tv' || decoded.rol === 'tv',
    };
    if (!tokenCache.has(token) && tokenCache.size >= MAX_TOKEN_CACHE) {
      const oldest = tokenCache.keys().next().value;
      if (oldest !== undefined) tokenCache.delete(oldest);
    }
    tokenCache.set(token, meta);
    return meta;
  } catch {
    return null;
  }
}

async function verifyFirebaseToken(token: string): Promise<boolean> {
  return (await verifyTokenAndGetMeta(token)) !== null;
}

const isActor = (a: unknown): a is RequestActor => typeof a === 'object' && a !== null && typeof (a as RequestActor).uid === 'string';
const NO_ACTOR = 'Se requiere una cuenta de personal SMV.';

const healthRateLimit = createMemoryRateLimiter({
  maxRequests: 30,
  windowMs: 60_000,
  keyOf: req => req.ip ?? 'health',
});
const readRateLimit = createMemoryRateLimiter({ maxRequests: 120, windowMs: 60_000 });
const sensitiveRateLimit = createMemoryRateLimiter({ maxRequests: 15, windowMs: 60_000 });
// Escrituras sin correo (marcar hecha, asignar/soltar): tope holgado contra bucles o abuso.
const mutationRateLimit = createMemoryRateLimiter({ maxRequests: 60, windowMs: 60_000 });

// ─── Health check público ──────────────────────────────────────────────────────
// Para monitores de uptime: va antes de la auth y solo dice si la API, Odoo y
// Firestore responden (sin datos). Caché de 60 s para no saturar servicios.
const HEALTH_TTL_MS = 60_000;
let health: { at: number; checks: Promise<{ odoo: boolean; firestore: boolean }> } | null = null;
async function probeOdoo(): Promise<boolean> {
  try {
    const client = getOdooClient();
    const session = await client.getSession();
    await client.odooCall('res.users', 'read', [[session.uid]], { fields: ['login'] });
    return true;
  } catch (err) {
    logger.warn('[health] Odoo no responde:', safeErrorSummary(err));
    return false;
  }
}
async function probeFirestore(): Promise<boolean> {
  try {
    await Promise.race([
      admin.firestore().doc('visual_factory_state/invoice_requests').get(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Firestore health timeout')), 5000)),
    ]);
    return true;
  } catch (err) {
    logger.warn('[health] Firestore no responde:', safeErrorSummary(err));
    return false;
  }
}
app.get('/api/health', healthRateLimit, async (_req: Request, res: Response) => {
  if (!health || Date.now() - health.at > HEALTH_TTL_MS) {
    health = {
      at: Date.now(),
      checks: Promise.all([probeOdoo(), probeFirestore()]).then(([odoo, firestore]) => ({ odoo, firestore })),
    };
  }
  const { odoo, firestore } = await health.checks;
  const ok = odoo && firestore;
  res.setHeader('Cache-Control', 'no-store');
  res.status(ok ? 200 : 503).json({ ok, odoo, firestore });
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
    const meta = token ? await verifyTokenAndGetMeta(token) : null;
    const emailVerified = meta?.emailVerified === true;
    const access = await hubAccess.withWrite(actor.uid, actor.email, emailVerified);
    if (!access.allowed) {
      res.status(403).json({ error: 'Tu cuenta no tiene acceso al dashboard. Pide a administración que te active en SMV Hub.' });
      return;
    }
    // El nombre del operador vinculado en el Hub identifica a quien pide en solicitudes y correos.
    if (access.name) res.locals.actor = { ...actor, name: access.name };
    res.locals.canWrite = access.canWrite && meta?.readOnlyClaim !== true;
    next();
  } catch (err) {
    logger.error('verificación de acceso al Hub falló:', safeErrorSummary(err));
    res.status(503).json({ error: 'No se pudo verificar tu acceso. Intenta de nuevo en un momento.' });
  }
});

function requireWriteAccess(req: Request, res: Response, next: NextFunction): void {
  if (res.locals.canWrite === true) {
    next();
    return;
  }
  const actor = isActor(res.locals.actor) ? res.locals.actor : { uid: 'unknown', name: null };
  void writeAuditLog(buildAuditEntry({
    action: 'auth.write_denied',
    actor,
    resource: req.path,
    outcome: 'denied',
    requestId: typeof res.locals.requestId === 'string' ? res.locals.requestId : null,
    details: { method: req.method },
  }));
  res.status(403).json({ error: 'Esta cuenta es de solo lectura y no puede realizar cambios.' });
}

let cachedTransportKey = '';
let cachedTransport: Transporter | null = null;
function getMailTransport(user: string, pass: string): Transporter {
  const key = `${user}\0${pass}`;
  if (!cachedTransport || cachedTransportKey !== key) {
    cachedTransport = createTransport({
      service: 'gmail',
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    cachedTransportKey = key;
  }
  return cachedTransport;
}

// ─── Odoo (módulo compartido con server.ts) ───────────────────────────
let cachedOdooClient: OdooClient | null = null;
function getOdooClient(): OdooClient {
  if (cachedOdooClient) return cachedOdooClient;
  const env = getRuntimeEnv();
  cachedOdooClient = new OdooClient({
    url: env.ODOO_URL,
    db: env.ODOO_DB,
    username: env.ODOO_USERNAME,
    password: env.ODOO_PASSWORD,
    logger: { warn: msg => logger.warn(msg) },
  });
  return cachedOdooClient;
}

app.get('/api/odoo/status', readRateLimit, async (_req: Request, res: Response) => {
  const client = getOdooClient();
  if (!client.getConfiguredUrl()) {
    res.status(503).json({ connected: false, message: 'Odoo no configurado' });
    return;
  }
  try {
    const session = await client.getSession();
    await client.odooCall('res.users', 'read', [[session.uid]], { fields: ['login'] });
    res.json({ connected: true, message: 'Conectado a Odoo' });
  } catch (err) {
    logger.error('[Odoo] Error en /api/odoo/status:', safeErrorSummary(err));
    res.status(503).json({ connected: false, message: 'No se pudo conectar con Odoo.' });
  }
});

app.get('/api/odoo/invoiceable-orders', readRateLimit, async (_req: Request, res: Response) => {
  const client = getOdooClient();
  if (!client.isConfigured()) {
    res.status(503).json({ error: 'Odoo no configurado. Agrega las env vars ODOO_* en functions/.env', orders: [] });
    return;
  }
  try {
    const { orders, truncated } = await client.fetchInvoiceableOrdersCached();
    res.json({ orders, total: orders.length, truncated, lastUpdated: new Date().toISOString() });
  } catch (err) {
    logger.error('[Odoo] Error al obtener órdenes:', safeErrorSummary(err));
    res.status(500).json({ error: 'Error al consultar las órdenes en Odoo.', orders: [] });
  }
});

// ─── Asignación de órdenes a ingenieros SMV ───────────────────────────────────
const assignmentsDoc = () => admin.firestore().doc('visual_factory_state/order_assignments');

app.get('/api/order-assignments', readRateLimit, async (_req: Request, res: Response) => {
  try {
    res.json(normalizeOrderAssignments((await assignmentsDoc().get()).data()));
  } catch (err) {
    logger.error('[Assignments] Error leyendo asignaciones:', safeErrorSummary(err));
    res.status(500).json({ error: 'No se pudieron leer las asignaciones.' });
  }
});

const changeAssignments = (
  auditAction: 'order_assignments.claim' | 'order_assignments.follow' | 'order_assignments.release',
  mutate: (current: OrderAssignmentsPayload, actor: RequestActor, keys: string[]) => OrderAssignmentsPayload,
) =>
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
        assertAssignmentsWithinSizeLimit(updated);
        tx.set(assignmentsDoc(), updated);
        return updated;
      });
      void writeAuditLog(buildAuditEntry({
        action: auditAction,
        actor,
        resource: 'visual_factory_state/order_assignments',
        outcome: 'success',
        requestId: typeof res.locals.requestId === 'string' ? res.locals.requestId : null,
        details: { orderCount: keys.length },
      }));
      res.json(next);
    } catch (err) {
      const summary = safeErrorSummary(err);
      logger.error('[Assignments] Error guardando asignaciones:', summary);
      if (summary.message.includes('tamaño máximo')) {
        res.status(409).json({ error: summary.message });
        return;
      }
      res.status(500).json({ error: 'No se pudieron guardar las asignaciones.' });
    }
  };

app.post('/api/order-assignments/claim', requireWriteAccess, mutationRateLimit, changeAssignments('order_assignments.claim', (cur, actor, keys) => claimOrders(cur, actor, keys)));
app.post('/api/order-assignments/follow', requireWriteAccess, mutationRateLimit, changeAssignments('order_assignments.follow', (cur, actor, keys) => followOrders(cur, actor, keys)));
app.post('/api/order-assignments/release', requireWriteAccess, mutationRateLimit, changeAssignments('order_assignments.release', (cur, actor, keys) => releaseOrders(cur, actor.uid, keys)));
app.post('/api/order-assignments/assign', requireWriteAccess, mutationRateLimit, async (req: Request, res: Response) => {
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
    const next = await admin.firestore().runTransaction(async tx => {
      const updated = assignOrders(
        normalizeOrderAssignments((await tx.get(assignmentsDoc())).data()),
        actor,
        parsed.orderKeys,
        parsed.target,
      );
      assertAssignmentsWithinSizeLimit(updated);
      tx.set(assignmentsDoc(), updated);
      return updated;
    });
    void writeAuditLog(buildAuditEntry({
      action: 'order_assignments.assign',
      actor,
      resource: 'visual_factory_state/order_assignments',
      outcome: 'success',
      requestId: typeof res.locals.requestId === 'string' ? res.locals.requestId : null,
      details: { orderCount: parsed.orderKeys.length },
    }));
    res.json(next);
  } catch (err) {
    if (err instanceof AssignmentValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    const summary = safeErrorSummary(err);
    logger.error('[Assignments] Error asignando ingeniero:', summary);
    if (summary.message.includes('tamaño máximo')) {
      res.status(409).json({ error: summary.message });
      return;
    }
    res.status(500).json({ error: 'No se pudieron guardar las asignaciones.' });
  }
});

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
    logger.error('team-access falló:', safeErrorSummary(err));
    res.status(503).json({ error: 'No se pudo leer la lista de acceso. Intenta de nuevo en un momento.' });
  }
});

// Al leer, marca "hecha" lo que Odoo ya cumplió y agrega el avance. Si Odoo falla, devuelve lo guardado.
app.get('/api/invoice-requests', readRateLimit, async (_req: Request, res: Response) => {
  try {
    const stored = normalizeInvoiceRequests((await requestsDoc().get()).data());
    const client = getOdooClient();
    let orders: OdooOrderSnapshot[] = [];
    if (client.isConfigured()) {
      try {
        orders = await loadOrderSnapshots(stored, {
          fetchCached: () => client.fetchInvoiceableOrdersCached(),
          fetchByIds: ids => client.fetchOrdersByIds(ids),
        });
      } catch (err) {
        logger.warn('solicitudes: no se pudo consultar Odoo, se devuelve lo guardado:', safeErrorSummary(err));
        res.json({ ...stored, progress: {} });
        return;
      }
    }
    const loadedIds = new Set(orders.map(o => o.id));
    const metaIds = missingMetaOrderIds(stored, loadedIds);
    let metaOrders: OdooOrderMetaSnapshot[] = orders;
    const checkedIds = new Set<number>(loadedIds);
    if (client.isConfigured() && metaIds.length > 0) {
      try {
        const extraMeta = await client.fetchOrderMetaByIds(metaIds);
        metaOrders = [...orders, ...extraMeta];
        for (const id of metaIds) checkedIds.add(id);
      } catch (err) {
        logger.warn('solicitudes: no se pudieron completar metadatos desde Odoo:', safeErrorSummary(err));
      }
    }
    const now = new Date().toISOString();
    const rec = reconcileWithOdoo(stored, orders, now);
    let finalState = backfillRequestMeta(rec.state, metaOrders, checkedIds, now);
    let finalProgress = rec.progress;
    if (finalState !== stored) {
      const txOut = await admin.firestore().runTransaction(async tx => {
        const current = normalizeInvoiceRequests((await tx.get(requestsDoc())).data());
        const txNow = new Date().toISOString();
        const txRec = reconcileWithOdoo(current, orders, txNow);
        const txState = backfillRequestMeta(txRec.state, metaOrders, checkedIds, txNow);
        if (txState !== current) tx.set(requestsDoc(), txState);
        return { state: txState, progress: txRec.progress };
      });
      finalState = txOut.state;
      finalProgress = txOut.progress;
    }
    res.json({ ...finalState, progress: finalProgress });
  } catch (err) {
    logger.error('[InvoiceRequests] Error en GET:', safeErrorSummary(err));
    res.status(500).json({ error: 'No se pudieron consultar las solicitudes.' });
  }
});

app.post('/api/invoice-requests', requireWriteAccess, sensitiveRateLimit, async (req: Request, res: Response) => {
  const actor = res.locals.actor;
  if (!isActor(actor)) { res.status(403).json({ error: NO_ACTOR }); return; }
  let idempotencyKey: string | null = null;
  try {
    idempotencyKey = normalizeIdempotencyKey(req.get('Idempotency-Key'));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Idempotency-Key inválido.' });
    return;
  }
  let drafts;
  try {
    drafts = parseCreateRequestsBody(req.body);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Solicitud inválida.' });
    return;
  }
  const client = getOdooClient();
  if (!client.isConfigured()) { res.status(503).json({ error: 'Odoo no configurado.' }); return; }
  const payloadHash = createHash('sha256').update(JSON.stringify(drafts)).digest('hex');

  let orders;
  try {
    orders = (await client.fetchInvoiceableOrders()).orders; // sin caché: las cantidades deben ser las de ahora
  } catch {
    res.status(503).json({ error: 'No se pudo consultar Odoo; no se guardó nada.' });
    return;
  }
  try {
    const txOutcome = await admin.firestore().runTransaction(async tx => {
      const current = normalizeInvoiceRequests((await tx.get(requestsDoc())).data());
      const replay = lookupIdempotentReplay(current, idempotencyKey, payloadHash);
      if (replay.status === 'conflict') {
        return { kind: 'conflict' as const };
      }
      if (replay.status === 'hit') {
        return { kind: 'replay' as const, state: current, created: replay.created };
      }
      const now = new Date().toISOString();
      const out = createInvoiceRequests(current, drafts, orders, { actor, now, newId: randomUUID, isKnownSatCode });
      if (out.created.length > 0) {
        const nextState = recordIdempotencyKey(
          out.state,
          idempotencyKey,
          payloadHash,
          out.created.map(r => r.id),
          now,
        );
        tx.set(requestsDoc(), nextState);
        return { kind: 'created' as const, state: nextState, created: out.created, skipped: out.skipped };
      }
      return { kind: 'created' as const, state: out.state, created: out.created, skipped: out.skipped };
    });

    if (txOutcome.kind === 'conflict') {
      res.status(409).json({ error: 'La clave de idempotencia ya se usó con datos distintos.' });
      return;
    }
    if (txOutcome.kind === 'replay') {
      res.json({
        state: txOutcome.state,
        created: txOutcome.created,
        skipped: [],
        notified: false,
        emailed: false,
        replayed: true,
      });
      return;
    }

    if (txOutcome.created.length > 0) getOdooClient().invalidateOrdersCache();
    // El registro ya quedó guardado: si falla el correo o Discord solo se reporta.
    let emailed = false;
    if (txOutcome.created.length > 0) {
      const { GMAIL_USER, GMAIL_APP_PASSWORD, INVOICE_MAIL_TO, INVOICE_MAIL_CC } = getRuntimeEnv();
      if (GMAIL_USER && GMAIL_APP_PASSWORD && INVOICE_MAIL_TO) {
        const transport = getMailTransport(GMAIL_USER, GMAIL_APP_PASSWORD);
        const mailPayload = {
          ...buildMailEnvelope({ user: GMAIL_USER, to: INVOICE_MAIL_TO, cc: INVOICE_MAIL_CC || undefined }, actor),
          ...buildRequestsEmail(txOutcome.created, actor),
        };
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await transport.sendMail(mailPayload);
            emailed = true;
            break;
          } catch (err) {
            if (attempt === 0) {
              await new Promise(resolve => setTimeout(resolve, 800));
            } else {
              logger.error('correo de solicitud falló:', safeErrorSummary(err));
            }
          }
        }
      }
    }
    const notified = txOutcome.created.length > 0 ? await sendInvoiceRequestsNotice(txOutcome.created, actor) : false;
    if (txOutcome.created.length > 0) {
      void writeAuditLog(buildAuditEntry({
        action: 'invoice_requests.create',
        actor,
        resource: 'visual_factory_state/invoice_requests',
        outcome: 'success',
        requestId: typeof res.locals.requestId === 'string' ? res.locals.requestId : null,
        details: { createdCount: txOutcome.created.length, skippedCount: txOutcome.skipped.length, emailed, notified },
      }));
    }
    res.json({ state: txOutcome.state, created: txOutcome.created, skipped: txOutcome.skipped, notified, emailed });
  } catch (err) {
    const summary = safeErrorSummary(err);
    logger.error('[InvoiceRequests] Error en POST:', summary);
    if (summary.message.includes('tamaño máximo')) {
      res.status(409).json({ error: summary.message });
      return;
    }
    res.status(500).json({ error: 'No se pudieron crear las solicitudes.' });
  }
});

app.post('/api/invoice-requests/:id/done', requireWriteAccess, mutationRateLimit, async (req: Request, res: Response) => {
  const actor = res.locals.actor;
  if (!isActor(actor)) { res.status(403).json({ error: NO_ACTOR }); return; }
  const id = String(req.params.id ?? '');
  if (!isValidRequestId(id)) {
    res.status(400).json({ error: 'ID de solicitud inválido.' });
    return;
  }
  let validationError: string | null = null;
  try {
    const next = await admin.firestore().runTransaction(async tx => {
      const current = normalizeInvoiceRequests((await tx.get(requestsDoc())).data());
      let updated;
      try {
        updated = markInvoiceRequestDone(current, id, { actor, now: new Date().toISOString() });
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
    void writeAuditLog(buildAuditEntry({
      action: 'invoice_requests.done',
      actor,
      resource: `visual_factory_state/invoice_requests/${id}`,
      outcome: 'success',
      requestId: typeof res.locals.requestId === 'string' ? res.locals.requestId : null,
    }));
    res.json(next);
  } catch (err) {
    logger.error('[InvoiceRequests] Error en POST done:', safeErrorSummary(err));
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
  logger.error('[Functions API] Error no controlado:', {
    requestId: typeof res.locals.requestId === 'string' ? res.locals.requestId : null,
    ...safeErrorSummary(err),
  });
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// ─── Export API ───────────────────────────────────────────────────────────────
export const api = onRequest(
  { region: 'us-central1', timeoutSeconds: 60, memory: '256MiB', maxInstances: 10, secrets: API_SECRETS },
  app,
);

// ─── Scheduled Notifications ──────────────────────────────────────────────────
const TIME_ZONE = 'America/Chicago';

async function runNotificationTask(
  taskName: string,
  task: (orders: NotifOrder[], channels: WebhookChannels) => Promise<void>,
) {
  const env = getRuntimeEnv();
  const mainUrl = env.DISCORD_WEBHOOK_URL;
  const enabled = env.NOTIFICATIONS_ENABLED;

  if (!mainUrl || !enabled) {
    logger.info('[notifications] Desactivado (DISCORD_WEBHOOK_URL no configurado o NOTIFICATIONS_ENABLED=false)');
    return;
  }

  const channels = buildWebhookChannels(mainUrl);
  try {
    const { orders } = await getOdooClient().fetchInvoiceableOrders();
    await task(orders, channels);
  } catch (err) {
    const summary = safeErrorSummary(err);
    logger.error(`[notifications] Error ejecutando ${taskName}:`, summary);
    await writeAuditLog(buildAuditEntry({
      action: 'cron.task_failed',
      actor: { uid: 'system', name: 'Scheduler' },
      resource: `cron/${taskName}`,
      outcome: 'error',
      details: { taskName, errorName: summary.name },
    }));
    await sendWebhook(
      channels.reportes,
      `⚠️ Falló la tarea programada **${taskName}** (${summary.name}). Revisa los logs de Cloud Functions.`,
      [],
    ).catch(() => false);
  }
}

const SCHEDULE_OPTS = {
  region: 'us-central1',
  memory: '256MiB' as const,
  timeoutSeconds: 120,
  maxInstances: 1,
  secrets: NOTIFICATION_SECRETS,
};

// 1. Scan cada 30 minutos (umbrales y eventos)
export const scanNotifications = onSchedule({ schedule: 'every 30 minutes', timeZone: TIME_ZONE, concurrency: 1, ...SCHEDULE_OPTS }, async () => {
  await runNotificationTask('scanNotifications', async (orders, channels) => {
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
export const morningReport = onSchedule({ schedule: '0 8 * * 1-6', timeZone: TIME_ZONE, ...SCHEDULE_OPTS }, async () => {
  await runNotificationTask('morningReport', async (orders, channels) => {
    await sendMorningReport(orders, channels.reportes);
  });
});

// 3. Lun-Sáb 1:00 PM — reporte mediodía
export const middayReport = onSchedule({ schedule: '0 13 * * 1-6', timeZone: TIME_ZONE, ...SCHEDULE_OPTS }, async () => {
  await runNotificationTask('middayReport', async (orders, channels) => {
    await sendMiddayReport(orders, channels.reportes);
  });
});

// 4. Lun-Jue + Sáb 5:00 PM — cierre de turno normal
export const endOfShiftReport = onSchedule({ schedule: '0 17 * * 1-4,6', timeZone: TIME_ZONE, ...SCHEDULE_OPTS }, async () => {
  await runNotificationTask('endOfShiftReport', async (orders, channels) => {
    await sendEndOfShiftReport(orders, channels.reportes);
  });
});

// 5. Viernes 5:00 PM — cierre de semana
export const weekendReport = onSchedule({ schedule: '0 17 * * 5', timeZone: TIME_ZONE, ...SCHEDULE_OPTS }, async () => {
  await runNotificationTask('weekendReport', async (orders, channels) => {
    await sendWeekendReport(orders, channels.reportes);
  });
});

// 6. Lunes 9:00 AM — resumen semanal
export const weeklySummary = onSchedule({ schedule: '0 9 * * 1', timeZone: TIME_ZONE, ...SCHEDULE_OPTS }, async () => {
  await runNotificationTask('weeklySummary', async (orders, channels) => {
    await sendWeeklySummary(orders, channels.reportes);
  });
});
