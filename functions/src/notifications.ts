import * as admin from 'firebase-admin';
import { EMPTY_STATE, persistNotificationState, type NotificationState } from './notificationState';

if (!admin.apps.length) admin.initializeApp();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotifOrder {
  id: number;
  name: string;
  partner_name: string;
  date_order: string; // "YYYY-MM-DD HH:MM:SS" UTC from Odoo
  main_product: string;
  commitment_date: string | null;
  customer_reference?: string | null;
  lines_count: number;
  deliveries: { state: string; date_done?: string | null }[];
  qty_total?: number;
  qty_delivered?: number;
}

export interface WebhookChannels {
  eventos: string;
  criticas: string;
  reportes: string;
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

export interface NotificationRuntime {
  loadState: typeof loadState;
  saveState: typeof saveState;
  sendWebhook: typeof sendWebhook;
}

const defaultRuntime: NotificationRuntime = { loadState, saveState, sendWebhook };

// ─── State ────────────────────────────────────────────────────────────────────

export async function loadState(): Promise<NotificationState> {
  const initial = structuredClone(EMPTY_STATE);
  try {
    const doc = await admin.firestore().collection('config').doc('notification_state').get();
    if (doc.exists) return { ...initial, ...doc.data() } as NotificationState;
  } catch (e) {
    console.error('[notifications] Error cargando estado de Firestore:', e);
    throw new Error('No se pudo leer la deduplicación; se cancela el envío para evitar avisos repetidos.');
  }
  return initial;
}

export async function saveState(
  state: NotificationState,
  fields: readonly (keyof NotificationState)[],
): Promise<void> {
  try {
    const document = admin.firestore().collection('config').doc('notification_state');
    await persistNotificationState(document, state, fields);
  } catch (e) {
    console.error('[notifications] Error guardando estado en Firestore:', e);
    throw new Error('No se pudo guardar el estado de notificaciones.');
  }
}

export function buildWebhookChannels(mainUrl: string): WebhookChannels {
  const criticasUrl = process.env.DISCORD_WEBHOOK_URL_CRITICOS
    || process.env.DISCORD_WEBHOOK_URL_CRITICAS;
  return {
    eventos: mainUrl,
    criticas: criticasUrl || mainUrl,
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
  const target = new URL(url);
  target.searchParams.set('wait', 'true');
  return fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(15000) });
}

interface DiscordWebhookPayload {
  content: string;
  embeds: DiscordEmbed[];
  thread_name?: string;
  allowed_mentions: { parse: string[]; roles: string[] };
}

export async function sendWebhook(url: string, content: string, embeds: DiscordEmbed[], threadName?: string): Promise<boolean> {
  const roles = Array.from(content.matchAll(/<@&(\d+)>/g), match => match[1]);
  const payload: DiscordWebhookPayload = {
    content, embeds,
    allowed_mentions: { parse: content.includes('@everyone') ? ['everyone'] : [], roles },
  };
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
      console.error(`[notifications] Discord webhook falló: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[notifications] Error enviando webhook a Discord:', e instanceof Error ? e.name : 'Error');
    return false;
  }
}

function nowISO(): string {
  return new Date().toISOString();
}

function getDashboardUrl(): string {
  return process.env.DASHBOARD_URL ?? 'https://dashboardsmv.web.app';
}

function parseOdooDateUtc(dateStr: string): Date {
  return new Date(dateStr.includes('T') ? dateStr : dateStr.includes(' ') ? dateStr.replace(' ', 'T') + 'Z' : `${dateStr}T00:00:00Z`);
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
  if (Number.isNaN(d.getTime())) return null;
  const formatted = d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  const days = calendarDaysSince(commitmentDate);
  if (d.getTime() < Date.now()) return `📅 Compromiso: ${formatted} (vencido${days > 0 ? ` hace ${days} día${days !== 1 ? 's' : ''}` : ' hace menos de un día'})`;
  if (days < 0) return `📅 Compromiso: ${formatted} (en ${Math.abs(days)} día${Math.abs(days) !== 1 ? 's' : ''})`;
  return `📅 Compromiso: ${formatted} (hoy)`;
}

function buildOrderDetailLines(order: NotifOrder): string[] {
  const lines: string[] = [];
  if (order.customer_reference) lines.push(`**PO del cliente:** ${escapeDiscord(truncateProduct(order.customer_reference, 120))}`);
  const product = order.main_product?.trim();
  if (product) lines.push(`🔩 ${escapeDiscord(truncateProduct(product))}`);
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
    `**${escapeDiscord(order.name)}** · ${escapeDiscord(order.partner_name)}`,
    `⏱ ${ageDays} días hábiles de antigüedad · entrega pendiente`,
    `📦 Entregas: ${pending} pendientes / ${delivered} completadas`,
    ...buildOrderDetailLines(order),
    '**Acción:** confirmar avance y fecha de entrega con el responsable.',
  ];
  if (trendLine) lines.push('', `📊 ${trendLine}`);
  return {
    title,
    description: lines.join('\n').slice(0, 4096),
    color,
    timestamp: nowISO(),
    footer: { text: 'Visual Factory TV · Odoo' },
  };
}

export function reportEmbed(title: string, lines: string | string[], color: number, imageUrl?: string): DiscordEmbed {
  const embed: DiscordEmbed = {
    title: title.slice(0, 256),
    description: (Array.isArray(lines) ? lines.join('\n') : lines).slice(0, 4096),
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
  d.setUTCHours(0, 0, 0, 0);
  now.setUTCHours(0, 0, 0, 0);
  let count = 0;
  const cur = new Date(d);
  while (cur < now) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    const day = cur.getUTCDay();
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
  return roleId ? `<@&${roleId}>` : getReportMention();
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
  return getOrderAgeDays(new Date(timestamp).toISOString());
}

// Sorted state signature for a delivery list (excludes cancelled)
function buildDeliverySig(order: NotifOrder): string {
  return `${order.qty_delivered ?? ''}|` + order.deliveries
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

const STALL_DAYS = parseInt(process.env.STALL_THRESHOLD_DAYS ?? '3', 10);
const LARGE_ORDER_LINES = parseInt(process.env.DISCORD_LARGE_ORDER_LINES ?? '5', 10);

interface PendingAlert {
  url: string;
  mention: string;
  embed: DiscordEmbed;
  onSent: () => void;
}

function embedLength(embed: DiscordEmbed): number {
  return embed.title.length + (embed.description?.length ?? 0) + embed.footer.text.length
    + (embed.fields ?? []).reduce((sum, field) => sum + field.name.length + field.value.length, 0);
}

/** Un ping por destino/rol; lotes acotados a los límites de Discord. */
async function sendGroupedAlerts(
  alerts: PendingAlert[], runtime: NotificationRuntime, checkpoint: () => Promise<void>,
): Promise<void> {
  const groups = new Map<string, PendingAlert[]>();
  for (const alert of alerts) {
    const key = JSON.stringify([alert.url, alert.mention]);
    const group = groups.get(key) ?? [];
    group.push(alert);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    let offset = 0;
    let mentioned = false;
    while (offset < group.length) {
      const batch: PendingAlert[] = [];
      let length = 0;
      while (offset < group.length && batch.length < 10) {
        const next = group[offset];
        const nextLength = embedLength(next.embed);
        if (batch.length && length + nextLength > 6000) break;
        batch.push(next);
        length += nextLength;
        offset++;
      }
      const content = `${mentioned ? '' : group[0].mention} ${batch.length} aviso${batch.length === 1 ? '' : 's'} de Odoo`.trim();
      if (await runtime.sendWebhook(group[0].url, content, batch.map(alert => alert.embed))) {
        mentioned = true;
        for (const alert of batch) alert.onSent();
        await checkpoint();
      }
    }
  }
}

// ─── Threshold alerts ─────────────────────────────────────────────────────────

export async function checkThresholds(
  orders: NotifOrder[],
  channels: WebhookChannels,
  runtime: NotificationRuntime = defaultRuntime,
): Promise<void> {
  const state = await runtime.loadState();
  const alerts: PendingAlert[] = [];

  const thresholds = [
    { days: 14, key: '14d', color: 0xDC2626, title: '🔴 Entrega pendiente — 14 días hábiles o más' },
    { days: 21, key: '21d', color: 0xB91C1C, title: '🚨 Entrega pendiente — 21 días hábiles o más' },
    { days: 30, key: '30d', color: 0x7F1D1D, title: '🚨 Entrega pendiente — 30 días hábiles o más' },
  ] as const;

  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  for (const order of orders) {
    if (isFullyDelivered(order)) continue;
    const ageDays = getOrderAgeDays(order.date_order);

    const reached = thresholds.filter(t => ageDays >= t.days);
    const highest = reached[reached.length - 1];
    if (!highest || state.sentAlerts[`${order.id}_${highest.key}`]) continue;
    alerts.push({
      url: channels.criticas, mention: getClientMention(order.partner_name),
      embed: orderAgeEmbed(order, ageDays, highest.color, highest.title),
      onSent: () => {
        for (const threshold of reached) state.sentAlerts[`${order.id}_${threshold.key}`] = Date.now();
        updateClientMonthlyStats(order.partner_name, order.id, currentMonth, state);
      },
    });
  }

  await sendGroupedAlerts(alerts, runtime, () => runtime.saveState(state, ['sentAlerts', 'clientMonthlyStats']));
}

// ─── Event alerts ─────────────────────────────────────────────────────────────

export async function checkEvents(
  orders: NotifOrder[], channels: WebhookChannels, runtime: NotificationRuntime = defaultRuntime,
): Promise<void> {
  const state = await runtime.loadState();
  const alerts: PendingAlert[] = [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const isFirstRun = !state.eventsInitialized && state.knownOrderIds.length === 0;
  state.eventsInitialized = true;
  const pendingNewIds = new Set<number>();
  const clientAlertSignatures = state.clientAlertSignatures ??= {};
  state.partialDeliveryAlerts ??= {};
  state.lastDeliveryStates ??= {};
  state.stalledAlerts ??= {};
  state.recoveryNotifications ??= [];

  const fields = [
    'knownOrderIds', 'eventsInitialized', 'deliveredOrderIds', 'deliveryTimestamps', 'clientAlertDates',
    'clientAlertSignatures', 'partialDeliveryAlerts', 'lastDeliveryStates',
    'stalledAlerts', 'recoveryNotifications',
  ] as const;
  const checkpoint = () => runtime.saveState(state, fields);
  const queue = (url: string, embed: DiscordEmbed, onSent: () => void, mention = '') =>
    alerts.push({ url, mention, embed, onSent });

  for (const order of orders) {
    const key = String(order.id);
    const age = getOrderAgeDays(order.date_order);
    const clientLine = `**Cliente:** ${escapeDiscord(order.partner_name)}`;
    if (!isFirstRun && !state.knownOrderIds.includes(order.id)
      && order.lines_count >= LARGE_ORDER_LINES && age <= 2 && !isFullyDelivered(order)) {
      pendingNewIds.add(order.id);
      queue(channels.eventos, reportEmbed(`📦 Nueva orden grande — ${order.name}`,
        orderEventDescription(order, [clientLine, `**Líneas de producto:** ${order.lines_count}`,
          '**Acción:** revisar requisitos y asignar el trabajo.']), 0x2563EB),
        () => { state.knownOrderIds.push(order.id); });
    }

    if (isFullyDelivered(order)) {
      if (!state.deliveredOrderIds.includes(order.id)) {
        const hadCriticalAlert = ['14d', '21d', '30d'].some(level => state.sentAlerts[`${order.id}_${level}`]);
        const recovered = hadCriticalAlert && !state.recoveryNotifications.includes(key);
        queue(channels.eventos, reportEmbed(
          `✅ ${recovered ? 'Orden recuperada' : 'Orden entregada'} — ${order.name}`,
          orderEventDescription(order, [clientLine, `**Antigüedad al detectar entrega:** ${age} días hábiles`,
            '**Acción:** confirmar cierre de remisiones y facturación.']), 0x16A34A), () => {
            if (recovered) state.recoveryNotifications.push(key);
            state.deliveredOrderIds.push(order.id);
            state.deliveryTimestamps[key] = { detectedAt: Date.now(), ageAtDelivery: age };
            delete state.partialDeliveryAlerts[key];
            delete state.lastDeliveryStates[key];
            delete state.stalledAlerts[key];
          });
      }
      continue;
    }

    const active = order.deliveries.filter(delivery => delivery.state !== 'cancel');
    const done = active.filter(delivery => delivery.state === 'done');
    if (done.length > 0 && !state.partialDeliveryAlerts[key]) {
      queue(channels.eventos, reportEmbed(`📦 Entrega parcial — ${order.name}`,
        orderEventDescription(order, [clientLine, `**Remisiones:** ${done.length} de ${active.length} completadas`,
          '**Acción:** confirmar qué piezas faltan y la próxima entrega.']), 0x10B981),
        () => { state.partialDeliveryAlerts[key] = Date.now(); });
    }
    if (!active.length) continue;
    const sig = buildDeliverySig(order);
    const prev = state.lastDeliveryStates[key];
    if (!prev || prev.sig !== sig) {
      state.lastDeliveryStates[key] = { sig, changedAt: Date.now() };
      delete state.stalledAlerts[key];
    } else if (!state.stalledAlerts[key] && businessDaysSince(prev.changedAt) >= STALL_DAYS) {
      queue(channels.criticas, reportEmbed(`⏸️ Orden sin movimiento — ${order.name}`,
        orderEventDescription(order, [clientLine, `**Sin cambios en remisiones:** ${STALL_DAYS} días hábiles o más`,
          '**Acción:** confirmar avance real y actualizar las remisiones en Odoo.']), 0xF59E0B),
        () => { state.stalledAlerts[key] = Date.now(); });
    }
  }
  // Una orden nueva cuyo aviso falló queda fuera de la línea base para reintentar.
  state.knownOrderIds = orders.filter(order => !pendingNewIds.has(order.id)).map(order => order.id);

  const overdueByClient = new Map<string, NotifOrder[]>();
  for (const order of orders) {
    if (!isFullyDelivered(order) && getOrderAgeDays(order.date_order) >= 14) {
      const group = overdueByClient.get(order.partner_name) ?? [];
      group.push(order);
      overdueByClient.set(order.partner_name, group);
    }
  }
  for (const client of Object.keys(clientAlertSignatures)) {
    if ((overdueByClient.get(client)?.length ?? 0) < 3) {
      delete clientAlertSignatures[client];
      delete state.clientAlertDates[client];
    }
  }
  for (const [client, clientOrders] of overdueByClient) {
    if (clientOrders.length < 3) continue;
    const sig = clientOrders.map(order => `${order.id}:${getOrderAgeDays(order.date_order) >= 30 ? 30 : getOrderAgeDays(order.date_order) >= 21 ? 21 : 14}`).sort().join(',');
    if (clientAlertSignatures[client] === sig || state.clientAlertDates[client] === todayStr) continue;
    const sorted = [...clientOrders].sort((a, b) => getOrderAgeDays(b.date_order) - getOrderAgeDays(a.date_order));
    const bullets = sorted.slice(0, 10).map(order => `• ${escapeDiscord(order.name)} (${getOrderAgeDays(order.date_order)} días hábiles)`);
    if (sorted.length > 10) bullets.push(`… y ${sorted.length - 10} más; consultar el tablero.`);
    queue(channels.criticas, reportEmbed('👥 Cliente con varias entregas pendientes', [
      `**${escapeDiscord(client)}** — ${clientOrders.length} SO con 14 días hábiles de antigüedad o más:`,
      ...bullets, '**Acción:** acordar prioridades y fechas de entrega.',
      `🔗 [Ver en tablero](${getDashboardUrl()})`,
    ], 0xEA580C), () => {
      state.clientAlertDates[client] = todayStr;
      clientAlertSignatures[client] = sig;
    }, getClientMention(client));
  }

  await sendGroupedAlerts(alerts, runtime, checkpoint);
  await checkpoint();
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
    await saveState(state, ['weeklyBaselineOverdue']);
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
