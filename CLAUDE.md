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
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) | AI features (voice, reports, predictions) |
| `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD` | Your Odoo instance | TV dashboard data |
| `API_SECRET` / `VITE_API_SECRET` | Generate a strong random string | Odoo proxy auth in production |
| `APP_URL` | Set by AI Studio at runtime (or your domain) | Self-referential links |

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

**Firestore** only holds `company_configs` (per-client delivery schedules, shown on the TV cards and managed from the Admin → Configuración tab) and backs Firebase **auth**. The legacy `work_orders` / `work_orders_history` collections were retired in 2026-06 (data preserved but rules closed — see `docs/superpowers/specs/2026-06-12-admin-odoo-console-design.md`). The Admin console is **read-only** over Odoo: there is no order CRUD anywhere in the app.

### The Odoo proxy (`server.ts`)

A standalone Express server (not part of Vite) that exists to hide Odoo credentials and avoid CORS. It authenticates to Odoo via JSON-RPC (`/web/session/authenticate`), keeps the `session_id` cookie, and re-issues `call_kw` RPCs. Endpoints: `GET /api/odoo/status`, `GET /api/odoo/invoiceable-orders`. Auth is **bypassed on localhost**; in production it requires `Authorization: Bearer <API_SECRET>`. The frontend sends `VITE_API_SECRET` as that bearer token. Configured entirely from `.env.local` / `.env` (`ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD`, `ODOO_PROXY_PORT`).

## AI layer (`src/services/ai.ts`)

All Gemini calls go through `@google/genai`, keyed by `process.env.GEMINI_API_KEY` (injected at build time by `vite.config.ts` via `define`, and at runtime by the AI Studio platform). Functions cover: shift summaries (Stats), client report emails, global anomaly analysis, per-order risk prediction (ephemeral, not persisted), natural-language order filtering, **voice command processing** (audio → JSON action for the TV dashboard), and TTS speech. All functions take `OdooSaleOrder` data; the `simplifyOrder` helper produces the compact Spanish-field projection used in prompts.

Model IDs are referenced directly as string literals in this file (e.g. `gemini-3.1-pro-preview`, `gemini-2.5-flash-preview-tts`). When changing models, update them here.

`window.aistudio` (typed in `src/types.ts`) gates whether an API key is selected; `App.tsx` blocks the UI until `hasSelectedApiKey()` is true.

## Auth & routing

- `App.tsx` signs the user in **anonymously** on load so the public TV Dashboard works without credentials while still passing Firestore rules (which require `request.auth != null`).
- Admins upgrade to a real session via **Google sign-in** (`Login.tsx`). `ProtectedRoute` guards `/admin` and `/stats` on `auth.currentUser`.
- `Layout.tsx` renders a bare full-screen shell for `/` (the TV view) and the sidebar chrome for everything else.

## Firestore rules (`firestore.rules`)

Only `company_configs` is writable (validated: exact field set, string lengths, timestamp). `work_orders` and `work_orders_history` are **closed** (`allow read, write: if false`) — legacy data is preserved in Firestore but unreachable. If you add a field to `CompanyConfig`, update both `src/types.ts` **and** `isValidCompanyConfig()` here, or writes will be rejected. Deploy with `firebase deploy --only firestore:rules`.

## Conventions & gotchas

- **PO number format**: canonical form is `2026/SXXXXX` (5 digits, zero-padded). Always run user/AI-supplied PO strings through `formatPONumber` (`src/utils/formatters.ts`) before display or matching.
- **Customer logos**: TV dashboard maps Odoo `partner_name` → logo via keyword/regex matching in `src/utils/customerLogos.ts`; logo files live in `public/logos/`. Add new clients there.
- **xlsx-js-style** needs Node built-ins in the browser — `vite-plugin-node-polyfills` in `vite.config.ts` provides them. Don't remove it. It's configured with `globals: { process: false }`: the process shim would shadow the `define` that injects `GEMINI_API_KEY`, breaking AI features with "An API Key must be set when running in a browser".
- **PWA**: `vite-plugin-pwa` with `registerType: 'autoUpdate'`, registered in `main.tsx` via `registerSW({ immediate: true })`. Enabled in dev too.
- **HMR** is controlled by `DISABLE_HMR` env var (set by AI Studio to prevent flicker during agent edits) — leave the `server.hmr` logic in `vite.config.ts` alone.
- The `@` import alias resolves to the **repo root** (`vite.config.ts` + `tsconfig.json`), but `src/` code currently uses relative imports throughout — match the surrounding style.
- Odoo datetimes arrive as non-ISO strings (`"YYYY-MM-DD HH:MM:SS"` in UTC); always parse them through `parseOdooDate` (`src/services/odoo.ts`), which normalizes to a JS `Date` (or `null`). Don't `new Date()` raw Odoo strings — Safari rejects them and Chrome misreads the timezone.

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
│   │   └── useOdooOrders.ts  # Shared React Query hook (TV, Admin, Stats)
│   ├── components/
│   │   ├── admin/         # OrdersTable, ConfigTab, AIModal, riskTypes
│   │   └── ...            # Reusable UI components
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
└── dist/                 # Build output (git-ignored)
```

## Common Tasks

| Task | Command |
|------|---------|
| Start development (Vite + Odoo proxy) | `npm run dev:full` |
| Start only frontend dev server | `npm run dev` |
| Start only Odoo proxy | `npm run server` |
| Build for production | `npm run build` |
| Type-check without compilation | `npm run lint` |
| Clean build artifacts | `npm run clean` |
| Preview production build locally | `npm run preview` |
