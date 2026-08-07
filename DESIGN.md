# Design System — Visual Factory TV

> Source of truth for visual and UI decisions. Read this before touching anything
> that renders. The implemented tokens live in `src/index.css` (`@theme` block);
> this file explains the intent behind them and the rules code must follow.
> If a token here disagrees with `src/index.css`, the code is the truth — update
> this file or fix the code, but never let them drift silently.

## Product Context
- **What this is:** A manufacturing shop-floor dashboard. It renders Odoo `sale.order`
  records on a wall-mounted TV, with a read-only admin console and a stats view over
  the same data, plus Gemini AI features (voice, risk, reports).
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

### Core rule — Progress-based status color (vibrant)
This is the load-bearing decision. The card's color encodes **delivery progress**, so a
supervisor reads "where is each order" across the whole wall at a glance.
- **Pendiente (0%) is cyan.** Cool, neutral start state.
- **En proceso (>0%) is emerald.** Work is moving.
- **Entregado (100%) is fuchsia.** Done.
- This color drives the left accent stripe, the progress bar, and the status icon/text,
  plus a tint on the card border. Every card carries its progress signal.
- **Priority is a separate, additive axis** (see Color → Priority): the SO badge glows
  blue/orange and pulses red for *Vencida*. **Atrasada/crítica** also tints the card
  red/orange and shows a "Vencida" marker — urgency rides on top of the progress color,
  it does not replace it.

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
- **Card progress color (primary axis — `color = progreso`, set in the card via literal
  Tailwind classes, not tokens):**
  - **Pendiente / 0%** — cyan (`cyan-400`): accent stripe, bar, status icon/text.
  - **En proceso / >0%** — emerald (`emerald-400`).
  - **Entregado / 100%** — fuchsia (`fuchsia-400`).
- **Priority badge + overdue tint (additive):** *Normal* blue glow, *Alta* orange glow,
  *Vencida* red with pulse; overdue/critical also tints the card border red/orange and
  shows a "Vencida" marker.
- **`status-*` tokens still live in `src/index.css`** (`overdue #ef4444`, `warning
  #f59e0b`, `ontime`, `none`) and may be used by **Admin / Stats** surfaces, but they do
  **not** drive the TV card anymore — the card is progress-based.
- **Generic semantic (toasts, form validation, info):** destructive `#ef4444`, success
  `#10b981`, warning `#f59e0b`, info `#3b82f6`, data/highlight `#22d3ee`.
- **Dark mode:** Dark-only by design (plant screen). `color-scheme: dark`. There is no
  light mode and none is planned.

### Decoration rules (vivid, but legibility first)
- **Cards use soft glow + blur as part of the language.** The TV/desktop card has a light
  `backdrop-blur(8px)`, a dim progress-colored glow blob, an accent stripe, and glowing
  priority badges. Keep them subtle enough that text stays crisp at distance.
- **Glow scales with importance.** *Vencida* is loudest (red glow + pulse + "Vencida"
  marker); progress glows are gentle. Never let decoration outshine the SO number / %.
- **Still avoid true slop:** no full-card gradient fills, no gradient CTAs,
  no centered-everything, no uniform bubble-radius on everything. Cyan/emerald/fuchsia are
  the *status* palette — don't introduce extra brand colors.

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
- **Alarm motion:** `animate-pulse` on the *Vencida* priority badge and `animate-bounce`
  on the overdue marker — reserved for critical/overdue, the loudest state.
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
