## Learned User Preferences

- TV dashboard stays publicly accessible without visible login via Firebase anonymous auth; all `/api` routes require Firebase ID tokens.
- Strict TypeScript in touched code: no `any` or `@ts-ignore`.
- UI and AI responses must be entirely in Spanish.
- Read `DESIGN.md` before visual/UI decisions; implemented tokens live in `src/index.css`.
- gstack is required for all AI-assisted work; verify install before starting.
- When implementing attached plans: do not edit the plan file; use existing todos and complete all of them.
- Ask clarifying questions when uncertain before coding.
- TV order cards use one dominant status-color system (red → amber → green → gray precedence) for legibility at distance.
- Run `npm run lint` as the compile gate before deploy or build workflows.

## Learned Workspace Facts

- Visual Factory TV: Odoo ERP is the single source of truth for sale orders; Firestore holds `company_configs` and backs Firebase auth only.
- Firebase project `smv-brain`, Hosting site `dashboardsmv` at https://dashboardsmv.web.app.
- Primary TV use case: legible at 3–4 m on large screens; mobile uses separate layout via `useMobile()` (<768 px).
- Auth split: anonymous Firebase for TV (`/`), email/password plus `isRealUser()` for `/admin` and `/stats`.
- AI models allowlisted: `gemini-3.5-flash` (text/voice) and `gemini-2.5-flash-preview-tts` (TTS only — not interchangeable).
- `DEV_AUTH_BYPASS=true` is opt-in localhost-only; default is fail-closed; never rely on `NODE_ENV` alone.
- PO canonical format is `YYYY/SXXXXX` via `formatPONumber` (dynamic current year).
- `CLAUDE.md` is the primary project guide for agents in this repo.
- No test runner beyond `tsc --noEmit` (`npm run lint`).
