import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotifOrder {
  id: number;
  name: string;
  partner_name: string;
  date_order: string; // "YYYY-MM-DD HH:MM:SS" UTC from Odoo
  lines_count: number;
  deliveries: { state: string }[];
}

interface NotificationState {
  sentAlerts: Record<string, number>;       // "orderId_7d" → unix timestamp ms
  knownOrderIds: number[];
  deliveredOrderIds: number[];
  clientAlertDates: Record<string, string>; // "ClientName" → "YYYY-MM-DD"
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
}

// ─── State ────────────────────────────────────────────────────────────────────

const STATE_FILE = resolve(process.cwd(), 'notification_state.json');

const EMPTY_STATE: NotificationState = {
  sentAlerts: {},
  knownOrderIds: [],
  deliveredOrderIds: [],
  clientAlertDates: {},
};

export function loadState(): NotificationState {
  try {
    const raw = readFileSync(STATE_FILE, 'utf-8');
    return { ...EMPTY_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY_STATE };
  }
}

export function saveState(state: NotificationState): void {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (e) {
    console.error('[notifications] Error guardando estado:', e);
  }
}

// ─── Discord webhook ──────────────────────────────────────────────────────────

export async function sendWebhook(url: string, content: string, embeds: DiscordEmbed[]): Promise<void> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, embeds }),
    });
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

export function orderAgeEmbed(order: NotifOrder, ageDays: number, color: number, title: string): DiscordEmbed {
  const delivered = order.deliveries.filter(d => d.state === 'done').length;
  const pending   = order.deliveries.filter(d => d.state !== 'done' && d.state !== 'cancel').length;
  return {
    title,
    description: [
      `**${order.name}** · ${order.partner_name}`,
      `⏱ **${ageDays} días** sin entregar`,
      `📦 Entregas: ${pending} pendientes / ${delivered} completadas`,
    ].join('\n'),
    color,
    timestamp: nowISO(),
    footer: { text: 'Visual Factory TV · Odoo' },
  };
}

export function reportEmbed(title: string, lines: string[], color: number): DiscordEmbed {
  return {
    title,
    description: lines.join('\n'),
    color,
    timestamp: nowISO(),
    footer: { text: 'Visual Factory TV · Odoo' },
  };
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

// dow: array of day-of-week (0=Sun … 6=Sat), or null for every day
export function scheduleAt(hour: number, minute: number, dow: number[] | null, fn: () => void): void {
  function msToNext(): number {
    const now = new Date();
    const candidate = new Date(now);
    candidate.setHours(hour, minute, 0, 0);
    if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
    if (dow) {
      while (!dow.includes(candidate.getDay())) {
        candidate.setDate(candidate.getDate() + 1);
      }
    }
    return candidate.getTime() - now.getTime();
  }

  function tick() {
    try { fn(); } catch (e) { console.error('[notifications] Error en tarea programada:', e); }
    setTimeout(tick, msToNext());
  }

  setTimeout(tick, msToNext());
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getOrderAgeDays(dateOrder: string): number {
  const d = new Date(dateOrder.replace(' ', 'T') + 'Z');
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

export function isFullyDelivered(order: NotifOrder): boolean {
  const active = order.deliveries.filter(d => d.state !== 'cancel');
  return active.length > 0 && active.every(d => d.state === 'done');
}

// ─── Threshold alerts ─────────────────────────────────────────────────────────

export async function checkThresholds(
  orders: NotifOrder[],
  mainUrl: string,
  critUrl?: string,
): Promise<void> {
  const state = loadState();
  let dirty = false;

  const thresholds = [
    { days: 7,  key: '7d',  color: 0xF59E0B, title: '🟡 Orden pendiente — 1 semana',  mention: '',          useCrit: false },
    { days: 14, key: '14d', color: 0xDC2626, title: '🔴 Orden atrasada — 2 semanas',  mention: '@everyone', useCrit: false },
    { days: 30, key: '30d', color: 0x7F1D1D, title: '💀 Orden crítica — 1 mes',       mention: '@everyone', useCrit: true  },
  ] as const;

  for (const order of orders) {
    if (isFullyDelivered(order)) continue;
    const ageDays = getOrderAgeDays(order.date_order);

    for (const t of thresholds) {
      if (ageDays < t.days) continue;
      const alertKey = `${order.id}_${t.key}`;
      if (state.sentAlerts[alertKey]) continue;

      const webhookUrl = t.useCrit && critUrl ? critUrl : mainUrl;
      await sendWebhook(webhookUrl, t.mention, [orderAgeEmbed(order, ageDays, t.color, t.title)]);
      state.sentAlerts[alertKey] = Date.now();
      dirty = true;
    }
  }

  if (dirty) saveState(state);
}

// ─── Event alerts ─────────────────────────────────────────────────────────────

export async function checkEvents(orders: NotifOrder[], mainUrl: string): Promise<void> {
  const state = loadState();
  let dirty = false;
  const todayStr = new Date().toISOString().slice(0, 10);

  // --- New large orders (≥5 lines) ---
  for (const order of orders) {
    if (!state.knownOrderIds.includes(order.id) && order.lines_count >= 5) {
      await sendWebhook(mainUrl, '', [reportEmbed(
        `📦 Nueva orden grande — ${order.name}`,
        [
          `**Cliente:** ${order.partner_name}`,
          `**Líneas de producto:** ${order.lines_count}`,
          `**Fecha:** ${order.date_order.slice(0, 10)}`,
        ],
        0x2563EB,
      )]);
    }
  }
  state.knownOrderIds = orders.map(o => o.id);
  dirty = true;

  // --- Delivered orders (state changed to fully delivered) ---
  for (const order of orders) {
    if (isFullyDelivered(order) && !state.deliveredOrderIds.includes(order.id)) {
      await sendWebhook(mainUrl, '', [reportEmbed(
        `✅ Orden entregada — ${order.name}`,
        [
          `**Cliente:** ${order.partner_name}`,
          `**Duración:** ${getOrderAgeDays(order.date_order)} días`,
        ],
        0x16A34A,
      )]);
      state.deliveredOrderIds.push(order.id);
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
    await sendWebhook(mainUrl, '@everyone', [reportEmbed(
      `👥 Cliente con múltiples órdenes atrasadas`,
      [`**${client}** — ${clientOrders.length} órdenes con más de 14 días:`, ...bullets],
      0xEA580C,
    )]);
    state.clientAlertDates[client] = todayStr;
    dirty = true;
  }

  if (dirty) saveState(state);
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
      .forEach(o => lines.push(`  • ${o.name} · ${o.partner_name} (${getOrderAgeDays(o.date_order)}d)`));
  } else {
    lines.push('✅ Sin órdenes críticas hoy.');
  }

  await sendWebhook(mainUrl, '@everyone', [reportEmbed('📊 Reporte matutino — Visual Factory', lines, 0x1E40AF)]);
}

export async function sendWeeklySummary(orders: NotifOrder[], mainUrl: string): Promise<void> {
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
    .map(([name, count]) => `  • ${name}: ${count} órdenes`);

  const oldest = [...active].sort((a, b) => getOrderAgeDays(b.date_order) - getOrderAgeDays(a.date_order))[0];

  const lines = [
    `📋 **${active.length}** activas · ✅ **${delivered.length}** entregadas`,
    '',
    '🏆 **Top clientes con órdenes atrasadas (+14d):**',
    ...(topClients.length > 0 ? topClients : ['  Ninguno esta semana']),
    '',
    oldest ? `⏳ **Orden más antigua:** ${oldest.name} · ${oldest.partner_name} (${getOrderAgeDays(oldest.date_order)}d)` : '✅ Sin órdenes activas.',
  ].filter(Boolean);

  await sendWebhook(mainUrl, '@everyone', [reportEmbed('📅 Resumen semanal — Visual Factory', lines, 0x7C3AED)]);
}

export async function sendMiddayReport(orders: NotifOrder[], mainUrl: string): Promise<void> {
  const overdue = orders.filter(o => !isFullyDelivered(o) && getOrderAgeDays(o.date_order) >= 14);
  if (overdue.length === 0) return; // no enviar si no hay críticas
  const lines = [
    `🔴 **${overdue.length}** órdenes con más de 14 días pendientes:`,
    ...overdue
      .sort((a, b) => getOrderAgeDays(b.date_order) - getOrderAgeDays(a.date_order))
      .slice(0, 8)
      .map(o => `  • ${o.name} · ${o.partner_name} (${getOrderAgeDays(o.date_order)}d)`),
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

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function startNotifications(
  fetcher: () => Promise<NotifOrder[]>,
): Promise<void> {
  const mainUrl = process.env.DISCORD_WEBHOOK_URL;
  const critUrl = process.env.DISCORD_WEBHOOK_URL_CRITICOS;
  const enabled = process.env.NOTIFICATIONS_ENABLED !== 'false';

  if (!mainUrl || !enabled) {
    console.log('[notifications] Desactivado (DISCORD_WEBHOOK_URL no configurado o NOTIFICATIONS_ENABLED=false)');
    return;
  }

  console.log('[notifications] Iniciando notificaciones de Discord...');

  async function getOrders(): Promise<NotifOrder[]> {
    try { return await fetcher(); } catch (e) {
      console.error('[notifications] Error al obtener órdenes:', e);
      return [];
    }
  }

  // Scan cada 30 minutos: umbrales + eventos
  async function scan() {
    const orders = await getOrders();
    await checkThresholds(orders, mainUrl, critUrl);
    await checkEvents(orders, mainUrl);
  }
  scan(); // ejecutar inmediatamente al arrancar
  setInterval(scan, 30 * 60 * 1000);

  // Lun–Sáb 8:00 AM — reporte matutino
  scheduleAt(8, 0, [1, 2, 3, 4, 5, 6], async () => {
    await sendMorningReport(await getOrders(), mainUrl);
  });

  // Lun–Sáb 1:00 PM — reporte mediodía (condicional: solo si hay críticas)
  scheduleAt(13, 0, [1, 2, 3, 4, 5, 6], async () => {
    await sendMiddayReport(await getOrders(), mainUrl);
  });

  // Lun–Sáb 5:00 PM — cierre de turno
  scheduleAt(17, 0, [1, 2, 3, 4, 5, 6], async () => {
    await sendEndOfShiftReport(await getOrders(), mainUrl);
  });

  // Lunes 9:00 AM — resumen semanal
  scheduleAt(9, 0, [1], async () => {
    await sendWeeklySummary(await getOrders(), mainUrl);
  });
}
