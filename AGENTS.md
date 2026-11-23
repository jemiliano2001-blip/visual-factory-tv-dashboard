## Learned User Preferences

- TV dashboard (`/`) requires a real signed-in Firebase account (read-only TV account), matching `/admin` and `/stats`; all `/api` routes require Firebase ID tokens (anonymous sessions receive 403).
- Strict TypeScript in touched code: no `any` or `@ts-ignore`.
- UI must be entirely in Spanish.
- Read `DESIGN.md` before visual/UI decisions; implemented tokens live in `src/index.css`.
- gstack is required for all AI-assisted work; verify install before starting.
- When implementing attached plans: do not edit the plan file; use existing todos and complete all of them.
- Ask clarifying questions when uncertain before coding.
- TV order cards encode **urgency** (days late or margin: cyan on-time, amber 0–7 d, orange 8–30 d, red >30 d, zinc no date, fuchsia 100% delivered) with a separate badge; only the 0–7 d *Vencida* badge pulses. Cards have no glow or backdrop blur. See DESIGN.md's "Core rule".
- Run `npm run lint` as the compile gate before deploy or build workflows.

## Learned Workspace Facts

- Visual Factory TV: Odoo ERP is the single source of truth for sale orders; Firestore holds `company_configs` and backs Firebase auth only.
- Firebase project `smv-brain`, Hosting site `dashboardsmv` at https://dashboardsmv.web.app.
- Primary TV use case: legible at 3–4 m on large screens; mobile uses separate layout via `useMobile()` (<768 px).
- Auth split: all protected routes (`/`, `/admin`, `/stats`) require email/password or Google SSO (`isRealUser()`); `company_configs` writes require the `admin` custom claim and `usuarios/{uid}.activo === true` in SMV Hub gates `/api/*` in production.
- The app has no AI features (Gemini removed 2026-10-02); do not reintroduce them without an explicit request. Deploy hosting and functions together via `npm run deploy`.
- `DEV_AUTH_BYPASS=true` is opt-in localhost-only; default is fail-closed; never rely on `NODE_ENV` alone.
- PO canonical format is `YYYY/SXXXXX` via `formatPONumber` (dynamic current year).
- `CLAUDE.md` is the primary project guide for agents in this repo.
- No test runner beyond `tsc --noEmit` (`npm run lint`) y `npm test` (`tsx --test`).
- Firestore rules for `(default)` live in `firestore.rules` (this repo owns `(default)` since Fase 4) and are deployed manually with `firebase deploy --only firestore:rules --project smv-brain` (shared DB; `npm run deploy` omits them). `firebase.json` declares `firestore` `(default)` and must not declare `storage` (Storage rules belong to SMV Hub) — `shared/firestoreRulesOwnership.test.ts` enforces both.
