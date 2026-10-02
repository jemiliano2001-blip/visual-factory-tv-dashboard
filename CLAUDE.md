# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Visual Factory TV** — a manufacturing shop-floor dashboard, originally scaffolded as a Google AI Studio applet. It displays Odoo sale orders on a live TV view and gives admins a read-only console and stats over the same data. The UI is **entirely in Spanish**. The app has **no AI features**: Gemini was removed on 2026-10-02 — do not reintroduce it without an explicit request.

## Getting Started

### Prerequisites
- Node.js 18+
- Odoo instance credentials (required for TV dashboard)
- Firebase project (required for admin panel & stats)

### Environment Setup

Copy `.env.example` to `.env.local` and fill in:

| Variable | Source | Purpose |
|----------|--------|---------|
| `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD` | Your Odoo instance | TV dashboard data |
| `FIREBASE_API_KEY` | `firebase-applet-config.json` or Firebase Console | Server verifies Firebase ID tokens on `/api/*` |
| `DEV_AUTH_BYPASS` | Set to `true` only for local dev (optional) | Opt-in localhost bypass on `server.ts`; default is fail-closed |
| `APP_URL` | Set by AI Studio at runtime (or your domain) | Self-referential links |
| `VITE_ODOO_PROXY_URL` | URL of a remote proxy host (no trailing slash) | Points the frontend at an Odoo proxy on a different host; empty = same origin |

### Firebase Setup

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Initialize Firestore (enable anonymous auth in Auth settings)
3. Security rules: no se despliegan desde este repo (ver "Firestore rules" abajo); las despliega SMV Vision
4. Firebase config is initialized in `src/firebase.ts` — no additional setup needed in code

### First Run

```bash
npm install
npm run lint              # Verify TypeScript compiles
npm run dev:full          # Start both Vite + Odoo proxy
```

Open http://localhost:3000 — you should see the TV dashboard.

## Commands

```bash
npm run dev        # Vite dev server on :3000 (host 0.0.0.0)
npm run server     # Odoo Express proxy on :3001 (tsx watch server.ts)
npm run dev:full   # Both of the above concurrently (VITE + ODOO) — use this for full local dev
npm run build      # vite build → dist/
npm run preview    # Serve the production build (:4173)
npm run clean      # Remove dist/ build artifacts
npm run deploy     # lint + test + build, then `firebase deploy --only hosting:dashboardsmv,functions:visual-factory` (always both; project smv-brain is shared with other apps)
npm run lint       # tsc --noEmit (strict mode) — there is no ESLint
npm test           # Run all unit tests (tsx --test "src/**/*.test.ts" "shared/**/*.test.ts")
npm run test:tv-page-packing   # tsx --test src/utils/tvPagePacking.test.ts
npm run test:ops-remediation   # tsx --test cardPresentation/companyConfigGuards/rotationPolicy tests
```

There is **no ESLint**, but there are real `node:test`-based unit tests (via `tsx --test`) covering the entire app — run `npm test` or the relevant `test:*` script when touching code, not just `npm run lint`.

## Data sources

**Odoo ERP is the single source of truth for orders.** The TV Dashboard (`/`), Admin console (`/admin`) and Stats (`/stats`) all show Odoo `sale.order` records with `invoice_status = 'to invoice'`, fetched through the shared `useOdooOrders()` hook (`src/hooks/useOdooOrders.ts`) → React Query polling → Express proxy (`server.ts`). All three pages share one query key (`odooData`), so they share a single request/cache.

`OdooSaleOrder` includes a `deliveries: OdooDelivery[]` field — the linked `stock.picking` records (outgoing transfers). Each `OdooDelivery` has `name` (e.g. `WH/OUT/00042`), `state` (`draft | confirmed | waiting | assigned | done | cancel`), and `date_done`. `OdooOrderCard` shows a badge row ("Rem.") under the progress bar summarising delivery counts by state, excluding cancelled ones (hidden on mobile, where the card is a single row).

**Firestore** only holds `company_configs` (per-client delivery schedules, shown on the TV cards and managed from the Admin → Configuración tab) and backs Firebase **auth**. The Configuración tab rejects duplicate client names via `hasDuplicateCompanyConfig()` (`src/services/companyConfigGuards.ts`), which compares names through `normalizeCompanyName()` (trim, collapse whitespace, lowercase with `es-MX` locale) — so "Bosch " and "bosch" collide even though they're not byte-identical. The legacy `work_orders` / `work_orders_history` collections were retired in 2026-06 (data preserved but rules closed — see `docs/superpowers/specs/2026-06-12-admin-odoo-console-design.md`). The Admin console is **read-only** over Odoo: there is no order CRUD anywhere in the app.

### The Odoo proxy (`server.ts`)

A standalone Express server (not part of Vite) that exists to hide Odoo credentials and avoid CORS. It authenticates to Odoo via JSON-RPC (`/web/session/authenticate`), keeps the `session_id` cookie, and re-issues `call_kw` RPCs. Endpoints: `GET /api/odoo/status`, `GET /api/odoo/invoiceable-orders`. **All `/api/*` routes require a valid Firebase ID token** (`Authorization: Bearer <idToken>`). The TV dashboard obtains that token via anonymous Firebase auth (`App.tsx` → `signInAnonymously`); admin/stats use email/password. Local bypass is **opt-in only**: set `DEV_AUTH_BYPASS=true` in `.env.local` to skip token checks for connections from `127.0.0.1` / `::1` — never rely on `NODE_ENV` alone (Cloudflare Tunnel arrives as localhost). The same auth posture exists in `functions/src/index.ts` for Firebase Hosting deploys — both entry points import the same `OdooClient` from `shared/odooClient.ts` rather than duplicating it. Configured from `.env.local` / `.env` (`ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD`, `ODOO_PROXY_PORT`, `FIREBASE_API_KEY`).

`GET /api/odoo/invoiceable-orders` goes through `OdooClient.fetchInvoiceableOrdersCached()` (60 s TTL, shared by simultaneous callers, failures not cached), so several TVs/tabs cost one Odoo query. Odoo is asked for at most `MAX_INVOICEABLE_ORDERS` (1000) orders; if there are more, the response carries `truncated: true` and the UI shows an "Incompleto" badge (TV header) / amber notice (Admin) instead of silently dropping orders. The frontend `fetchInvoiceableOrders` **throws** on failure, so React Query keeps the last good orders on a failed refresh (header badge turns "Sin Odoo · datos de HH:mm"); connection status is derived from that same query (no separate `/api/odoo/status` poll — the endpoint remains as a health check).

## Discord notifications (`functions/src/notifications.ts`)

A scheduled Firebase Function (`onSchedule`, wired in `functions/src/index.ts`) periodically checks Odoo order age thresholds and delivery events (`checkThresholds`, `checkEvents`) and posts Spanish-language embeds to Discord webhooks (`sendWebhook`, rate-limited to 1.5s between sends). Which webhook a notification goes to is resolved per client/channel via `buildWebhookChannels`. Already-notified state persists via `loadState`/`saveState` so restarts don't re-fire alerts. This is independent of the TV/Admin/Stats app — it exists purely to alert the team in Discord. See `docs/superpowers/specs/2026-06-20-discord-notifications-design.md` for the original design.

Desde 2026-10-01, cada SO genera solo el umbral de antigüedad más alto alcanzado; los inferiores quedan cubiertos después de confirmar el envío. Los avisos se agrupan por webhook/mención, hasta 10 embeds y 6000 caracteres por mensaje, con una mención por grupo. Sin rol de cliente se usa `DISCORD_ROLE_GENERAL`; si tampoco existe, no hay mención automática a `@everyone`. Los grupos de clientes solo vuelven a avisar si cambia su composición o nivel (máximo una vez al día). Los días hábiles de antigüedad no se presentan como días de atraso; el compromiso vencido se informa aparte.

Los callbacks de deduplicación corren únicamente si Discord confirma el lote (`wait=true`); un lote fallido queda pendiente. La lectura de estado falla cerrada; las escrituras usan `mergeFields` sobre los mapas propios de cada tarea para persistir claves borradas sin sobrescribir reportes vecinos. `eventsInitialized` distingue el primer arranque de una línea base vacía. El scan usa una instancia con concurrencia 1. Sigue existiendo una ventana entre envío y persistencia si el proceso se interrumpe: no es entrega exactamente una vez. `npm test` incluye también las regresiones de `functions/src/*.test.ts` y las Functions tienen su compilación propia.

## Búsqueda de SO, PO, OT e ingenieros

TV y Admin comparten `src/services/orderSearch.ts`: búsqueda por todos los términos, sin distinguir acentos/mayúsculas, sobre SO, cliente, referencia de compra, vendedor, todas las líneas de descripción y notas sin HTML. OT e ingeniero se consultan en las descripciones/notas, según la operación del taller; no se inventa una relación con `mrp.workorder` ni se equipara vendedor con ingeniero. `SO1794`/`S01794` y `OT-00427`/`OT 427` se normalizan conservando cada prefijo junto a su número; también se conserva la búsqueda numérica con ceros. El filtro IA recibe las descripciones y hasta 4000 caracteres de nota, sin ampliar el contexto de las demás tareas IA.

PO significa la referencia de compra del cliente (`client_order_ref` → `customer_reference`), distinta del número de SO. Una referencia numérica como `20264321` admite `PO20264321`, `PO 20264321` y `PO-20264321`; un PO prefijado no se satisface solo con una SO de igual número. La referencia aparece como dato secundario en tarjetas TV, Pendientes, Órdenes y Entregas, además del reporte donde ya existía; las alertas Discord también la incluyen cuando Odoo la proporciona. El catálogo de la app sigue limitado a SO por facturar: la ausencia de una referencia no permite inventar una orden vinculada.

**Its env vars live in `functions/.env`, not the root `.env.local`.** `DISCORD_WEBHOOK_URL` (required), `DISCORD_WEBHOOK_URL_CRITICOS`/`DISCORD_WEBHOOK_URL_REPORTES` (optional, fall back to the main webhook), `DISCORD_ROLE_GENERAL`, `DISCORD_LARGE_ORDER_LINES`, `DASHBOARD_URL`, `STALL_THRESHOLD_DAYS`, and `NOTIFICATIONS_ENABLED` are only read by `functions/src/*.ts` — copy `functions/.env.example` to `functions/.env` to configure them for a Functions deploy. `server.ts` never touches these.

## Admin: Agenda y estado en el link

`/admin` guarda pestaña y filtros en la URL (`?tab=agenda&q=…&cliente=…&estado=…`) vía `src/services/adminFilters.ts` (los valores se validan; un link manipulado cae a los defaults). Al entrar sin parámetros se restaura el último filtro usado (localStorage `adminFilters`, sin la pestaña), y el botón "Copiar link" comparte la vista exacta. La pestaña **Agenda** (`AgendaTab` + `buildAgenda` en `src/services/agenda.ts`) agrupa las órdenes con piezas pendientes por fecha compromiso: Atrasadas (cerrada por defecto), Hoy, Mañana, cada día de los próximos 15 y Más adelante / Sin fecha. Usa solo `commitment_date`, no el plazo de la nota.

## Auth & routing

- `App.tsx` signs every visitor in **anonymously** on load so the public TV Dashboard works without a visible login while still obtaining a Firebase ID token for `/api/*` and satisfying Firestore rules (`request.auth != null`). If anonymous auth is disabled in Firebase Console, the app shows a clear error screen.
- Sign in is **email/password** (`Login.tsx`). Both `/admin` and `/stats` are guarded by the same `ProtectedRoute` (`src/components/ProtectedRoute.tsx`), which only requires `isRealUser()` — any signed-in, non-anonymous account, no email verification and no special claim. `/admin` is a shared work tool for the design/production team (Pendientes/Entregas/Excel export), not a restricted supervisor console, so there is deliberately no extra gate beyond "not the public anonymous TV session." The TV header title (`DashboardHeader`) is a button that navigates to `/admin` — that's the only way in from `/`, since `Layout.tsx` renders the bare full-screen shell there and its `/admin` sidebar link is not shown.
- The Firebase custom claim `admin: true` still exists and still matters — see Firestore rules below — but it no longer gates *page access* to `/admin`. Grant it with `functions/scripts/set-admin-claim.mjs` (run from `functions/`, needs `GOOGLE_APPLICATION_CREDENTIALS` or `gcloud auth application-default login`) only when someone needs to write `company_configs` from the Configuración tab; it preserves other claims and revokes refresh tokens so the new claim propagates. **A freshly-granted claim is absent from a cached ID token** — the user must sign out/in (or the code calling `getIdTokenResult` must pass `true` to force-refresh) before the claim takes effect.
- `Layout.tsx` renders a bare full-screen shell for `/` (the TV view) and the sidebar chrome for everything else.

## Firestore rules (`firestore.rules`)

Only `company_configs` is writable, and only by an **admin** (`isAdmin()` = verified user + `admin` custom claim, enforced server-side in `firestore.rules` — this is now independent of `/admin` page access, see Auth & routing above); create/update are also validated (exact field set, string lengths, timestamp). A non-admin designer can open the Configuración tab but a create/update/delete will be rejected by these rules; grant the claim via `functions/scripts/set-admin-claim.mjs` if they need to edit delivery schedules. `work_orders` and `work_orders_history` are **closed** (`allow read, write: if false`) — legacy data is preserved in Firestore but unreachable. If you add a field to `CompanyConfig`, update both `src/types.ts` **and** `isValidCompanyConfig()` here, or writes will be rejected. Las reglas de `(default)` **ya no se despliegan desde este repo**: la base la comparten este Dashboard y SMV Vision, y un deploy de reglas reemplaza las anteriores. Las vigentes viven en `apps/smv-vision/firestore.rules` (incluyen una copia fiel del bloque `company_configs` de abajo) y se despliegan desde ahí. `firestore.rules` de este repo queda como referencia; si cambias `company_configs`, cámbialo en Vision y en esta copia. `shared/firestoreRulesOwnership.test.ts` falla si `firebase.json` vuelve a declarar `firestore`.

## TV Dashboard — view modes & layout

`TVDashboard` has two rendering modes toggled by the `viewMode` state (`'tv' | 'desktop'`):

- **TV mode** (default): paginated view — orders are grouped by `partner_name`, each group split into pages of `ordersPerPage` cards. Pages auto-rotate every 10 seconds (`setInterval`), gated by `shouldAutoRotate()` (`src/services/rotationPolicy.ts`): it only rotates when in TV mode, there's more than one page, and the operator hasn't paused it. That pause is a deliberate **operational** action, not a persisted preference — it resets on reload by design. The page index resets to 0 when a client/text filter is applied.
- **Desktop mode**: all groups shown at once in a single scrollable column; no pagination, no auto-rotate.

**Page packing** (`src/utils/tvPagePacking.ts`) decides how companies fill pages, not just plain per-company chunking. A company with **≥20 orders** (`EXCLUSIVE_COMPANY_ORDER_THRESHOLD`) always gets exclusive pages — even its trailing partial page — so a big client's last few orders never get visually mixed with another client's. Smaller companies are packed together onto **shared pages** (`type: 'shared'`, rendered by `SharedTVPage.tsx`), laid out as `split` (up to a few clients) or `quad` (up to `MAX_CLIENTS_PER_SHARED_PAGE` clients, up to `MAX_ORDERS_PER_QUAD_SEGMENT` orders each) depending on how many clients/orders need to fit. Card tone/color (pending vs. in-progress vs. delivered, overdue/critical accents) is centralized in `getCardPresentation()` (`src/services/cardPresentation.ts`) and shared by both the plain per-company cards and `SharedTVPage`.

`OdooOrderCard` lists the order's product lines (name + `delivered/qty`, completed ones struck through), capped by how much room the card has: all of them in desktop mode, 6 on a large TV card, 4 on a normal TV card, 3 when `isDense`, 1 on mobile, with a `+N más` tail. The list sits in a `flex-1 min-h-0 overflow-hidden` block, so on the tightest shared pages it collapses to nothing rather than pushing the percentage and progress bar out of the card — **don't give it a `min-h-*` floor**, that clips the progress bar instead.

A `ResizeObserver` on the grid container recomputes `gridCols` / `gridRows` / `ordersPerPage` on every resize. It also derives two layout flags passed to `OdooOrderCard`:
- `isWide`: few columns + few rows + wide aspect ratio → cards render larger text and padding
- `isDense`: many cards in limited vertical space → cards use a compact horizontal layout

`SmartText` (`src/components/SmartText.tsx`) renders order text with adaptive abbreviation and font-size based on the `isWide`/`isDense` flags — it consumes those same flags and must receive them for text to size correctly in each layout mode.

Status filter types accepted by `setStatusFilter` (the `StatusFilter` type exported from `TVControlBar.tsx`): `'all' | 'overdue' | 'pending' | 'delivered' | 'critical'`, chosen from the status select in the control bar (a drawer section on mobile; the header "vencidas" button also sets `'overdue'`). There is also a separate `clientFilter` string state, combinable with it; clearing the controls resets both.

**Fully-delivered orders are hidden from the TV view.** `filteredOdooOrders` excludes any order where `isOrderFullyDelivered(order)` (`src/services/odoo.ts`) is true — i.e. it has deliveries and **all** non-cancelled `stock.picking` records are in `done` state. The `'delivered'` status filter is the deliberate override: it shows *only* those hidden, fully-delivered orders (also state-based, not the old `progress >= 100` quantity check). This hiding is **TV-only** — Admin/Stats filter independently and still show everything.

## Conventions & gotchas

- **PO number format**: canonical form is `YYYY/SXXXXX` (current year + 5 zero-padded digits). Always run user-supplied PO strings through `formatPONumber` (`src/utils/formatters.ts`) before display or matching.
- **Customer logos**: TV dashboard maps Odoo `partner_name` → logo via keyword/regex matching in `src/utils/customerLogos.ts`; logo files live in `public/logos/`. Add new clients there.
- **xlsx-js-style** needs Node built-ins in the browser — `vite-plugin-node-polyfills` in `vite.config.ts` provides them. Don't remove it. It's configured with `globals: { process: false }` so the process shim doesn't shadow injected variables.
- **PWA**: `vite-plugin-pwa` with `registerType: 'autoUpdate'`, registered in `main.tsx` via `registerSW({ immediate: true })`. Enabled in dev too. The `dev-dist/` directory holds the compiled service-worker output (`sw.js`, `workbox-*.js`) — these are **auto-generated on every dev start, never edit them**.
- **HMR** is controlled by `DISABLE_HMR` env var (set by AI Studio to prevent flicker during agent edits) — leave the `server.hmr` logic in `vite.config.ts` alone.
- The `@` import alias resolves to the **repo root** (`vite.config.ts` + `tsconfig.json`), but `src/` code currently uses relative imports throughout — match the surrounding style.
- Odoo datetimes arrive as non-ISO strings (`"YYYY-MM-DD HH:MM:SS"` in UTC); always parse them through `parseOdooDate` (`src/services/odoo.ts`), which normalizes to a JS `Date` (or `null`). Don't `new Date()` raw Odoo strings — Safari rejects them and Chrome misreads the timezone.
- **`order.note` is HTML**: Odoo sends `order.note` as raw HTML. Always sanitize with `DOMPurify.sanitize()` before `dangerouslySetInnerHTML`. Never render it raw.
- **Mobile layout**: `useMobile()` (breakpoint: `< 768px`) drives two separate rendering paths. `OrderDetailsModal` renders as a shadcn `Drawer` (bottom sheet) on mobile, `Dialog` on desktop. The client filter in `TVDashboard` is also a `Drawer` on mobile. When adding new interactive UI, check `useMobile()` and handle both paths.
- **shadcn/ui primitives**: New UI components go in `src/components/ui/` following the existing shadcn pattern. Don't install a new component library for something shadcn already covers.

## Project Structure

```
.
├── src/
│   ├── main.tsx           # Entry point, PWA registration
│   ├── App.tsx            # Root router & auth initialization
│   ├── firebase.ts        # Firebase & Firestore initialization
│   ├── types.ts           # Shared TypeScript types (CompanyConfig, Odoo re-exports)
│   ├── pages/             # Route components (Admin, Stats, TV Dashboard)
│   ├── hooks/
│   │   ├── useOdooOrders.ts  # Shared React Query hook (TV, Admin, Stats)
│   │   ├── useMobile.ts   # Breakpoint hook (< 768 px) — drives mobile vs. desktop layout
│   │   ├── usePersistedState.ts  # localStorage-backed useState
│   │   └── useProximityVisible.ts
│   ├── components/
│   │   ├── admin/         # OrdersTable, ConfigTab, AIModal, OrderReportTab, riskTypes
│   │   ├── ui/            # shadcn/ui primitives (dialog, drawer, badge, button, …)
│   │   ├── TVControlBar.tsx  # Client/status/text filters + pause (floating bar)
│   │   ├── OdooStatusBadge.tsx
│   │   ├── ErrorBoundary.tsx
│   │   └── ...            # Other reusable UI components
│   ├── services/
│   │   ├── companyConfigs.ts  # Firestore CRUD for delivery schedules
│   │   ├── odoo.ts        # Odoo API client (via proxy)
│   │   └── ...
│   └── utils/             # Helpers (formatPONumber, customerLogos, etc.)
├── shared/                # Logic shared between server.ts and functions/src/index.ts
│   ├── odooClient.ts      # OdooClient — Odoo JSON-RPC session + call_kw
├── server.ts             # Express proxy for Odoo (auth + CORS wrapper)
├── functions/src/
│   ├── index.ts           # Firebase Hosting deploy of the same /api/* routes
│   └── notifications.ts   # Scheduled Discord webhook alerts (order age/events)
├── firestore.rules       # Security rules for Firestore collections
├── vite.config.ts        # Vite + PWA + polyfills config
├── .env.example          # Environment variable template
├── docs/superpowers/     # Implementation plans & design specs (useful architectural context)
│   ├── plans/            # Numbered implementation plans per sprint
│   └── specs/            # Design spec docs referenced in CLAUDE.md
├── dev-dist/             # Auto-generated by vite-plugin-pwa — DO NOT EDIT
├── .stitch/              # Stitch design-tool artifact — safe to ignore
└── dist/                 # Build output (git-ignored)
```

## gstack

gstack es un conjunto de skills para Claude Code. Instalar con:

```bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup
```

Regla: usar siempre `/browse` para navegación web — **nunca** usar herramientas `mcp__claude-in-chrome__*` directamente.

Skills disponibles:
`/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/setup-gbrain`, `/retro`, `/investigate`, `/document-release`, `/document-generate`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`

## Design System
Always read `DESIGN.md` before making any visual or UI decisions.
All font choices, colors, spacing, status/urgency rules, and aesthetic direction are defined there.
The implemented tokens live in `src/index.css` (`@theme`); `DESIGN.md` explains intent and the rules code must follow.
Do not deviate without explicit user approval. In QA/review, flag any code that doesn't match `DESIGN.md`.

