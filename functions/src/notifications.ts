import * as admin from 'firebase-admin';

if (!admin.apps.length) admin.initializeApp();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotifOrder {
  id: number;
  name: string;
  partner_name: string;
  date_order: string; // "YYYY-MM-DD HH:MM:SS" UTC from Odoo
  main_product: string;
  commitment_date: string | null;
  lines_count: number;
  deliveries: { state: string; date_done?: string | null }[];
}

export interface WebhookChannels {
  eventos: string;
  criticas: string;
  reportes: string;
}

interface NotificationState {
  sentAlerts: Record<string, number>;       // "orderId_14d" → unix timestamp ms
  knownOrderIds: number[];
  deliveredOrderIds: number[];
  deliveryTimestamps: Record<string, { detectedAt: number; ageAtDelivery: number }>;
  clientAlertDates: Record<string, string>; // "ClientName" → "YYYY-MM-DD"
  lastMonthlyReportMonth: string;           // "YYYY-MM" del último reporte mensual enviado
  // v2 fields
  partialDeliveryAlerts: Record<string, number>;                    // orderId → timestamp when partial alert sent
  lastDeliveryStates: Record<string, { sig: string; changedAt: number }>; // orderId → {sig, changedAt}
  stalledAlerts: Record<string, number>;                            // orderId → timestamp when stall alert sent
  clientMonthlyStats: Record<string, Record<string, string[]>>;    // partnerName → {YYYY-MM → [orderId, ...]}
  recoveryNotifications: string[];                                  // orderIds that received recovery message
  weeklyBaselineOverdue: Record<string, number>;                    // YYYY-WW → count of >14d orders on Monday 8am
}

interface DiscordField {
  name: string;
  value: string;
  inline: boolean;
}

interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  timestamp: string;
  footer: { text: string };
  fields?: DiscordField[];
  image?: { url: string };
}

// ─── State ────────────────────────────────────────────────────────────────────

const EMPTY_STATE: NotificationState = {
  sentAlerts: {},
  knownOrderIds: [],
  deliveredOrderIds: [],
  deliveryTimestamps: {},
  clientAlertDates: {},
  lastMonthlyReportMonth: '',
  partialDeliveryAlerts: {},
  lastDeliveryStates: {},
  stalledAlerts: {},
  clientMonthlyStats: {},
  recoveryNotifications: [],
  weeklyBaselineOverdue: {},
};

const DELIVERY_HISTORY_RETENTION_MS = 90 * 86_400_000;
const MAX_DELIVERY_HISTORY_ENTRIES = 1500;
const MAX_WEEKLY_BASELINE_WEEKS = 12;

export async function loadState(): Promise<NotificationState> {
  try {
    const doc = await admin.firestore().collection('config').doc('notification_state').get();
    if (doc.exists) return { ...EMPTY_STATE, ...doc.data() } as NotificationState;
  } catch (e) {
    console.error('[notifications] Error cargando estado de Firestore:', e);
  }
  return JSON.parse(JSON.stringify(EMPTY_STATE));
}

export async function saveState(state: NotificationState): Promise<void> {
  const pruned = pruneDeliveryHistory(state);
  try {
    await admin.firestore().collection('config').doc('notification_state').set(pruned);
  } catch (e) {
    console.error('[notifications] Error guardando estado en Firestore:', e);
  }
}

/** Evita que deliveredOrderIds/deliveryTimestamps/weeklyBaselineOverdue crezcan sin límite. */
function pruneDeliveryHistory(state: NotificationState): NotificationState {
  const cutoff = Date.now() - DELIVERY_HISTORY_RETENTION_MS;
  const timestamps = state.deliveryTimestamps ?? {};
  const prunedEntries = Object.entries(timestamps)
    .filter(([, value]) => value.detectedAt >= cutoff)
    .sort((a, b) => b[1].detectedAt - a[1].detectedAt)
    .slice(0, MAX_DELIVERY_HISTORY_ENTRIES);

  const deliveryTimestamps: NotificationState['deliveryTimestamps'] = {};
  for (const [key, value] of prunedEntries) {
    deliveryTimestamps[key] = value;
  }

  const validIds = new Set(Object.keys(deliveryTimestamps).map(id => Number(id)));
  const deliveredOrderIds = (state.deliveredOrderIds ?? []).filter(id => validIds.has(id));

  const baseline = state.weeklyBaselineOverdue ?? {};
  const prunedBaselineEntries = Object.entries(baseline)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, MAX_WEEKLY_BASELINE_WEEKS);
  const weeklyBaselineOverdue: NotificationState['weeklyBaselineOverdue'] = {};
  for (const [key, value] of prunedBaselineEntries) {
    weeklyBaselineOverdue[key] = value;
  }

  return { ...state, deliveryTimestamps, deliveredOrderIds, weeklyBaselineOverdue };
}

export function buildWebhookChannels(mainUrl: string): WebhookChannels {
  return {
    eventos: mainUrl,
    criticas: process.env.DISCORD_WEBHOOK_URL_CRITICOS || mainUrl,
    reportes: process.env.DISCORD_WEBHOOK_URL_REPORTES || mainUrl,
  };
}

// Strips Discord mention syntax from Odoo-sourced strings to prevent
// an Odoo customer name like "@everyone" from pinging the whole server.
function escapeDiscord(s: string): string {
  return s.replace(/@/g, '\\@');
}

// ─── Discord webhook ──────────────────────────────────────────────────────────

let lastSendMs = 0;

async function postWebhook(url: string, body: string): Promise<Response> {
  // Enforce minimum 1.5s between sends to stay under Discord's per-webhook rate limit
  const wait = 1500 - (Date.now() - lastSendMs);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastSendMs = Date.now();
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}

interface DiscordWebhookPayload {
  content: string;
  embeds: DiscordEmbed[];
  thread_name?: string;
}

export async function sendWebhook(url: string, content: string, embeds: DiscordEmbed[], threadName?: string): Promise<void> {
  const payload: DiscordWebhookPayload = { content, embeds };
  if (threadName) payload.thread_name = threadName;
  const body = JSON.stringify(payload);
  try {
    let res = await postWebhook(url, body);
    if (res.status === 429) {
      const { retry_after } = await res.json() as { retry_after?: number };
      await new Promise(r => setTimeout(r, Math.ceil((retry_after ?? 1) * 1000) + 500));
      lastSendMs = Date.now();
      res = await postWebhook(url, body);
    }
    if (!res.ok) {
      console.error(`[notifications] Discord webhook falló: ${res.status} ${await res.text()}`);
    }
  } catch (e) {
    console.error('[notifications] Error enviando webhook a Discord:', e);
  }
}

function nowISO(): string {
  return new Date().toISOString();
}

function getDashboardUrl(): string {
  return process.env.DASHBOARD_URL ?? 'https://dashboardsmv.web.app';
}

function parseOdooDateUtc(dateStr: string): Date {
  return new Date(dateStr.replace(' ', 'T') + 'Z');
}

function truncateProduct(product: string, maxLen = 60): string {
  const trimmed = product.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

function calendarDaysSince(dateStr: string): number {
  const d = parseOdooDateUtc(dateStr);
  const now = new Date();
  const msPerDay = 86_400_000;
  return Math.floor((now.getTime() - d.getTime()) / msPerDay);
}

function formatCommitmentLine(commitmentDate: string | null | undefined): string | null {
  if (!commitmentDate) return null;
  const d = parseOdooDateUtc(commitmentDate);
  const formatted = d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  const days = calendarDaysSince(commitmentDate);
  if (days > 0) return `📅 Compromiso: ${formatted} (vencido hace ${days} día${days !== 1 ? 's' : ''})`;
  if (days < 0) return `📅 Compromiso: ${formatted} (en ${Math.abs(days)} día${Math.abs(days) !== 1 ? 's' : ''})`;
  return `📅 Compromiso: ${formatted} (hoy)`;
}

function buildOrderDetailLines(order: NotifOrder): string[] {
  const lines: string[] = [];
  const product = order.main_product?.trim();
  if (product) lines.push(`🔩 ${truncateProduct(product)}`);
  const commitment = formatCommitmentLine(order.commitment_date);
  if (commitment) lines.push(commitment);
  lines.push(`🔗 [Ver en tablero](${getDashboardUrl()})`);
  return lines;
}

function orderEventDescription(order: NotifOrder, bodyLines: string[]): string {
  return [...bodyLines, '', ...buildOrderDetailLines(order)].join('\n');
}

export function orderAgeEmbed(order: NotifOrder, ageDays: number, color: number, title: string, trendLine?: string): DiscordEmbed {
  const delivered = order.deliveries.filter(d => d.state === 'done').length;
  const pending   = order.deliveries.filter(d => d.state !== 'done' && d.state !== 'cancel').length;
  const lines = [
    `**${order.name}** · ${escapeDiscord(order.partner_name)}`,
    `⏱ **${ageDays} días** sin entregar`,
    `📦 Entregas: ${pending} pendientes / ${delivered} completadas`,
    ...buildOrderDetailLines(order),
  ];
  if (trendLine) lines.push('', `📊 ${trendLine}`);
  return {
    title,
    description: lines.join('\n'),
    color,
    timestamp: nowISO(),
    footer: { text: 'Visual Factory TV · Odoo' },
  };
}

export function reportEmbed(title: string, lines: string | string[], color: number, imageUrl?: string): DiscordEmbed {
  const embed: DiscordEmbed = {
    title,
    description: Array.isArray(lines) ? lines.join('\n') : lines,
    color,
    timestamp: nowISO(),
    footer: { text: 'Visual Factory TV · Odoo' },
  };
  if (imageUrl) embed.image = { url: imageUrl };
  return embed;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getOrderAgeDays(dateOrder: string): number {
  const d = parseOdooDateUtc(dateOrder);
  const now = new Date();

  let count = 0;
  const cur = new Date(d);
  while (cur < now) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    // 0 es Domingo, 6 es Sábado
    if (day !== 0 && day !== 6) {
      count++;
    }
  }
  return count;
}

export function isFullyDelivered(order: NotifOrder): boolean {
  const active = order.deliveries.filter(d => d.state !== 'cancel');
  return active.length > 0 && active.every(d => d.state === 'done');
}

export function getClientMention(partnerName: string): string {
  const partnerKey = partnerName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const roleId = process.env[`DISCORD_ROLE_${partnerKey}`];
  return roleId ? `<@&${roleId}>` : '@everyone';
}

function getReportMention(): string {
  const roleId = process.env.DISCORD_ROLE_GENERAL;
  return roleId ? `<@&${roleId}>` : '';
}

// Returns "YYYY-WW" using ISO week numbering (Monday = start of week)
function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getLastNISOWeeks(n: number): string[] {
  const weeks: string[] = [];
  const cur = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(cur);
    d.setDate(d.getDate() - i * 7);
    weeks.unshift(getISOWeek(d));
  }
  return [...new Set(weeks)].slice(-n);
}

function buildWeeklyChartUrl(state: NotificationState): string {
  const weeks = getLastNISOWeeks(8);
  const labels = weeks.map(w => w.replace(/^\d+-/, ''));

  const deliveryCounts: Record<string, number> = {};
  for (const entry of Object.values(state.deliveryTimestamps ?? {})) {
    const w = getISOWeek(new Date(entry.detectedAt));
    deliveryCounts[w] = (deliveryCounts[w] ?? 0) + 1;
  }

  const entregas = weeks.map(w => deliveryCounts[w] ?? 0);
  const criticas = weeks.map(w => (state.weeklyBaselineOverdue ?? {})[w] ?? 0);

  const config = {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Entregas', data: entregas, backgroundColor: '#16A34A' },
        { label: 'Críticas (lunes)', data: criticas, type: 'line', borderColor: '#DC2626', fill: false },
      ],
    },
    options: {
      plugins: { title: { display: true, text: 'Últimas 8 semanas' } },
      scales: { y: { beginAtZero: true } },
    },
  };

  return `https://quickchart.io/chart?w=500&h=300&c=${encodeURIComponent(JSON.stringify(config))}`;
}

// Business days elapsed since a given timestamp (weekends excluded)
function businessDaysSince(timestamp: number): number {
  const now = new Date();
  let count = 0;
  const cur = new Date(timestamp);
  while (cur < now) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

// Sorted state signature for a delivery list (excludes cancelled)
function buildDeliverySig(order: NotifOrder): string {
  return order.deliveries
    .filter(d => d.state !== 'cancel')
    .map(d => d.state)
    .sort()
    .join(',');
}

// Registers orderId for this client+month (deduplicates per order)
function updateClientMonthlyStats(partnerName: string, orderId: number, month: string, state: NotificationState): void {
  state.clientMonthlyStats ??= {};
  state.clientMonthlyStats[partnerName] ??= {};
  state.clientMonthlyStats[partnerName][month] ??= [];
  const key = String(orderId);
  if (!state.clientMonthlyStats[partnerName][month].includes(key)) {
    state.clientMonthlyStats[partnerName][month].push(key);
  }
}

// Returns trend label based on how many distinct orders this client has had overdue this month
function getClientTrendLabel(partnerName: string, month: string, state: NotificationState): string | null {
  const count = (state.clientMonthlyStats ?? {})[partnerName]?.[month]?.length ?? 0;
  if (count === 0) return null;
  if (count === 1) return 'Primera orden atrasada este mes';
  if (count === 2) return '2ª orden atrasada este mes';
  return `⚠️ Cliente recurrente — ${count}ª orden atrasada este mes`;
}

const STALL_DAYS = parseInt(process.env.STALL_THRESHOLD_DAYS ?? '3', 10);
const LARGE_ORDER_LINES = parseInt(process.env.DISCORD_LARGE_ORDER_LINES ?? '5', 10);

// ─── Threshold alerts ─────────────────────────────────────────────────────────

export async function checkThresholds(
  orders: NotifOrder[],
  channels: WebhookChannels,
): Promise<void> {
  const state = await loadState();
  let dirty = false;

  const thresholds = [
    { days: 14, key: '14d', color: 0xDC2626, title: '🔴 Orden atrasada — 2 semanas' },
    { days: 21, key: '21d', color: 0xB91C1C, title: '🚨 Orden atrasada — 3 semanas' },
    { days: 30, key: '30d', color: 0x7F1D1D, title: '💀 Orden crítica — 1 mes' },
  ] as const;

  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  for (const order of orders) {
    if (isFullyDelivered(order)) continue;
    const ageDays = getOrderAgeDays(order.date_order);

    for (const t of thresholds) {
      if (ageDays < t.days) continue;
      const alertKey = `${order.id}_${t.key}`;
      if (state.sentAlerts[alertKey]) continue;

      updateClientMonthlyStats(order.partner_name, order.id, currentMonth, state);
      const trendLabel = getClientTrendLabel(order.partner_name, currentMonth, state);

      const mention = getClientMention(order.partner_name);
      await sendWebhook(channels.criticas, mention, [orderAgeEmbed(order, ageDays, t.color, t.title, trendLabel ?? undefined)]);
      state.sentAlerts[alertKey] = Date.now();
      dirty = true;
    }
  }

  if (dirty) await saveState(state);
}

// ─── Internal event helpers ───────────────────────────────────────────────────

// Fires once per order when at least one delivery completes but others remain
async function checkPartialDelivery(orders: NotifOrder[], eventosUrl: string, state: NotificationState): Promise<boolean> {
  let dirty = false;
  state.partialDeliveryAlerts ??= {};

  for (const order of orders) {
    if (isFullyDelivered(order)) continue;
    const active = order.deliveries.filter(d => d.state !== 'cancel');
    if (active.length === 0) continue;
    const done = active.filter(d => d.state === 'done');
    if (done.length === 0) continue; // nothing done yet

    const key = String(order.id);
    if (state.partialDeliveryAlerts[key]) continue; // already notified

    state.partialDeliveryAlerts[key] = Date.now();
    await sendWebhook(eventosUrl, '', [reportEmbed(
      `📦 Entrega parcial — ${order.name}`,
      orderEventDescription(order, [
        `**Cliente:** ${escapeDiscord(order.partner_name)}`,
        `**Remisiones:** ${done.length} de ${active.length} completadas`,
      ]),
      0x10B981,
    )]);
    dirty = true;
  }
  return dirty;
}

// Fires when no delivery state has changed for STALL_DAYS business days
// Clears on state change so it can re-fire if the order stalls again
async function checkStalledOrders(orders: NotifOrder[], criticasUrl: string, state: NotificationState): Promise<boolean> {
  let dirty = false;
  state.lastDeliveryStates ??= {};
  state.stalledAlerts ??= {};

  for (const order of orders) {
    if (isFullyDelivered(order)) continue;
    const active = order.deliveries.filter(d => d.state !== 'cancel');
    if (active.length === 0) continue;

    const key = String(order.id);
    const sig = buildDeliverySig(order);
    const prev = state.lastDeliveryStates[key];

    if (!prev || prev.sig !== sig) {
      // State changed — record new baseline and clear any existing stall alert
      state.lastDeliveryStates[key] = { sig, changedAt: Date.now() };
      if (state.stalledAlerts[key]) delete state.stalledAlerts[key];
      dirty = true;
      continue;
    }

    // Same state — check if stalled long enough
    if (state.stalledAlerts[key]) continue; // already notified about this stall episode
    if (businessDaysSince(prev.changedAt) < STALL_DAYS) continue;

    state.stalledAlerts[key] = Date.now();
    await sendWebhook(criticasUrl, '', [reportEmbed(
      `⏸️ Orden sin movimiento — ${order.name}`,
      orderEventDescription(order, [
        `**Cliente:** ${escapeDiscord(order.partner_name)}`,
        `**Sin cambios en remisiones:** ${STALL_DAYS} días hábiles`,
      ]),
      0xF59E0B,
    )]);
    dirty = true;
  }
  return dirty;
}

// ─── Event alerts ─────────────────────────────────────────────────────────────

export async function checkEvents(orders: NotifOrder[], channels: WebhookChannels): Promise<void> {
  const state = await loadState();
  let dirty = false;
  const todayStr = new Date().toISOString().slice(0, 10);

  // --- New large orders ---
  const isFirstRun = state.knownOrderIds.length === 0;

  for (const order of orders) {
    if (!state.knownOrderIds.includes(order.id) && order.lines_count >= LARGE_ORDER_LINES) {
      const ageDays = getOrderAgeDays(order.date_order);
      // Solo notificar si la orden tiene 2 días o menos para evitar spam de órdenes viejas en reinicios
      if (!isFirstRun && ageDays <= 2) {
        await sendWebhook(channels.eventos, '', [reportEmbed(
          `📦 Nueva orden grande — ${order.name}`,
          orderEventDescription(order, [
            `**Cliente:** ${escapeDiscord(order.partner_name)}`,
            `**Líneas de producto:** ${order.lines_count}`,
            `**Fecha:** ${order.date_order.slice(0, 10)}`,
          ]),
          0x2563EB,
        )]);
      }
    }
  }
  state.knownOrderIds = orders.map(o => o.id);
  dirty = true;

  // --- Delivered orders (state changed to fully delivered) ---
  state.recoveryNotifications ??= [];
  for (const order of orders) {
    if (isFullyDelivered(order) && !state.deliveredOrderIds.includes(order.id)) {
      const ageAtDelivery = getOrderAgeDays(order.date_order);
      const orderKey = String(order.id);
      const hadCriticalAlert = state.sentAlerts[`${order.id}_14d`]
        || state.sentAlerts[`${order.id}_21d`]
        || state.sentAlerts[`${order.id}_30d`];

      if (hadCriticalAlert && !state.recoveryNotifications.includes(orderKey)) {
        await sendWebhook(channels.eventos, '', [reportEmbed(
          `✅ Orden recuperada — ${order.name}`,
          orderEventDescription(order, [
            `**Cliente:** ${escapeDiscord(order.partner_name)}`,
            `**Entregada con:** ${ageAtDelivery} días hábiles de atraso`,
          ]),
          0x059669,
        )]);
        state.recoveryNotifications.push(orderKey);
      } else {
        await sendWebhook(channels.eventos, '', [reportEmbed(
          `✅ Orden entregada — ${order.name}`,
          orderEventDescription(order, [
            `**Cliente:** ${escapeDiscord(order.partner_name)}`,
            `**Duración:** ${ageAtDelivery} días`,
          ]),
          0x16A34A,
        )]);
      }

      delete (state.partialDeliveryAlerts ?? {})[orderKey];
      delete (state.lastDeliveryStates ?? {})[orderKey];
      delete (state.stalledAlerts ?? {})[orderKey];

      state.deliveredOrderIds.push(order.id);
      state.deliveryTimestamps[orderKey] = { detectedAt: Date.now(), ageAtDelivery };
      dirty = true;
    }
  }

  // --- Client with 3+ overdue orders (>14 days), once per client per day ---
  const overdueByClient: Record<string, NotifOrder[]> = {};
  for (const order of orders) {
    if (!isFullyDelivered(order) && getOrderAgeDays(order.date_order) >= 14) {
      (overdueByClient[order.partner_name] ??= []).push(order);
    }
  }
  for (const [client, clientOrders] of Object.entries(overdueByClient)) {
    if (clientOrders.length < 3) continue;
    if (state.clientAlertDates[client] === todayStr) continue;
    const bullets = clientOrders
      .sort((a, b) => getOrderAgeDays(b.date_order) - getOrderAgeDays(a.date_order))
      .map(o => `  • ${o.name} (${getOrderAgeDays(o.date_order)}d)`);
    const mention = getClientMention(client);
    await sendWebhook(channels.criticas, mention, [reportEmbed(
      `👥 Cliente con múltiples órdenes atrasadas`,
      [`**${escapeDiscord(client)}** — ${clientOrders.length} órdenes con más de 14 días hábiles:`, ...bullets],
      0xEA580C,
    )]);
    state.clientAlertDates[client] = todayStr;
    dirty = true;
  }

  dirty = (await checkPartialDelivery(orders, channels.eventos, state)) || dirty;
  dirty = (await checkStalledOrders(orders, channels.criticas, state)) || dirty;

  if (dirty) await saveState(state);
}

// ─── Scheduled reports ────────────────────────────────────────────────────────

export async function sendMorningReport(orders: NotifOrder[], mainUrl: string): Promise<void> {
  const active = orders.filter(o => !isFullyDelivered(o));
  const over7  = active.filter(o => getOrderAgeDays(o.date_order) >= 7);
  const over14 = active.filter(o => getOrderAgeDays(o.date_order) >= 14);
  const over30 = active.filter(o => getOrderAgeDays(o.date_order) >= 30);

  const lines: string[] = [
    `📋 **${active.length}** activas · 🟡 **${over7.length}** >7d · 🔴 **${over14.length}** >14d · 💀 **${over30.length}** >30d`,
    '',
  ];

  if (over14.length > 0) {
    lines.push('🔴 **Órdenes críticas (>14 días):**');
    over14
      .sort((a, b) => getOrderAgeDays(b.date_order) - getOrderAgeDays(a.date_order))
      .slice(0, 10)
      .forEach(o => lines.push(`  • ${o.name} · ${escapeDiscord(o.partner_name)} (${getOrderAgeDays(o.date_order)}d)`));
  } else {
    lines.push('✅ Sin órdenes críticas hoy.');
  }

  const now = new Date();
  const state = await loadState();
  const weekKey = getISOWeek(now);
  state.weeklyBaselineOverdue ??= {};

  if (now.getDay() === 1) {
    state.weeklyBaselineOverdue[weekKey] = over14.length;
    await saveState(state);
  } else {
    const baseline = state.weeklyBaselineOverdue[weekKey];
    if (baseline !== undefined) {
      const delta = over14.length - baseline;
      if (delta > 0) lines.push('', `📈 **+${delta}** atrasadas vs el lunes`);
      else if (delta < 0) lines.push('', `📉 **${Math.abs(delta)}** menos atrasada${Math.abs(delta) !== 1 ? 's' : ''} vs el lunes`);
    }
  }

  await sendWebhook(mainUrl, getReportMention(), [reportEmbed('📊 Reporte matutino — Visual Factory', lines, 0x1E40AF)]);
}

export async function sendWeeklySummary(orders: NotifOrder[], mainUrl: string): Promise<void> {
  const state = await loadState();
  const active    = orders.filter(o => !isFullyDelivered(o));
  const delivered = orders.filter(o => isFullyDelivered(o));

  const clientCounts: Record<string, number> = {};
  for (const o of active) {
    if (getOrderAgeDays(o.date_order) >= 14) {
      clientCounts[o.partner_name] = (clientCounts[o.partner_name] ?? 0) + 1;
    }
  }
  const topClients = Object.entries(clientCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `  • ${escapeDiscord(name)}: ${count} órdenes`);

  const oldest = [...active].sort((a, b) => getOrderAgeDays(b.date_order) - getOrderAgeDays(a.date_order))[0];

  const lines = [
    `📋 **${active.length}** activas · ✅ **${delivered.length}** entregadas`,
    '',
    '🏆 **Top clientes con órdenes atrasadas (+14d):**',
    ...(topClients.length > 0 ? topClients : ['  Ninguno esta semana']),
    '',
    oldest ? `⏳ **Orden más antigua:** ${oldest.name} · ${escapeDiscord(oldest.partner_name)} (${getOrderAgeDays(oldest.date_order)}d)` : '✅ Sin órdenes activas.',
  ].filter(Boolean);

  const chartUrl = buildWeeklyChartUrl(state);
  await sendWebhook(mainUrl, getReportMention(), [reportEmbed('📅 Resumen semanal — Visual Factory', lines, 0x7C3AED, chartUrl)]);
}

export async function sendMiddayReport(orders: NotifOrder[], mainUrl: string): Promise<void> {
  const overdue = orders.filter(o => !isFullyDelivered(o) && getOrderAgeDays(o.date_order) >= 14);
  if (overdue.length === 0) return;
  const lines = [
    `🔴 **${overdue.length}** órdenes con más de 14 días pendientes:`,
    ...overdue
      .sort((a, b) => getOrderAgeDays(b.date_order) - getOrderAgeDays(a.date_order))
      .slice(0, 8)
      .map(o => `  • ${o.name} · ${escapeDiscord(o.partner_name)} (${getOrderAgeDays(o.date_order)}d)`),
  ];
  await sendWebhook(mainUrl, '', [reportEmbed('☀️ Reporte mediodía — Visual Factory', lines, 0xD97706)]);
}

export async function sendEndOfShiftReport(orders: NotifOrder[], mainUrl: string): Promise<void> {
  const active  = orders.filter(o => !isFullyDelivered(o));
  const overdue = active.filter(o => getOrderAgeDays(o.date_order) >= 14);
  const lines = [
    `📋 **${active.length}** activas al cierre · 🔴 **${overdue.length}** críticas (>14d)`,
    overdue.length > 0
      ? '⚠️ Quedan órdenes críticas para mañana.'
      : '✅ Sin órdenes críticas al cierre de turno.',
  ];
  await sendWebhook(mainUrl, '', [reportEmbed('🌙 Cierre de turno — Visual Factory', lines, 0x475569)]);
}

// ─── Cierre de semana (viernes 5pm) ──────────────────────────────────────────

export async function sendWeekendReport(orders: NotifOrder[], mainUrl: string): Promise<void> {
  const state = await loadState();
  const weekAgo = Date.now() - 7 * 86_400_000;
  const thisWeek = Object.values(state.deliveryTimestamps).filter(d => d.detectedAt >= weekAgo);
  const active   = orders.filter(o => !isFullyDelivered(o));
  const overdue  = active.filter(o => getOrderAgeDays(o.date_order) >= 14);
  const avgAge   = thisWeek.length > 0
    ? Math.round(thisWeek.reduce((s, d) => s + d.ageAtDelivery, 0) / thisWeek.length)
    : null;

  const lines: string[] = [
    `✅ **${thisWeek.length}** entregas esta semana${avgAge !== null ? ` · promedio **${avgAge} días** por entrega` : ''}`,
    `📋 **${active.length}** activas · 🔴 **${overdue.length}** críticas (>14d)`,
  ];
  if (overdue.length > 0) {
    lines.push('', '⚠️ **Pendientes críticas al cierre de semana:**');
    overdue
      .sort((a, b) => getOrderAgeDays(b.date_order) - getOrderAgeDays(a.date_order))
      .slice(0, 5)
      .forEach(o => lines.push(`  • ${o.name} · ${escapeDiscord(o.partner_name)} (${getOrderAgeDays(o.date_order)}d)`));
  } else {
    lines.push('✅ Sin críticas al cierre de semana.');
  }

  await sendWebhook(mainUrl, '', [reportEmbed('📅 Cierre de semana — Visual Factory', lines, 0x7C3AED)]);
}

// ─── Reporte mensual (1° de cada mes) ─────────────────────────────────────────

function prevMonthRange(): { start: number; end: number; label: string } {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = now.getMonth();
  return {
    start: new Date(y, m - 1, 1).getTime(),
    end:   new Date(y, m, 1).getTime(),
    label: new Date(y, m - 1).toLocaleString('es-MX', { month: 'long', year: 'numeric' }),
  };
}

export async function sendMonthlyReport(orders: NotifOrder[], mainUrl: string): Promise<void> {
  const state = await loadState();
  const { start, end, label } = prevMonthRange();

  const monthDeliveries = Object.values(state.deliveryTimestamps)
    .filter(d => d.detectedAt >= start && d.detectedAt < end);

  const avgAge = monthDeliveries.length > 0
    ? Math.round(monthDeliveries.reduce((s, d) => s + d.ageAtDelivery, 0) / monthDeliveries.length)
    : null;

  const active  = orders.filter(o => !isFullyDelivered(o));
  const overdue = active.filter(o => getOrderAgeDays(o.date_order) >= 14);

  const clientCounts: Record<string, number> = {};
  for (const o of overdue) {
    clientCounts[o.partner_name] = (clientCounts[o.partner_name] ?? 0) + 1;
  }
  const topClients = Object.entries(clientCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `  • ${escapeDiscord(name)}: ${count} órdenes con >14d`);

  const lines: string[] = [
    `📦 **${monthDeliveries.length}** entregas en ${label}${avgAge !== null ? ` · promedio **${avgAge} días** por entrega` : ''}`,
    `📋 **${active.length}** órdenes activas al inicio del mes`,
    '',
    '👥 **Clientes con más atrasos (>14d):**',
    ...(topClients.length > 0 ? topClients : ['  Ninguno — ¡excelente mes!']),
  ];

  await sendWebhook(mainUrl, getReportMention(), [reportEmbed(`📊 Reporte mensual — ${label}`, lines, 0x0EA5E9)]);
}
