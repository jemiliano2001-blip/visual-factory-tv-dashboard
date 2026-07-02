# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Visual Factory TV** — a manufacturing shop-floor dashboard, originally scaffolded as a Google AI Studio applet. It displays Odoo sale orders on a live TV view, gives admins a read-only console over the same data, and layers Gemini AI features (voice commands, risk predictions, client reports, anomaly analysis) on top. The UI is **entirely in Spanish**; all AI prompts also instruct the model to respond in Spanish.

## Getting Started

### Prerequisites
- Node.js 18+
- A Google Gemini API key (required for AI features)
- Odoo instance credentials (required for TV dashboard)
- Firebase project (required for admin panel & stats)

### Environment Setup

Copy `.env.example` to `.env.local` and fill in:

| Variable | Source | Purpose |
|----------|--------|---------|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) | AI features (server-side proxy only — never exposed to the browser) |
| `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD` | Your Odoo instance | TV dashboard data |
| `FIREBASE_API_KEY` | `firebase-applet-config.json` or Firebase Console | Server verifies Firebase ID tokens on `/api/*` |
| `DEV_AUTH_BYPASS` | Set to `true` only for local dev (optional) | Opt-in localhost bypass on `server.ts`; default is fail-closed |
| `APP_URL` | Set by AI Studio at runtime (or your domain) | Self-referential links |
| `VITE_ODOO_PROXY_URL` | URL of a remote proxy host (no trailing slash) | Points the frontend at an Odoo proxy on a different host; empty = same origin |

### Firebase Setup

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Initialize Firestore (enable anonymous auth in Auth settings)
3. Deploy security rules: `firebase deploy --only firestore:rules` (Firebase CLI required)
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
npm run lint       # tsc --noEmit — the ONLY check; there are no unit tests or ESLint
```

There is **no test runner and no linter** beyond `tsc --noEmit`. Treat `npm run lint` as the gate for "does this compile."

## Data sources

**Odoo ERP is the single source of truth for orders.** The TV Dashboard (`/`), Admin console (`/admin`) and Stats (`/stats`) all show Odoo `sale.order` records with `invoice_status = 'to invoice'`, fetched through the shared `useOdooOrders()` hook (`src/hooks/useOdooOrders.ts`) → React Query polling → Express proxy (`server.ts`). All three pages share one query key (`odooData`), so they share a single request/cache.

`OdooSaleOrder` includes a `deliveries: OdooDelivery[]` field — the linked `stock.picking` records (outgoing transfers). Each `OdooDelivery` has `name` (e.g. `WH/OUT/00042`), `state` (`draft | confirmed | waiting | assigned | done | cancel`), and `date_done`. `OdooOrderCard` shows a badge row ("Rem.") summarising delivery counts by state, excluding cancelled ones.

**Firestore** only holds `company_configs` (per-client delivery schedules, shown on the TV cards and managed from the Admin → Configuración tab) and backs Firebase **auth**. The legacy `work_orders` / `work_orders_history` collections were retired in 2026-06 (data preserved but rules closed — see `docs/superpowers/specs/2026-06-12-admin-odoo-console-design.md`). The Admin console is **read-only** over Odoo: there is no order CRUD anywhere in the app.

### The Odoo proxy (`server.ts`)

A standalone Express server (not part of Vite) that exists to hide Odoo credentials and avoid CORS. It authenticates to Odoo via JSON-RPC (`/web/session/authenticate`), keeps the `session_id` cookie, and re-issues `call_kw` RPCs. Endpoints: `GET /api/odoo/status`, `GET /api/odoo/invoiceable-orders`, `POST /api/ai/generate`. **All `/api/*` routes require a valid Firebase ID token** (`Authorization: Bearer <idToken>`). The TV dashboard obtains that token via anonymous Firebase auth (`App.tsx` → `signInAnonymously`); admin/stats use email/password. Local bypass is **opt-in only**: set `DEV_AUTH_BYPASS=true` in `.env.local` to skip token checks for connections from `127.0.0.1` / `::1` — never rely on `NODE_ENV` alone (Cloudflare Tunnel arrives as localhost). The same auth posture exists in `functions/src/index.ts` for Firebase Hosting deploys. Configured from `.env.local` / `.env` (`ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD`, `ODOO_PROXY_PORT`, `FIREBASE_API_KEY`, `GEMINI_API_KEY`).

## AI layer (`src/services/ai.ts`)

All Gemini calls go through the **server proxy** (`POST /api/ai/generate` on `server.ts` or Cloud Functions), keyed by `process.env.GEMINI_API_KEY` on the server only — the browser never holds the key. The client module `src/services/ai.ts` sends authenticated requests with the Firebase ID token. Functions cover: shift summaries (Stats), client report emails, global anomaly analysis, per-order risk prediction (ephemeral, not persisted), natural-language order filtering, **voice command processing** (Web Speech API transcript → JSON action for the TV dashboard), and TTS speech. All functions take `OdooSaleOrder` data; the `simplifyOrder` helper produces the compact Spanish-field projection used in prompts.

Model IDs referenced as string literals: text tasks and voice-command understanding use `gemini-3.5-flash`; **TTS (`generateSpeech`) must use a dedicated audio model — `gemini-2.5-flash-preview-tts`**. A text flash model does NOT emit audio (`inlineData` comes back empty → silent response), so never swap the TTS model for `gemini-3.5-flash` in a bulk model bump. `gemini-2.0-flash` is **deprecated — do not reintroduce it**. The server allowlists only these two model IDs on `/api/ai/generate`.

**Voice command TTS pipeline**: `processTextVoiceCommand()` (primary path — browser Web Speech API) sends the transcript to Gemini and returns a JSON action (`highlight | filter | answer`) plus a Spanish `message`, optional `filter_type` (`all | overdue | pending | delivered | critical`) / `filter_client`. `processVoiceCommand()` (audio inline) remains available but is not the TV default. `generateSpeech()` sends the message to the TTS model, which returns raw **PCM audio at 24 kHz** encoded as base64. `playPCMBase64()` in `TVDashboard.tsx` decodes it manually (16-bit little-endian samples → Float32) and plays it via a singleton `AudioContext` (`sharedAudioCtx`, `sampleRate: 24000`). Don't replace this with `<audio src="data:...">` — browsers won't decode raw PCM without a WAV header.

`window.aistudio` (typed in `src/types.ts`) gates whether an API key is selected when running inside Google AI Studio; `App.tsx` blocks the UI until `hasSelectedApiKey()` is true in that environment only.

## Auth & routing

- `App.tsx` signs every visitor in **anonymously** on load so the public TV Dashboard works without a visible login while still obtaining a Firebase ID token for `/api/*` and satisfying Firestore rules (`request.auth != null`). If anonymous auth is disabled in Firebase Console, the app shows a clear error screen.
- Admins sign in via **email/password** (`Login.tsx`). `ProtectedRoute` guards `/admin` and `/stats` using `isRealUser()` (rejects anonymous sessions) and subscribes to `onAuthStateChanged`.
- `Layout.tsx` renders a bare full-screen shell for `/` (the TV view) and the sidebar chrome for everything else.

## Firestore rules (`firestore.rules`)

Only `company_configs` is writable (validated: exact field set, string lengths, timestamp). `work_orders` and `work_orders_history` are **closed** (`allow read, write: if false`) — legacy data is preserved in Firestore but unreachable. If you add a field to `CompanyConfig`, update both `src/types.ts` **and** `isValidCompanyConfig()` here, or writes will be rejected. Deploy with `firebase deploy --only firestore:rules`.

## TV Dashboard — view modes & layout

`TVDashboard` has two rendering modes toggled by the `viewMode` state (`'tv' | 'desktop'`):

- **TV mode** (default): paginated view — orders are grouped by `partner_name`, each group split into pages of `ordersPerPage` cards. Pages auto-rotate every 10 seconds (`setInterval`). The page index resets to 0 when a voice filter is applied or a PO highlight expires.
- **Desktop mode**: all groups shown at once in a single scrollable column; no pagination, no auto-rotate.

A `ResizeObserver` on the grid container recomputes `gridCols` / `gridRows` / `ordersPerPage` on every resize. It also derives two layout flags passed to `OdooOrderCard`:
- `isWide`: few columns + few rows + wide aspect ratio → cards render larger text and padding
- `isDense`: many cards in limited vertical space → cards use a compact horizontal layout

`SmartText` (`src/components/SmartText.tsx`) renders order text with adaptive abbreviation and font-size based on the `isWide`/`isDense` flags — it consumes those same flags and must receive them for text to size correctly in each layout mode.

Voice filter types accepted by `setVoiceFilter`: `'all' | 'overdue' | 'pending' | 'delivered' | 'critical'` (defined as `VALID_VOICE_FILTERS` const). The Gemini voice command response sets `filter_type` to one of these. There is also a separate `clientFilter` string state ("muéstrame las de Bosch") set from the response's `filter_client`, combinable with `filter_type`; clearing the filter (`'all'`) also resets `clientFilter`.

**Fully-delivered orders are hidden from the TV view.** `filteredOdooOrders` excludes any order where `isOrderFullyDelivered(order)` (`src/services/odoo.ts`) is true — i.e. it has deliveries and **all** non-cancelled `stock.picking` records are in `done` state. The `'delivered'` voice filter is the deliberate override: it shows *only* those hidden, fully-delivered orders (also state-based, not the old `progress >= 100` quantity check). This hiding is **TV-only** — Admin/Stats filter independently and still show everything.

## Conventions & gotchas

- **PO number format**: canonical form is `YYYY/SXXXXX` (current year + 5 zero-padded digits). Always run user/AI-supplied PO strings through `formatPONumber` (`src/utils/formatters.ts`) before display or matching.
- **Customer logos**: TV dashboard maps Odoo `partner_name` → logo via keyword/regex matching in `src/utils/customerLogos.ts`; logo files live in `public/logos/`. Add new clients there.
- **xlsx-js-style** needs Node built-ins in the browser — `vite-plugin-node-polyfills` in `vite.config.ts` provides them. Don't remove it. It's configured with `globals: { process: false }`: the process shim would shadow the `define` that injects `GEMINI_API_KEY`, breaking AI features with "An API Key must be set when running in a browser".
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
│   │   ├── admin/         # OrdersTable, ConfigTab, AIModal, riskTypes
│   │   ├── ui/            # shadcn/ui primitives (dialog, drawer, badge, button, …)
│   │   ├── TVControlBar.tsx  # Voice mic + filter controls overlay
│   │   ├── OdooStatusBadge.tsx
│   │   ├── ErrorBoundary.tsx
│   │   └── ...            # Other reusable UI components
│   ├── services/
│   │   ├── companyConfigs.ts  # Firestore CRUD for delivery schedules
│   │   ├── odoo.ts        # Odoo API client (via proxy)
│   │   ├── ai.ts          # Gemini API calls (voice, predictions, reports, etc.)
│   │   └── ...
│   └── utils/             # Helpers (formatPONumber, customerLogos, etc.)
├── server.ts             # Express proxy for Odoo (auth + CORS wrapper)
├── firestore.rules       # Security rules for Firestore collections
├── vite.config.ts        # Vite + PWA + polyfills config
├── .env.example          # Environment variable template
├── docs/superpowers/     # Implementation plans & design specs (useful architectural context)
│   ├── plans/            # Numbered implementation plans per sprint
│   └── specs/            # Design spec docs referenced in CLAUDE.md
├── dev-dist/             # Auto-generated by vite-plugin-pwa — DO NOT EDIT
├── .stitch/              # Stitch design-tool artifact — safe to ignore
└── dist/                 # Build output (git-ignored)

## gstack

gstack es un conjunto de skills para Claude Code. Instalar con:

```bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup
```

Regla: usar siempre `/browse` para navegación web — **nunca** usar herramientas `mcp__claude-in-chrome__*` directamente.

Skills disponibles:
`/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/setup-gbrain`, `/retro`, `/investigate`, `/document-release`, `/document-generate`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`
```

## Design System
Always read `DESIGN.md` before making any visual or UI decisions.
All font choices, colors, spacing, status/urgency rules, and aesthetic direction are defined there.
The implemented tokens live in `src/index.css` (`@theme`); `DESIGN.md` explains intent and the rules code must follow.
Do not deviate without explicit user approval. In QA/review, flag any code that doesn't match `DESIGN.md`.

