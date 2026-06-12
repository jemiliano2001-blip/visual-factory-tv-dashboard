# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Visual Factory TV** — a manufacturing shop-floor dashboard, originally scaffolded as a Google AI Studio applet. It displays work orders on a live TV view, lets admins manage them, and layers Gemini AI features (voice commands, predictions, reports, image generation) on top. The UI is **entirely in Spanish**; all AI prompts also instruct the model to respond in Spanish.

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

## Two independent data sources (the key architectural split)

The app reads from **two unrelated backends** depending on the page. Do not assume one feeds the other:

1. **Firestore** (`src/services/workOrders.ts`, `companyConfigs.ts`) — backs the **Admin Panel** and **Stats Dashboard**. Collections: `work_orders`, `work_orders_history` (immutable audit log), `company_configs`. All reads are real-time via `onSnapshot`. Every create/update/delete on a work order also writes a history record through `logHistory`.
2. **Odoo ERP** (`server.ts` proxy → `src/services/odoo.ts`) — backs the **TV Dashboard** at `/`. The TV view shows Odoo `sale.order` records with `invoice_status = 'to invoice'`, fetched via React Query polling against the proxy. It does **not** read Firestore work orders.

So "a work order" means two different things: a Firestore `WorkOrder` (admin-managed) vs. an Odoo `OdooSaleOrder` (read-only ERP data on the TV).

### The Odoo proxy (`server.ts`)

A standalone Express server (not part of Vite) that exists to hide Odoo credentials and avoid CORS. It authenticates to Odoo via JSON-RPC (`/web/session/authenticate`), keeps the `session_id` cookie, and re-issues `call_kw` RPCs. Endpoints: `GET /api/odoo/status`, `GET /api/odoo/invoiceable-orders`. Auth is **bypassed on localhost**; in production it requires `Authorization: Bearer <API_SECRET>`. The frontend sends `VITE_API_SECRET` as that bearer token. Configured entirely from `.env.local` / `.env` (`ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD`, `ODOO_PROXY_PORT`).

## AI layer (`src/services/ai.ts`)

All Gemini calls go through `@google/genai`, keyed by `process.env.GEMINI_API_KEY` (injected at build time by `vite.config.ts` via `define`, and at runtime by the AI Studio platform). Functions cover: shift summaries, client report emails, anomaly analysis, risk prediction (structured JSON output → stored on `WorkOrder.prediction`), natural-language order filtering, **voice command processing** (audio → JSON action for the TV dashboard), image analysis, image generation, file/CSV order extraction, and TTS speech.

Model IDs are referenced directly as string literals in this file (e.g. `gemini-3.1-pro-preview`, `gemini-3-pro-image-preview`, `gemini-3-flash-preview`, `gemini-2.5-flash-preview-tts`). When changing models, update them here.

`window.aistudio` (typed in `src/types.ts`) gates whether an API key is selected; `App.tsx` blocks the UI until `hasSelectedApiKey()` is true.

## Auth & routing

- `App.tsx` signs the user in **anonymously** on load so the public TV Dashboard works without credentials while still passing Firestore rules (which require `request.auth != null`).
- Admins upgrade to a real session via **Google sign-in** (`Login.tsx`). `ProtectedRoute` guards `/admin` and `/stats` on `auth.currentUser`.
- `Layout.tsx` renders a bare full-screen shell for `/` (the TV view) and the sidebar chrome for everything else.

## Firestore rules (`firestore.rules`)

Heavily validated, not just `auth != null`. Each collection has a domain validator enforcing exact field sets, string lengths, number bounds, and enum membership (e.g. `quantity_completed <= quantity_total`, status ∈ {scheduled, production, quality, hold}). `work_orders` updates must keep `createdAt` unchanged. `work_orders_history` is **append-only** (`update`/`delete` are `false`). If you add a field to a `WorkOrder`, you must update both `src/types.ts` **and** `isValidWorkOrder()` here, or writes will be rejected.

## Conventions & gotchas

- **PO number format**: canonical form is `2026/SXXXXX` (5 digits, zero-padded). Always run user/AI-supplied PO strings through `formatPONumber` (`src/utils/formatters.ts`) before display or matching.
- **Customer logos**: TV dashboard maps Odoo `partner_name` → logo via keyword/regex matching in `src/utils/customerLogos.ts`; logo files live in `public/logos/`. Add new clients there.
- **xlsx-js-style** needs Node built-ins in the browser — `vite-plugin-node-polyfills` in `vite.config.ts` provides them. Don't remove it. It's configured with `globals: { process: false }`: the process shim would shadow the `define` that injects `GEMINI_API_KEY`, breaking AI features with "An API Key must be set when running in a browser".
- **PWA**: `vite-plugin-pwa` with `registerType: 'autoUpdate'`, registered in `main.tsx` via `registerSW({ immediate: true })`. Enabled in dev too.
- **HMR** is controlled by `DISABLE_HMR` env var (set by AI Studio to prevent flicker during agent edits) — leave the `server.hmr` logic in `vite.config.ts` alone.
- The `@` import alias resolves to the **repo root** (`vite.config.ts` + `tsconfig.json`), but `src/` code currently uses relative imports throughout — match the surrounding style.
- Firestore `Timestamp` ↔ JS `Date` conversion is centralized in `convertTimestamps` (workOrders.ts); service functions return `Date`s, so write code against `Date`.

## Project Structure

```
.
├── src/
│   ├── main.tsx           # Entry point, PWA registration
│   ├── App.tsx            # Root router & auth initialization
│   ├── firebase.ts        # Firebase & Firestore initialization
│   ├── types.ts           # Shared TypeScript types (WorkOrder, etc.)
│   ├── pages/             # Route components (Admin, Stats, TV Dashboard)
│   ├── components/        # Reusable UI components
│   ├── services/
│   │   ├── workOrders.ts  # Firestore CRUD & real-time listeners
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
