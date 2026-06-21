# Discord Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `src/services/notificationService.ts` to send Discord webhook notifications for overdue orders, daily reports, and production events.

**Architecture:** `server.ts` already imports `startNotifications` from `./src/services/notificationService.js` and calls it with `fetchInvoiceableOrders` after `app.listen()`. The file just doesn't exist yet — creating it is all that's needed. State persists in `notification_state.json` (gitignored) at the repo root. Scheduling via recursive `setTimeout`, no new npm packages.

**Tech Stack:** Node.js 18+ native `fetch`, TypeScript, `node:fs` + `node:path` for state file.

## Global Constraints

- No new npm packages
- All Discord messages in Spanish
- Do not import from browser-specific modules (e.g. `import.meta.env`, Vite plugins)
- `notification_state.json` must be gitignored
- If `DISCORD_WEBHOOK_URL` is unset or `NOTIFICATIONS_ENABLED=false`, `startNotifications` returns silently — no errors thrown
- `npm run lint` (`tsc --noEmit`) must pass after every task
- `fetchInvoiceableOrders()` (already in `server.ts`) returns objects with: `id: number`, `name: string`, `partner_name: string`, `date_order: string` (Odoo format `"YYYY-MM-DD HH:MM:SS"` UTC), `lines_count: number`, `deliveries: { name: string; state: string; date_done: string | null }[]`

---

### Task 1: Environment variables and gitignore

**Files:**
- Modify: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Add Discord webhook vars to `.env.example`**

Open `.env.example`. After the last existing line, append:

```
# Discord Notifications
DISCORD_WEBHOOK_URL=            # URL del webhook del canal principal de Discord
DISCORD_WEBHOOK_URL_CRITICOS=   # (Opcional) Canal separado para alertas críticas >30 días
NOTIFICATIONS_ENABLED=true      # Cambiar a false para silenciar todas las notificaciones
```

- [ ] **Step 2: Add state file to `.gitignore`**

Open `.gitignore`. Append:

```
# Discord notification state
notification_state.json
```

- [ ] **Step 3: Verify lint**

Run: `npm run lint`
Expected: no errors (the import in server.ts still fails here — that's fixed in Task 2)

- [ ] **Step 4: Commit**

```bash
git add .env.example .gitignore
git commit -m "chore: Discord notification env vars + gitignore state file"
```

---

### Task 2: Foundation — types, state, Discord sender, scheduler

**Files:**
- Create: `src/services/notificationService.ts`

**Interfaces produced (used by Tasks 3–6):**
- `NotifOrder` — matches the subset of `fetchInvoiceableOrders()` return the service needs
- `loadState() → NotificationState`
- `saveState(state: NotificationState) → void`
- `sendWebhook(url, content, embeds) → Promise<void>`
- `orderAgeEmbed(order, ageDays, color, title) → DiscordEmbed`
- `reportEmbed(title, lines, color) → DiscordEmbed`
- `scheduleAt(hour, minute, dow, fn) → void`
- `getOrderAgeDays(dateOrder) → number`
- `isFullyDelivered(order) → boolean`

- [ ] **Step 1: Create `src/services/notificationService.ts`**

```ts
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
```

- [ ] **Step 2: Verify lint**

Run: `npm run lint`
Expected: no errors (the import in server.ts is now resolved)

- [ ] **Step 3: Commit**

```bash
git add src/services/notificationService.ts
git commit -m "feat(notifications): foundation — types, state, Discord sender, scheduler"
```

---

### Task 3: Threshold alerts (7d / 14d / 30d)

**Files:**
- Modify: `src/services/notificationService.ts` — append `checkThresholds()`

**Interfaces:**
- Consumes: `NotifOrder`, `loadState()`, `saveState()`, `sendWebhook()`, `orderAgeEmbed()`, `getOrderAgeDays()`, `isFullyDelivered()`
- Produces: `checkThresholds(orders, mainUrl, critUrl?)` — exported

- [ ] **Step 1: Append `checkThresholds` to `notificationService.ts`**

```ts
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
```

- [ ] **Step 2: Verify lint**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/services/notificationService.ts
git commit -m "feat(notifications): threshold alerts (7d / 14d / 30d)"
```

---

### Task 4: Event alerts (new orders, delivered, client grouping)

**Files:**
- Modify: `src/services/notificationService.ts` — append `checkEvents()`

**Interfaces:**
- Consumes: `NotifOrder`, `loadState()`, `saveState()`, `sendWebhook()`, `reportEmbed()`, `getOrderAgeDays()`, `isFullyDelivered()`
- Produces: `checkEvents(orders, mainUrl)` — exported

- [ ] **Step 1: Append `checkEvents` to `notificationService.ts`**

```ts
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
```

- [ ] **Step 2: Verify lint**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/services/notificationService.ts
git commit -m "feat(notifications): event alerts (nueva orden, entregada, cliente agrupado)"
```

---

### Task 5: Scheduled report functions

**Files:**
- Modify: `src/services/notificationService.ts` — append four report functions

**Interfaces:**
- Consumes: `NotifOrder`, `sendWebhook()`, `reportEmbed()`, `getOrderAgeDays()`, `isFullyDelivered()`
- Produces: `sendMorningReport`, `sendWeeklySummary`, `sendMiddayReport`, `sendEndOfShiftReport` — all exported

- [ ] **Step 1: Append report functions to `notificationService.ts`**

```ts
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
```

- [ ] **Step 2: Verify lint**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/services/notificationService.ts
git commit -m "feat(notifications): reportes matutino, semanal, mediodía y cierre de turno"
```

---

### Task 6: `startNotifications()` entry point

**Files:**
- Modify: `src/services/notificationService.ts` — append `startNotifications()`

Note: `server.ts` already has `import { startNotifications } from './src/services/notificationService.js'` and calls `startNotifications(fetchInvoiceableOrders)` inside `app.listen()`. No changes to `server.ts` are needed.

**Interfaces:**
- Consumes: all functions from Tasks 2–5, plus `scheduleAt()`
- Produces: `startNotifications(fetcher: () => Promise<NotifOrder[]>): Promise<void>` — exported

- [ ] **Step 1: Append `startNotifications` to `notificationService.ts`**

```ts
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
```

- [ ] **Step 2: Verify lint**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/services/notificationService.ts
git commit -m "feat(notifications): startNotifications entry point — Discord notifications completo"
```

---

### Task 7: Manual verification

**Files:** No code changes — verification only.

- [ ] **Step 1: Obtener un webhook URL de Discord**

En tu servidor de Discord: Configuración del servidor → Integraciones → Webhooks → Nuevo webhook → Copiar URL.

Agregar a `.env.local`:
```
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/TU_ID/TU_TOKEN
NOTIFICATIONS_ENABLED=true
```

- [ ] **Step 2: Arrancar el servidor**

Run: `npm run server`

Expected console output (entre los logs normales del proxy):
```
[notifications] Iniciando notificaciones de Discord...
```

- [ ] **Step 3: Verificar que el scan inicial dispara**

El scan corre inmediatamente al arrancar. Si hay órdenes con más de 7 días en Odoo, deberían aparecer embeds en Discord en los primeros segundos. Revisar el canal de Discord.

- [ ] **Step 4: Smoke test de umbral forzado**

Para verificar el formato del embed sin esperar días reales, editar temporalmente en `checkThresholds`:

```ts
// Cambiar temporalmente:
{ days: 7, ... }
// a:
{ days: 0, ... }
```

Reiniciar el servidor, verificar que aparece el embed en Discord con texto en español y footer "Visual Factory TV · Odoo", luego restaurar `days: 7` y hacer commit si todo está bien.

- [ ] **Step 5: Verificar lint final**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 6: Commit si hay ajustes**

```bash
git add src/services/notificationService.ts
git commit -m "fix(notifications): ajustes de verificación manual"
```
