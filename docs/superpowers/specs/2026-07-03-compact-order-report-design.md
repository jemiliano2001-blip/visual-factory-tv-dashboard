# Reporte de Órdenes Compacto (~2-3 hojas) — Design Spec

**Date:** 2026-07-03
**Project:** Visual Factory TV Dashboard
**Status:** Approved

---

## Context

The bulk order report (shipped earlier today, spec `2026-07-03-order-report-all-orders-design.md`) works: a client-grouped table of all filtered orders, printable via `window.print()`. But at ~105 orders it prints **6-8 pages**. Two things inflate it:

1. **One row per order line.** An order with 10 lines occupies 10 rows; ~105 orders become ~250+ rows.
2. **Long text cells.** The "Términos y condiciones" column carries full contact/PO/delivery-time strings that wrap rows to 3-4 text lines; descriptions are unabbreviated.

The user wants the same report in **~2-3 pages**, using abbreviation "like SmartText". `SmartText` ([src/components/SmartText.tsx](../../../src/components/SmartText.tsx)) already contains exactly the right pure logic: a Spanish manufacturing abbreviation dictionary (`ABBREVIATIONS`: Fabricación→Fab., Diseño→Dis., 40+ entries), a filler-word stripper (`FILLER_WORDS`), and `generateTextLevels()` which composes them. That logic is currently trapped inside the React component next to DOM-measuring code that print doesn't need.

Decisions made with the user:
- **One row per order** (not per line): main description + "(+N líneas más)" suffix.
- **Terms abbreviated + capped** at ~90 chars with ellipsis (key info — contact, PO, delivery time — is almost always at the start).
- **Portrait, 9px print font** (was 10px), tighter cell padding.

---

## Architecture

### Files

| File | Change |
|------|--------|
| `src/utils/abbreviate.ts` | **New** — pure text functions extracted from `SmartText.tsx`: `ABBREVIATIONS`, `FILLER_WORDS`, `generateTextLevels(text): string[]`, and a new convenience `abbreviate(text): string` (= dictionary + filler removal, i.e. SmartText's "level 2"). No React, no DOM. |
| `src/components/SmartText.tsx` | Edit — delete the inlined dictionary/levels code; import `generateTextLevels` from `../utils/abbreviate`. Behavior unchanged. |
| `src/components/admin/OrderReportTab.tsx` | Edit — one row per order; abbreviated description with lines-count suffix; terms = `abbreviate(stripHtml(note))` truncated to 90 chars + `…`. |
| `src/index.css` | Edit — print table font 10px→9px, cell padding 3px 6px→2px 5px. |

### `src/utils/abbreviate.ts`

```ts
export const ABBREVIATIONS: [RegExp, string][] = [ /* moved verbatim from SmartText */ ];
export const FILLER_WORDS = /* moved verbatim */;

/** Niveles progresivos: [original, abreviado, abreviado sin conectores, keywords] */
export function generateTextLevels(text: string): string[] { /* moved verbatim */ }

/** Abreviación fija para contextos sin medición (impresión): diccionario + sin conectores. */
export function abbreviate(text: string): string {
  const levels = generateTextLevels(text);
  return levels[Math.min(2, levels.length - 1)];
}
```

`abbreviate` picks the level-2 variant when it exists, falling back to the shortest available (deduplicated levels may collapse). It never falls through to the level-3 keywords cut — the report should stay readable, not telegraphic.

### `OrderReportTab.tsx` row change

Replace the `flatMap` over `order.lines` in `ClientGroup` with one `<tr>` per order:

- **Descripción:** `abbreviate(order.main_product)` + (when `order.lines_count > 1`) a muted ` (+${order.lines_count - 1} líneas más)` suffix.
- **Cant.:** `order.qty_total` (order total, since lines are no longer itemized).
- **Términos:** `truncate(abbreviate(stripHtml(order.note)), 90)` where `truncate` appends `…` only when it actually cuts. Kept as a tiny local helper in the component (single call site — not worth a util).
- Referencia + PO, Creado el: unchanged.

Screen and print render the same abbreviated text — no screen/print divergence.

### Print CSS (`src/index.css`)

In the existing `@media print` block only two values change:

```css
.order-report-table { font-size: 9px; }          /* was 10px */
.order-report-table th, td { padding: 2px 5px; } /* was 3px 6px */
```

Everything else (pagination un-clipping, thead repetition, group-row background, chrome hiding) stays as-is.

---

## Testing

`npm run lint` (`tsc --noEmit`) must pass — only automated gate. `functions/` untouched, no rebuild needed there.

Manual (requires real admin login; user verifies on production after deploy, as with the previous two iterations):
1. Reporte tab: each order shows exactly one row; orders with multiple lines show the "(+N líneas más)" suffix and their **total** quantity.
2. Descriptions show dictionary abbreviations (e.g. "Fabricación" → "Fab.").
3. Terms cells never exceed ~90 chars and end with `…` when cut.
4. Print preview: ~2-3 pages for the full 105-order report; headers repeat per page; grouping intact.
5. TV dashboard unaffected: `SmartText` still abbreviates adaptively on cards (regression check after the extraction).

---

## Out of Scope

- AI/Gemini summarization of descriptions (deterministic dictionary is free, instant, offline).
- Landscape orientation / `@page` rules.
- Column add/remove — the five current columns stay.
- Any change to per-line data in Odoo queries — `lines` stays in the payload (Admin table's expanded view still uses it).
