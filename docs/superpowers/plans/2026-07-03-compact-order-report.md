# Compact Order Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink the printed order report from ~6-8 pages to ~2-3 by collapsing to one row per order, abbreviating text via SmartText's dictionary, and tightening print density.

**Architecture:** Extract SmartText's pure text logic (abbreviation dictionary, filler stripping, `generateTextLevels`) into a new React-free util `src/utils/abbreviate.ts` with a fixed-level `abbreviate()` helper; SmartText re-imports it (behavior unchanged). `OrderReportTab` then renders one `<tr>` per order — abbreviated `main_product` + "(+N líneas más)", order-level `qty_total`, terms abbreviated and hard-capped at 90 chars. Print CSS drops to 9px / 2px-5px padding.

**Tech Stack:** React + TypeScript, Tailwind v4, existing print CSS in `src/index.css`. No new dependencies.

## Global Constraints

- `npm run lint` (`tsc --noEmit`) is the only automated gate; must pass after every task. `functions/` is untouched by this plan — no rebuild needed there.
- No new dependencies; no AI summarization; portrait orientation only (no `@page` rules).
- All UI text in Spanish.
- `abbreviate()` must never return the level-3 "keywords" cut — readable abbreviation only (dictionary + filler removal).
- The five report columns stay exactly as-is: Referencia, Creado el, Cant., Descripción, Términos y condiciones.
- `order.lines` stays in the Odoo payload (Admin's expanded table still consumes it) — this plan only changes how the report renders, not what's fetched.
- Screen and print must render the same abbreviated text (no screen/print divergence).

---

### Task 1: Extract `abbreviate` util and rewire SmartText

**Files:**
- Create: `src/utils/abbreviate.ts`
- Modify: `src/components/SmartText.tsx:1-90` (delete inlined logic, import instead)

**Interfaces:**
- Consumes: nothing new.
- Produces: `generateTextLevels(text: string): string[]` and `abbreviate(text: string): string`, both exported from `src/utils/abbreviate.ts`. Task 2 imports `abbreviate`. `SmartText` imports `generateTextLevels`.

- [ ] **Step 1: Create `src/utils/abbreviate.ts`**

Move the dictionary, filler regex, and `generateTextLevels` **verbatim** from `src/components/SmartText.tsx` (lines 4-90) and add the `abbreviate` helper:

```ts
// ─── Diccionario de abreviaciones comunes en español (manufactura) ──────────
// Extraído de SmartText para reutilizarlo en contextos sin medición de DOM
// (p. ej. el reporte imprimible del admin).
export const ABBREVIATIONS: [RegExp, string][] = [
  [/\bServicio\b/gi, 'Serv.'],
  [/\bServicios\b/gi, 'Serv.'],
  [/\bFabricaci[oó]n\b/gi, 'Fab.'],
  [/\bManufactura\b/gi, 'Mfg.'],
  [/\binoxidable\b/gi, 'inox.'],
  [/\bTratamiento\b/gi, 'Trat.'],
  [/\bGalvanizado\b/gi, 'Galv.'],
  [/\bRecubrimiento\b/gi, 'Recub.'],
  [/\bMaquinados?\b/gi, 'Maq.'],
  [/\bAcabado\b/gi, 'Acab.'],
  [/\bEnsamble\b/gi, 'Ensam.'],
  [/\bInstalaci[oó]n\b/gi, 'Inst.'],
  [/\bMantenimiento\b/gi, 'Mant.'],
  [/\bAluminio\b/gi, 'Alum.'],
  [/\bHerramienta\b/gi, 'Herr.'],
  [/\bHerramientas\b/gi, 'Herr.'],
  [/\bAutom[aá]tico\b/gi, 'Auto.'],
  [/\bHidr[aá]ulico\b/gi, 'Hidr.'],
  [/\bNeum[aá]tico\b/gi, 'Neum.'],
  [/\bEl[eé]ctrico\b/gi, 'Eléc.'],
  [/\bIndustrial\b/gi, 'Ind.'],
  [/\bProducci[oó]n\b/gi, 'Prod.'],
  [/\bCertificado\b/gi, 'Cert.'],
  [/\bPulido\b/gi, 'Pul.'],
  [/\bTransporte\b/gi, 'Trans.'],
  [/\bDiseño\b/gi, 'Dis.'],
  [/\bSuministro\b/gi, 'Sum.'],
  [/\bReparaci[oó]n\b/gi, 'Rep.'],
  [/\bReemplazo\b/gi, 'Reemp.'],
  [/\bRetrabajo\b/gi, 'Retr.'],
  [/\bModificaci[oó]n\b/gi, 'Mod.'],
  [/\bEstructura\b/gi, 'Estr.'],
  [/\bConector\b/gi, 'Conect.'],
  [/\bTornillos?\b/gi, 'Torn.'],
  [/\bTransportador\b/gi, 'Transp.'],
  [/\bCalibraci[oó]n\b/gi, 'Calib.'],
  [/\bProgramaci[oó]n\b/gi, 'Prog.'],
  [/\bInspecci[oó]n\b/gi, 'Insp.'],
  [/\bMec[aá]nico\b/gi, 'Mec.'],
  [/\bProyecto\b/gi, 'Proy.'],
  [/\bEnsamblaje\b/gi, 'Ens.'],
  [/\bSoldadura\b/gi, 'Sold.'],
  [/\bPintura\b/gi, 'Pint.'],
  [/\bComponentes?\b/gi, 'Comp.'],
];

// Palabras sin información clave que se pueden eliminar en nivel agresivo
export const FILLER_WORDS = /\b(de|del|la|el|las|los|para|con|por|una?|en|al|su|sus|y|o|e)\b/gi;

/**
 * Genera versiones progresivamente más cortas del texto.
 *
 * Nivel 0: Texto completo
 * Nivel 1: Texto con abreviaciones de palabras comunes
 * Nivel 2: Abreviaciones + eliminar fillers
 * Nivel 3: Solo las primeras N palabras significativas (keywords)
 */
export function generateTextLevels(text: string): string[] {
  if (!text) return [''];

  const original = text.trim();

  // Nivel 1 — abreviar palabras conocidas
  let abbreviated = original;
  for (const [pattern, replacement] of ABBREVIATIONS) {
    abbreviated = abbreviated.replace(pattern, replacement);
  }

  // Nivel 2 — abreviar + quitar fillers
  const noFillers = abbreviated
    .replace(FILLER_WORDS, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Nivel 3 — solo keywords (primeras 4 palabras significativas)
  const keywords = noFillers.split(/\s+/).slice(0, 4).join(' ');

  // Deduplicar niveles
  const levels = [original];
  if (abbreviated !== original) levels.push(abbreviated);
  if (noFillers !== levels[levels.length - 1]) levels.push(noFillers);
  if (keywords !== levels[levels.length - 1]) levels.push(keywords);

  return levels;
}

/**
 * Abreviación fija para contextos sin medición de DOM (impresión):
 * diccionario + sin conectores. Nunca cae al nivel "keywords" —
 * el texto debe seguir siendo legible, no telegráfico.
 */
export function abbreviate(text: string): string {
  const levels = generateTextLevels(text);
  return levels[Math.min(2, levels.length - 1)];
}
```

Note the deliberate subtlety in `abbreviate`: `generateTextLevels` deduplicates, so a text with no abbreviatable words may produce only 1-2 levels. `Math.min(2, levels.length - 1)` returns the shortest available level up to level 2, and because level 3 (keywords) is only ever at index 3 when all four levels are distinct, index ≤2 can never be the keywords cut — except in the degenerate case where dedup collapses levels, in which case the value at that index equals the level-2 (or shorter) text anyway. Copy the code as-is.

- [ ] **Step 2: Rewire `src/components/SmartText.tsx`**

Delete lines 4-90 (the `ABBREVIATIONS` array, `FILLER_WORDS`, and `generateTextLevels` — everything between the imports and the `// ─── Props ───` comment) and add the import. The top of the file becomes:

```tsx
import React, { useRef, useState, useMemo, useLayoutEffect } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { generateTextLevels } from '../utils/abbreviate';

// ─── Props ──────────────────────────────────────────────────────────────────────
```

Nothing else in the component changes — `generateTextLevels` is called in the same place (`useMemo(() => generateTextLevels(text), [text])`).

- [ ] **Step 3: Compile-check**

Run: `npm run lint`
Expected: exits 0.

- [ ] **Step 4: Behavior check of `abbreviate` (no test runner exists — one-shot tsx eval)**

Run from the repo root:

```bash
npx tsx -e "import { abbreviate } from './src/utils/abbreviate'; const out = abbreviate('Fabricación de guarda para estampadora en sistema de alimentador de conducto'); console.log('OUT:', out); if (!out.includes('Fab.')) throw new Error('diccionario no aplicado'); if (/\b(de|para|en)\b/i.test(out)) throw new Error('fillers no eliminados'); console.log('OK');"
```

Expected output: `OUT: Fab. guarda estampadora sistema alimentador conducto` then `OK`. (If the installed `tsx` version rejects `-e`, write the same snippet to a scratch file and run `npx tsx <file>` instead.)

- [ ] **Step 5: Commit**

```bash
git add src/utils/abbreviate.ts src/components/SmartText.tsx
git commit -m "refactor: extraer diccionario de abreviaciones de SmartText a util puro"
```

---

### Task 2: One row per order + terms cap + denser print CSS

**Files:**
- Modify: `src/components/admin/OrderReportTab.tsx` (imports, `ClientGroup`)
- Modify: `src/index.css` (`@media print` block — two value changes)

**Interfaces:**
- Consumes: `abbreviate(text: string): string` from `../../utils/abbreviate` (Task 1).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Update imports and add `truncate` helper in `OrderReportTab.tsx`**

Add to the imports at the top of the file:

```tsx
import { abbreviate } from '../../utils/abbreviate';
```

Add this helper next to the existing `stripHtml` function:

```tsx
/** Corta a `max` caracteres con elipsis solo cuando realmente corta. */
function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}
```

- [ ] **Step 2: Replace the per-line rows in `ClientGroup` with one row per order**

The current `ClientGroup` body maps `orders.flatMap(order => { const lines = ...; return lines.map((line, i) => ...) })`. Replace the entire `ClientGroup` function with:

```tsx
function ClientGroup({ client, orders }: { client: string; orders: OdooSaleOrder[] }) {
  return (
    <>
      <tr className="order-report-group bg-muted/50">
        <td colSpan={5} className="px-2 py-1.5 font-bold uppercase tracking-wide text-foreground">
          {client} ({orders.length})
        </td>
      </tr>
      {orders.map(order => (
        <tr key={order.id} className="align-top">
          <td className="whitespace-nowrap px-2 py-1.5 font-mono-data">
            {order.name}
            {order.customer_reference && (
              <div className="text-[11px] text-muted-foreground">PO: {order.customer_reference}</div>
            )}
          </td>
          <td className="whitespace-nowrap px-2 py-1.5 font-mono-data">{formatDate(order.date_order)}</td>
          <td className="px-2 py-1.5 text-right font-mono-data tabular-nums">{order.qty_total}</td>
          <td className="px-2 py-1.5 text-foreground/90">
            {abbreviate(order.main_product)}
            {order.lines_count > 1 && (
              <span className="text-muted-foreground"> (+{order.lines_count - 1} líneas más)</span>
            )}
          </td>
          <td className="px-2 py-1.5 text-xs text-muted-foreground">
            {truncate(abbreviate(stripHtml(order.note)), 90)}
          </td>
        </tr>
      ))}
    </>
  );
}
```

Changes vs. the old version: no `flatMap` over lines, quantity is `order.qty_total`, description is `abbreviate(order.main_product)` + conditional "(+N líneas más)", terms go through `abbreviate` + `truncate(…, 90)` and appear on every order row (there is no longer an `i === 0` first-line condition).

- [ ] **Step 3: Tighten the print CSS in `src/index.css`**

In the `@media print` block, change exactly two rules:

```css
  .order-report-table {
    border-collapse: collapse;
    font-size: 9px;            /* era 10px */
  }

  .order-report-table th,
  .order-report-table td {
    border: 1px solid #9ca3af;
    padding: 2px 5px;          /* era 3px 6px */
  }
```

- [ ] **Step 4: Compile-check**

Run: `npm run lint`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/OrderReportTab.tsx src/index.css
git commit -m "feat(admin): reporte compacto — 1 fila por orden y textos abreviados"
```

- [ ] **Step 6: Build and deploy hosting**

(Established workflow for this feature: user validates the print output directly on production — backend untouched, so hosting only.)

```bash
npm run build
npx firebase-tools@latest deploy --only hosting
```

Expected: `vite build` succeeds; deploy ends with `Deploy complete!` and `Hosting URL: https://dashboardsmv.web.app`.

- [ ] **Step 7: Manual verification on production (requires real admin login — user does this)**

1. Reporte tab: one row per order; multi-line orders show "(+N líneas más)" and the order's **total** quantity.
2. Descriptions abbreviated (e.g. "Fabricación" → "Fab.", no "de/para/en" fillers).
3. Terms ≤ ~90 chars, ending in `…` when cut.
4. Print preview: ~2-3 pages for 105 orders, headers repeating, groups intact.
5. Regression: TV dashboard cards still abbreviate adaptively (SmartText unchanged in behavior).
