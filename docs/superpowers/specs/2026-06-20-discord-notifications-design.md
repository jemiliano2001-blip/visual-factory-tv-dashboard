# Discord Notifications — Design Spec

**Date:** 2026-06-20
**Project:** Visual Factory TV Dashboard
**Status:** Approved

---

## Context

The manufacturing team needs to know when orders have been pending too long, without checking the TV dashboard manually. The solution is outbound Discord webhook notifications from the existing Express proxy server (`server.ts`).

Discord was chosen over WhatsApp (no BSP/Meta approval needed) and FCM (no service worker changes needed). A Discord server was created by the user on 2026-06-20.

---

## Architecture

### Files

| File | Change |
|------|--------|
| `src/services/notificationService.ts` | New — all notification logic |
| `notification_state.json` | New — persists sent alert IDs and known order IDs (gitignored) |
| `server.ts` | Edit — call `startNotifications(ordersFetcher)` after server starts |
| `.env.example` | Edit — add `DISCORD_WEBHOOK_URL` and `DISCORD_WEBHOOK_URL_CRITICOS` |

### Data Flow

```
server.ts starts
  → startNotifications(fetchInvoiceableOrders)
      → schedulers register (setTimeout-based, no new dependency)
      → every 30 min: fetchInvoiceableOrders() → diff state → send threshold/event alerts
      → at 8:00 AM / 9:00 AM / 1:00 PM / 5:00 PM: scheduled reports
```

`startNotifications` receives `ordersFetcher: () => Promise<OdooSaleOrder[]>` as a parameter. It never imports directly from `src/` (Vite/React boundary). The fetcher is the existing Odoo call logic already in `server.ts`.

### Scheduler

Recursive `setTimeout` targeting wall-clock times. No new npm dependency.

```ts
function scheduleAt(hour: number, minute: number, dow: number | null, fn: () => void) {
  // dow: 0=Sun … 6=Sat, null = every day
  // Calculates ms to next firing, then calls fn() and reschedules
}
```

The 30-minute threshold scan uses `setInterval(scan, 30 * 60 * 1000)`.

### State Persistence

`notification_state.json` at the repo root (gitignored):

```json
{
  "sentAlerts": {
    "S00042_7d": 1718000000000,
    "S00042_14d": 1719000000000
  },
  "knownOrderIds": [1, 2, 3, 4],
  "deliveredOrderIds": [5, 6],
  "clientAlertDates": {
    "Bosch de México": "2026-06-20"
  }
}
```

`sentAlerts` stores `orderId_threshold → timestamp`. An alert fires once per order per threshold; it never re-fires unless the order resets. `knownOrderIds` and `deliveredOrderIds` track state for event-based alerts. `clientAlertDates` de-duplicates the "client with 3+ overdue" alert to once per client per calendar day.

State is loaded on startup and written after every mutation.

---

## Environment Variables

```
DISCORD_WEBHOOK_URL=          # main channel (required)
DISCORD_WEBHOOK_URL_CRITICOS= # optional separate channel for 1-month alerts
NOTIFICATIONS_ENABLED=true    # feature flag — set to false to silence everything
```

Both webhook URLs go in `.env.local` / `.env` and are never committed.

---

## Notification Types

### Scheduled Reports

| Type | Schedule | Mention | Channel |
|------|----------|---------|---------|
| Morning report | Mon–Sat 8:00 AM | @everyone | main |
| Weekly summary | Monday 9:00 AM | @everyone | main |
| Midday report | Mon–Sat 1:00 PM (only if overdue orders exist) | — | main |
| End-of-shift report | Mon–Sat 5:00 PM | — | main |

**Morning report content:**
- Total orders with `invoice_status = 'to invoice'`
- Count overdue by tier (>7d, >14d, >30d)
- List of orders >14 days with client name and age in days

**Weekly summary content:**
- Top 3 clients by total overdue orders
- Total currently delivered orders (from state)
- Oldest active order (by `date_order`)

### Threshold Alerts (fire once per order per threshold)

| Threshold | Color | Mention | Channel |
|-----------|-------|---------|---------|
| > 7 days | 🟡 Yellow (#F59E0B) | none | main |
| > 14 days | 🔴 Red (#DC2626) | @everyone | main |
| > 30 days | 💀 Dark red (#7F1D1D) | @everyone | criticos (or main) |

Threshold is calculated from `order.date_order` (the SO creation date) parsed via `parseOdooDate()`.

An alert fires the first time the scan detects the order age crossing the threshold. It does not re-fire on subsequent scans.

### Event Alerts (fire on state change detected between scans)

| Event | Trigger | Mention | Channel |
|-------|---------|---------|---------|
| Order delivered | Order ID moves to deliveredOrderIds | none | main |
| New large order | New order ID with ≥ 5 order lines | none | main |
| Client 3+ overdue | Client has ≥ 3 orders > 14d; once per client per day | @everyone | main |

"Large order" threshold (5 lines) is hardcoded. Add `DISCORD_LARGE_ORDER_LINES` env var only if the user requests it.

---

## Discord Embed Format

All messages use Discord's embed format via a single `fetch()` POST. No SDK.

```ts
interface DiscordEmbed {
  title: string;       // "🔴 Orden atrasada — Visual Factory"
  description: string; // order details
  color: number;       // hex as int: 0xDC2626
  timestamp: string;   // ISO 8601
  footer: { text: string }; // "Visual Factory TV · Odoo"
  fields?: Array<{ name: string; value: string; inline: boolean }>;
}
```

Threshold alert example:
```
🔴 Orden atrasada — 14 días
2026/S00042 · Bosch de México
⏱ 14 días sin entregar
📦 Entregas: 2 pendientes / 0 completadas
```

Morning report example:
```
📊 Reporte matutino — 8:00 AM
25 órdenes activas · 3 atrasadas (+14d)

🔴 Atrasadas críticas:
  2026/S00042 · Bosch (18d)
  2026/S00031 · Magna (15d)
```

Content-type header: `application/json`. No auth header needed for webhooks.

---

## Error Handling

- Failed Discord POST: log the error, do not retry, do not crash the server.
- Failed `fetchInvoiceableOrders()` during a scan: log, skip this scan cycle, try again on next interval.
- Missing `DISCORD_WEBHOOK_URL`: `startNotifications()` returns immediately with a console warning. Server continues normally.
- Corrupted `notification_state.json`: reset to empty state and log a warning.

---

## Constraints

- `notificationService.ts` must not import from `src/` (Vite/browser code). Date parsing logic is duplicated inline (one expression: `new Date(str.replace(' ', 'T') + 'Z')`).
- All Discord messages are in Spanish.
- No new npm packages.
- `notification_state.json` is added to `.gitignore`.
- Feature is inactive if `DISCORD_WEBHOOK_URL` is not set (no errors thrown).

---

## Out of Scope

- WhatsApp / FCM / email — future phases if Discord adoption is low.
- Bidirectional Discord bot (responding to commands) — separate feature.
- Per-user notification preferences — single webhook, @everyone only.
- Retry logic for failed webhook POSTs.
