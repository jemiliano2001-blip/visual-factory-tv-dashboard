# Design System — Visual Factory TV

> Source of truth for visual and UI decisions. Read this before touching anything
> that renders. The implemented tokens live in `src/index.css` (`@theme` block);
> this file explains the intent behind them and the rules code must follow.
> If a token here disagrees with `src/index.css`, the code is the truth — update
> this file or fix the code, but never let them drift silently.

## Product Context
- **What this is:** A manufacturing shop-floor dashboard. It renders Odoo `sale.order`
  records on a wall-mounted TV, with a read-only admin console and a stats view over
  the same data.
- **Who it's for:** Plant supervisors and operators glancing at a TV from 3-4m away,
  and admins on desktop/mobile. The UI is entirely in Spanish.
- **Space/industry:** Industrial ops / control-room dashboards. Peers are MES boards
  and OEE/andon displays, not marketing or SaaS landing pages.
- **Project type:** Internal real-time dashboard (TV + admin + mobile).

## The One Memorable Thing
**"What needs attention right now."** A supervisor 4m away must know in under a second
whether anything is on fire. Every decision below serves this. When a choice trades
off against glanceable urgency, urgency wins.

## Aesthetic Direction
- **Direction:** Industrial / Utilitarian. The screen is a gauge, not a webpage.
- **Decoration level:** Expressive. Glow, soft blur, and accent stripes reinforce the
  progress/priority signal (kept legible, not noise).
- **Mood:** Dark, dense, vivid. The OLED background makes the progress colors (cyan /
  emerald / fuchsia) and priority glows pop; overdue still shouts loudest. It reads as a
  live, high-energy production board.
- **Reference sites:** None used (worked from design knowledge — control-room/andon norms).

### Core rule — Urgency-based card color (2026-10-02)
This is the load-bearing decision. The card's color encodes **urgency** (days late, or
days of margin), so a supervisor reads "what needs attention" across the whole wall at a
glance. Delivery progress is read from the `%`, the quantities and the bar width — it no
longer picks the color, because on real data 122 of 124 visible orders sit at 0 %
delivered and a progress color painted the whole wall cyan.
- **A tiempo (not late):** cyan. Label "Vence en N d" / "Vence hoy".
- **Atraso 0–7 d:** amber (`amber-400`). Newly late, still recoverable; the only tier
  whose *Vencida* badge pulses.
- **Atraso 8–30 d:** orange (`orange-500`).
- **Atraso > 30 d:** red (`red-500`). Chronic; no pulse (dozens pulsing is noise).
- **Sin fecha:** neutral zinc.
- **Entregada (100 %):** fuchsia — only visible with the "Entregadas" filter.
- The tier, color and label come from one pure function, `getCardPresentation()`
  (`src/services/cardPresentation.ts`, tested). The footer legend mirrors it.
- Thresholds (7 and 30 days) were picked from the real distribution (14 / 33 / 33 cards).
- **No glow, no backdrop blur on cards** — solid `bg-card`. Color appears only in the
  left accent stripe, border tint, progress bar and the timing label.

## Typography
- **Display/Brand:** `Syne` — distinctive, used sparingly (header / brand only). Never
  for data or long text.
- **UI/Labels/Body:** `Inter` — high x-height makes it legible at distance. Kept
  deliberately; see Decisions Log. (Future experiment: a distance-tuned grotesk such
  as Hanken Grotesk or Geist for a stronger identity — not adopted yet.)
- **Data/Tables (SO, %, quantities):** `JetBrains Mono` with `font-variant-numeric:
  tabular-nums` (utility `.font-mono-data`). Mandatory for any live-updating number so
  the layout does not shimmer as values change.
- **Code:** `JetBrains Mono`.
- **Loading:** Google Fonts via `@import` in `src/index.css`
  (`Inter` 300-900, `Syne` 400-800, `JetBrains Mono` 400/500/700).
- **Scale & distance:** Type scales by viewport, not just CSS breakpoints. `TVDashboard`
  computes a `ScreenTier` (`sm` <768 / `md` 768-1279 / `lg` 1280-1919 / `xl` >=1920) and
  a derived `big` flag (`isWide || screenTier === 'xl'`). On TV (`big`), the SO number,
  progress %, and quantities step up to the largest sizes; on mobile/admin they step
  down. Visual hierarchy on a card, largest to smallest: **SO number > progress % /
  quantity > client/status > secondary meta (lines, salesperson, dates)**.

## Color
- **Approach:** Two axes that both mean something — **progress** (the card status color)
  and **priority** (the badge). Color is never random, but the board is deliberately vivid.
- **Background (OLED):** `#0a0a0f`. Surfaces elevate by level: card `#121218`,
  popover `#16161d`, secondary `#1b1b22`, muted `#18181f`, accent `#20202a`.
- **Foreground:** `#f4f4f5`; muted text `#9ca3af`.
- **Primary (brand/action — indigo, the only brand accent):** `#6366f1`,
  foreground `#ffffff`, focus ring `#818cf8`. No second brand color. No gradients.
- **Borders/inputs:** border `rgba(255,255,255,0.08)`, input `rgba(255,255,255,0.12)`.
- **Card urgency color:** see "Core rule" above — set in `getCardPresentation()` via literal
  Tailwind classes, not tokens.
- **Urgency badge (one per card):** *Alta* = warning badge; *Vencida* = solid destructive
  badge (pulses only for the 0–7 d tier). The badge adds to the card color; it does not
  replace the timing label ("Atraso 12 d") at the bottom-left.
- **`status-*` tokens still live in `src/index.css`** (`overdue #ef4444`, `warning
  #f59e0b`, `ontime`, `none`) and are used by **Admin / Stats** surfaces.
- **Generic semantic (toasts, form validation, info):** destructive `#ef4444`, success
  `#10b981`, warning `#f59e0b`, info `#3b82f6`, data/highlight `#22d3ee`.
- **Dark mode:** Dark-only by design (plant screen). `color-scheme: dark`. There is no
  light mode and none is planned.

### Decoration rules (legibility first)
- **Cards are solid.** No glow blob, no `backdrop-filter`. Chrome (header, control bar,
  overlays) may still use `glass-panel`. Never let decoration outshine the SO number / %.
- **Still avoid true slop:** no full-card gradient fills, no gradient CTAs,
  no centered-everything, no uniform bubble-radius on everything. The urgency palette
  (cyan / amber / orange / red / zinc) is the *status* palette — don't add brand colors.

## Spacing
- **Base unit:** 4px.
- **Density:** Spacious on TV (`big`), comfortable on desktop admin, compact on dense
  grids / mobile. Density flips off `screenTier` / `isDense` / `isWide`, not guesswork.
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64).

## Layout
- **Approach:** Grid-disciplined. Equal cards, fixed positions, no overlap or asymmetry —
  a glance display must put the same thing in the same place every render.
- **Grid:** Auto-fitting; `TVDashboard` recomputes `gridCols` / `gridRows` /
  `ordersPerPage` from a `ResizeObserver` and derives `isWide` / `isDense`.
- **Viewport modes:** `.tv-viewport` (no scroll, content forced to fit, auto-rotating
  pages) vs `.desktop-viewport` (scroll allowed). TV hides fully-delivered orders;
  admin/stats show everything.
- **Border radius:** base `--radius: 0.75rem` (12px). Hierarchical: sm 4px, md 8px,
  lg 12px, pill/full 9999px for badges.
- **Elevation:** `--shadow-card: 0 10px 30px -14px rgba(0,0,0,.7)`;
  `--shadow-overlay: 0 24px 60px -20px rgba(0,0,0,.8)`.
- **Z-index:** header `z-[60]`; modals/drawers `z-[70]` (must sit above the header).

## Motion
- **Approach:** Functional + light expressive accents. Cards mount with a spring
  fade/scale; the progress bar animates its fill.
- **Alarm motion:** `animate-pulse` on the single *Vencida* badge — reserved for overdue,
  the loudest state. (The separate bouncing overdue marker was removed 2026-08-20.)
- **Everything else:** plain fades/transitions for state changes and page rotation.
- **Easing:** enter `ease-out`, exit `ease-in`, move `ease-in-out`.
- **Duration:** micro 50-100ms, short 150-250ms, medium 250-400ms, long 400-700ms.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-26 | Initial design system created | `/design-consultation`. Codifies the existing `src/index.css` tokens into a source of truth. |
| 2026-06-26 | Adopt alarm hierarchy: demote on-time, red is the only loud state | Serves the memorable thing ("what needs attention right now"); three vivid statuses flatten the alarm signal at 3-4m. |
| 2026-06-26 | Keep Inter for UI/body | High x-height reads well at distance; switching again is churn. Hanken Grotesk / Geist logged as a future experiment, not adopted. |
| 2026-06-26 | Glass restricted to chrome; glow/pulse reserved for overdue | Blur and glow reduce contrast at distance; decoration must not fight legibility. |
| 2026-06-26 | Alarm hierarchy implemented in code | `--color-status-ontime` → `#3f6b54`; on-time cards neutral chrome + muted text; overdue border/tint strengthened (`/70`, `/[0.08]`). Doc and `src/index.css` now agree. |
| 2026-06-30 | **Reverted to vibrant progress-based card (look of 23-jun, `5f616fe`)** | User preference: the flat alarm-hierarchy card was disliked. Card color now encodes progress (cyan/emerald/fuchsia) with glow/blur + priority glow; `status-*` tokens kept for Admin/Stats only. Reverses the 06-26 alarm-hierarchy decision for the TV card. |
| 2026-08-20 | Reoriented `/admin` from supervision console to design-team work tool | The people actually using Admin daily are the design/production team ("what's still missing, what do I print"), not a supervisor. Dropped vendor/priority columns, anomaly analysis and risk prediction; added **Pendientes** (missing pieces by line, sorted by urgency) and **Entregas** (deliveries by state) tabs, row selection + a real multi-sheet Excel export, and reoriented the IA tools (`summarizePendingWork`, `explainOrderRequirements`) to help design read requirements, not to evaluate the business. Admin now uses the unified `getOrderStatus` (same as Stats) instead of the looser `isOrderOverdue`/`getOrderPriority` pair. `status-*` badge tokens (`STATUS_VARIANT` in `src/components/admin/orderStatusMeta.ts`) are now visibly used in Admin's own table/tabs, not just Stats. |
| 2026-08-20 | **One urgency signal per card: dropped the red ring/glow and merged the two pills** | The card was carrying two competing color systems at once — a progress-colored accent stripe *and* a red ring + outer glow layered over the whole surface — plus **two** badges for one fact. Root cause found in code, not taste: `getOrderPriority` returns `'critical'` exactly when `diffMs < 0`, which is the definition of `isOrderOverdue`, so `isCritical` and `isOverdue` are the same boolean and "Crítica"/"Vencida" were *guaranteed* to render together in two different colors. (Consequently the `isOverdue → orange ring` branch in `cardPresentation.ts` was unreachable dead code and was deleted.) Fix keeps the 06-30 vibrant progress-based direction intact — **the axis was not flipped**: urgency no longer paints the card surface at all, it lives in one `Badge` (shadcn `dangerSolid` + pulse). Worst case was the shared pages, where client-panel border + card ring + stripe stacked three treatments. `Badge` gained a `size` variant so it still scales with `isLarge` on TV. |
| 2026-10-02 | Removed every AI feature (Gemini) | Not used in practice. Deleted `src/services/ai.ts`, `AIModal`, `shared/geminiProxy.ts`, the AI routes in `server.ts`/`functions`, the `@google/genai` and `react-markdown` deps, the NL search bar, "Plan del día", "Explicar requisitos" and the Stats executive summary. Also removes the public-anonymous Gemini quota exposure. |
| 2026-10-02 | **Card color = urgency (days late), not progress; cards lose glow/blur; footer legend rewritten** | Live Odoo data: 122/124 visible orders at 0 % delivered (progress color = one flat cyan wall) and 85/124 overdue (one saturated *Vencida* badge). Replaced by a graded ramp by days late (≤7 amber / 8–30 orange / >30 red), a timing label ("Atraso 35 d"), the commitment date in the free card space, and a pulse only for newly late orders. Supersedes the 2026-06-30 progress-color decision at the user's request; progress stays visible in the % and bar. |
