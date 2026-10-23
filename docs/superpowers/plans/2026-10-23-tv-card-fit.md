# Tarjetas TV que llenan su espacio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Al empezar la ejecución, copiar este plan a `docs/superpowers/plans/2026-10-23-tv-card-fit.md` (convención del repo).

**Goal:** Que cada tarjeta del modo TV ajuste su letra y su descripción al tamaño real que tiene en pantalla, sin espacio muerto, con un mínimo legible a 3-4 m, para que la tele funcione a 100 % de zoom.

**Architecture:** Hoy la tipografía depende de banderas de página (`isDense` = `cols >= 4` o página compartida, `isWide`, `screenTier`), no del tamaño real de la tarjeta: una tarjeta de ~360×240 px se dibuja con letra de 12-14 px (captura S01840). Se cambia a dos funciones puras con pruebas: `computeTVGrid()` decide columnas/filas con un **piso de legibilidad** (Balance: primero legible, luego el máximo de tarjetas; si no caben, más pantallas rotando) y `getCardFit()` decide, por tarjeta medida con `ResizeObserver`, el escalón de letra más grande que cabe y luego reparte el sobrante en descripción (letra primero, después 2-3 renglones y más partidas). Escritorio y móvil quedan como están.

**Tech Stack:** React 19 + TypeScript strict, Tailwind v4, `node:test` vía `tsx --test`.

**Spec:** este documento + decisiones del usuario (2026-10-23): prioridad "Balance"; reparto del espacio "Letra primero".

## Global Constraints

- UI 100 % en español. Sin dependencias nuevas.
- `DESIGN.md` manda: jerarquía **SO > % / cantidad > cliente/estado > meta**; colores de urgencia solo vía `getCardPresentation()`; sin glow ni blur en tarjetas.
- No darle `min-h-*` al bloque de partidas (recorta la barra de progreso) — sigue `flex-1 min-h-0 overflow-hidden`.
- El cambio aplica solo a `viewMode === 'tv' && !isMobile`. Escritorio (altura `auto`, no medible) y móvil conservan su ruta actual.
- Sin commit/push sin OK de Emiliano (regla global). Los pasos "Commit" se ejecutan solo con autorización.
- Gates: `npm test`, `npm run lint`, `npm run build`.

## Review Focus

0. **Renglón cortado a la mitad** (visto hoy a 1920×1080 en S01547, S01992, S02046, S01899, S02128, S02164: la 2.ª partida asoma recortada sobre el pie). `getCardFit` solo cuenta renglones completos (`floor`), así que nunca se pinta una partida que no cabe entera. → prueba en Task 2: `{width:370,height:125,lineCount:3,…}` → `tier === 'xs'`, `maxVisibleLines === 1` (el 2.º renglón es `+2 más`).
1. **Primer render sin medida (0×0):** `getCardFit` debe devolver un escalón por defecto (`sm`) y no parpadear a `xs`. → prueba en Task 2.
2. **Orden con muchas partidas (8+):** la letra no puede bajar de `xs` ni sacar la barra de progreso; debe salir `+N más`. → prueba en Task 2.
3. **Página compartida tipo quad** con segmento lleno: con el nuevo piso, `buildTVPages` debe seguir respetando `gridRows`; ninguna tarjeta de segmento queda por debajo de `xs`. → prueba en Task 1 (grid) y verificación visual en Task 5.
4. **Pantalla chica / ventana baja (p. ej. 1280×720):** `computeTVGrid` nunca devuelve 0 columnas ni 0 filas. → prueba en Task 1.
5. **Descripción larga con renglones de sobra:** con `lineClamp ≥ 2` se muestra el texto completo (`defaultLevel 0`), no la versión abreviada. → prueba en Task 2 + revisión visual.

---

### Task 0: Medir la tele real (diagnóstico, sin código)

- [ ] **Step 1:** En la PC de la tele, Chrome a **100 %** de zoom, abrir DevTools → Console: `[innerWidth, innerHeight, devicePixelRatio]`. Anotar el resultado en este plan.
- [ ] **Step 2:** Usar esas medidas como caso de prueba adicional en Task 1 (`computeTVGrid` con el tamaño real) y como viewport en Task 5.

### Task 1: `computeTVGrid` — rejilla con piso de legibilidad

**Files:**
- Create: `src/services/tvGrid.ts`
- Create: `src/services/tvGrid.test.ts`
- Modify: `src/pages/TVDashboard.tsx:208-259` (el `useEffect` del `ResizeObserver` llama a la función pura)

**Interfaces:**
- Produces:
  ```ts
  export interface TVGridInput { width: number; height: number; isTVMode: boolean }
  export interface TVGrid { cols: number; rows: number; ordersPerPage: number; isWide: boolean; screenTier: ScreenTier }
  export const MIN_TV_CARD_WIDTH = 340;   // px CSS, calibrable en Task 5 (mantiene 5 columnas a 1920)
  export const MIN_TV_CARD_HEIGHT = 150;  // = chrome sm + 2 renglones sm (ver Task 2)
  export const MAX_TV_COLS = 6;
  export function computeTVGrid(input: TVGridInput): TVGrid
  ```
  `ScreenTier` se importa de `OdooOrderCard.tsx` (ya exportado).
- **`isDense` deja de calcularse aquí** (lo decide cada tarjeta). Se conserva el estado en `TVDashboard` solo para lo que no es tarjeta (`hidePartner`, skeleton), con valor `cols >= 5`.

Reglas: `gap = width > 1200 ? 16 : 12`; `headerArea = aspect > 1.3 ? 100 : 80`; `footerArea = 40`; en TV `available = height - headerArea - footerArea`. `cols = clamp(floor((width + gap) / (MIN_TV_CARD_WIDTH + gap)), 1, MAX_TV_COLS)`; `rows = max(1, floor((available + gap) / (MIN_TV_CARD_HEIGHT + gap)))`. Fuera de TV: cols por los breakpoints actuales (600/1000/1400/1800), `rows = max(rows, 4)`, `ordersPerPage = 999`. `isWide = cols <= 4 && rows <= 2 && aspect > 1.3`. `screenTier` con los mismos cortes de hoy (768/1280/1920).

- [ ] **Step 1: Pruebas que fallan** (`tvGrid.test.ts`):
  - `1920×1080 TV` (pantalla completa de la PC, hoy 5×7 = 35 tarjetas apretadas) → `cols === 5` (`floor(1936/356)`), `rows === 5` (`floor((900+16)/166)`), `ordersPerPage === 25`.
  - `1280×720 TV` → `cols === 3`, `rows === 3` (`floor((580+16)/166)`), ninguno es 0.
  - `1366×768 TV` → `cols === 3`, `rows === 3`.
  - `300×200 TV` → `cols === 1`, `rows === 1`, `ordersPerPage === 1`.
  - `1920×1080 desktop` → `ordersPerPage === 999`, `cols === 5`.
  - El tamaño medido en Task 0 → `cols >= 1 && rows >= 1` y deja asentado el número de tarjetas esperado.
- [ ] **Step 2:** `npx tsx --test src/services/tvGrid.test.ts` → FAIL (módulo no existe).
- [ ] **Step 3:** Implementar `computeTVGrid` y reemplazar el cuerpo del `ResizeObserver` en `TVDashboard` por `const g = computeTVGrid({ width, height, isTVMode })` + los `set*`.
- [ ] **Step 4:** `npx tsx --test src/services/tvGrid.test.ts src/utils/tvPagePacking.test.ts` → PASS.
- [ ] **Step 5: Commit** (con OK): `feat(tv): rejilla con piso de legibilidad`.

### Task 2: `getCardFit` — letra y descripción según el tamaño real

**Files:**
- Create: `src/services/cardFit.ts`
- Create: `src/services/cardFit.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type CardFitTier = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  export interface CardFitInput { width: number; height: number; lineCount: number; hasReference: boolean; showPartner: boolean }
  export interface CardFit {
    tier: CardFitTier;
    maxVisibleLines: number;   // partidas a pintar (si hay más, el card pinta "+N más" en un renglón)
    lineClamp: 1 | 2 | 3;      // renglones por descripción
    showCommitment: boolean;   // fila "Compromiso d MMM yyyy"
    showDeliveries: boolean;   // fila "Rem."
  }
  export const CARD_FIT_METRICS: Record<CardFitTier, { minWidth: number; chrome: number; metaRow: number; lineRow: number }>;
  export function getCardFit(input: CardFitInput): CardFit
  ```

Tabla inicial (px CSS; `chrome` = padding + SO + pie con % y barra; calibrar en Task 5 sin cambiar la forma):

| tier | SO | partida | % | minWidth | chrome | metaRow | lineRow |
|---|---|---|---|---|---|---|---|
| xs | 14 | 12 | 16 | 0 | 80 | 14 | 16 |
| sm | 18 | 14 | 22 | 200 | 104 | 16 | 20 |
| md | 24 | 18 | 30 | 300 | 136 | 20 | 26 |
| lg | 30 | 22 | 38 | 420 | 168 | 22 | 30 |
| xl | 36 | 26 | 46 | 540 | 200 | 24 | 36 |

Algoritmo ("letra primero"):
1. Si `width <= 0 || height <= 0` → `{ tier: 'sm', maxVisibleLines: min(lineCount, 2) || 1, lineClamp: 1, showCommitment: false, showDeliveries: false }`.
2. `rowsNeeded = min(max(lineCount, 1), 2)`. Recorrer tiers de `xl` a `xs`; `fixed = chrome + metaRow·(hasReference + showPartner)`; elegir el primero con `width >= minWidth` y `fixed + rowsNeeded·lineRow <= height`. Si ninguno, `xs`.
3. `budget = max(1, floor((height - fixed) / lineRow))`.
4. Si `lineCount > budget` → `maxVisibleLines = max(1, budget - 1)` (el renglón restante es `+N más`; si `budget === 1`, el card pega `+N` al final de la cantidad en el mismo renglón), `lineClamp = 1`.
   Si no → `maxVisibleLines = lineCount`, `spare = budget - max(lineCount,1)`, `lineClamp = min(3, 1 + floor(spare / max(lineCount,1)))`.
5. `showCommitment` = queda ≥1 renglón libre tras las partidas y su clamp; `showDeliveries` = queda ≥1 más después de eso.

- [ ] **Step 1: Pruebas que fallan** (`cardFit.test.ts`):
  - `S01840`: `{width:360,height:240,lineCount:1,hasReference:false,showPartner:false}` → `tier === 'md'`, `lineClamp >= 2`, `showCommitment === true`.
  - Grande: `{600,450,1,…}` → `tier === 'xl'`.
  - Apretada: `{200,100,1,…}` → `tier === 'xs'`, `maxVisibleLines === 1`.
  - Muchas partidas: `{360,240,8,…}` → `maxVisibleLines < 8`, `maxVisibleLines >= 1`, `lineClamp === 1`, tier ≠ `xs` si caben 2 renglones de `sm`.
  - Sin medir: `{0,0,3,…}` → `tier === 'sm'`.
  - Monotonía: para `height` creciente con mismo ancho, el índice del tier nunca baja.
- [ ] **Step 2:** `npx tsx --test src/services/cardFit.test.ts` → FAIL.
- [ ] **Step 3:** Implementar en `src/services/cardFit.ts`.
- [ ] **Step 4:** Mismo comando → PASS.
- [ ] **Step 5: Commit** (con OK): `feat(tv): ajuste de tarjeta por tamaño real`.

### Task 3: Medir la tarjeta y aplicar el ajuste

**Files:**
- Create: `src/hooks/useElementSize.ts`
- Modify: `src/components/SmartText.tsx` (`maxLines?: 1 | 2 | 3`)
- Modify: `src/components/OdooOrderCard.tsx`
- Modify: `src/components/SharedTVPage.tsx:118-126` (deja de forzar `isDense={true}` para tipografía; conserva `hidePartner`)

**Interfaces:**
- Consumes: `getCardFit`, `CardFitTier` (Task 2).
- Produces: `export function useElementSize<T extends HTMLElement>(): { ref: React.RefObject<T | null>; width: number; height: number }` — `ResizeObserver` sobre `ref`, valores redondeados con `Math.round`, actualiza estado solo si cambian.

Cambios en `OdooOrderCard`:
- `const fitActive = viewMode === 'tv' && !isMobile;` medir el `motion.button` con `useElementSize`.
- Si `fitActive`: `fit = getCardFit({ width, height, lineCount: order.lines.length, hasReference: !!order.customer_reference, showPartner: !hidePartner })` y las clases salen de un mapa `TIER_CLASSES: Record<CardFitTier, { pad, heading, meta, line, qty, pct, small, icon, bar }>` con los px de la tabla de Task 2 (p. ej. `md` → `heading: 'text-2xl'`, `line: 'text-lg'`, `pct: 'text-[30px]'`). `maxVisibleLines`, `showCommitment`, `showDeliveries` salen de `fit`.
- Si no: rama actual intacta (`isDense`/`isLarge`).
- Descripción de partida: `<SmartText maxLines={fit.lineClamp} defaultLevel={fit.lineClamp >= 2 ? 0 : 2} …/>`; el renglón deja `items-center` → `items-start` cuando `lineClamp > 1` para que la cantidad quede alineada arriba.

- [ ] **Step 1:** Prueba que falla en `src/services/cardFit.test.ts`: `TIER_CLASSES` no existe aún → mover el mapa a `cardFit.ts` como `export const CARD_FIT_CLASSES` y probar que cada tier tiene las 9 claves y que `heading` crece de `xs` a `xl` (orden de la tabla). Run → FAIL.
- [ ] **Step 2:** Implementar `CARD_FIT_CLASSES`, `useElementSize`, el cambio de `SmartText` y el cableado del card. Run pruebas → PASS.
- [ ] **Step 3:** `npm run lint` → sin errores.
- [ ] **Step 4: Commit** (con OK): `feat(tv): tarjetas usan el ajuste por tamaño`.

### Task 4: Documentación

**Files:**
- Modify: `DESIGN.md` (sección *Scale & distance* y *Density*): la letra del modo TV la decide `getCardFit()` por tamaño medido; piso de legibilidad en `computeTVGrid()`; decisión "Balance / letra primero" con fecha 2026-10-23 en la tabla de decisiones.
- Modify: `CLAUDE.md` (sección *TV Dashboard — view modes & layout*): reemplazar la descripción de `isDense`/topes de líneas fijos (6/4/3/1) por la nueva regla; corregir la frase rota "Cards have no glow/blur.ts`)".

- [ ] **Step 1:** Editar ambos archivos.
- [ ] **Step 2: Commit** (con OK): `docs: ajuste de tarjetas TV por tamaño`.

### Task 5: Verificación visual y calibración

- [ ] **Step 1:** `npm test`, `npm run lint`, `npm run build` → todo verde.
- [ ] **Step 2:** `preview_start` (dev), iniciar sesión con cuenta real (la TV ya exige cuenta real, commit `a211d48`). Con `resize_window` revisar 1920×1080, 1366×768, 1280×720 y el tamaño de Task 0: página de un cliente (SENSATA), página compartida `split` y `quad`.
- [ ] **Step 3:** Criterios: (a) sin hueco vacío mayor a ~1 renglón entre la última partida y el pie; (b) barra de progreso y `%` siempre visibles; (c) SO sigue siendo lo más grande; (d) ninguna tarjeta en `xs` en página de un solo cliente a 1920×1080. Si falla, ajustar solo números de `CARD_FIT_METRICS` / `MIN_TV_CARD_*` y volver a correr Task 1-2.
- [ ] **Step 4:** Capturas antes/después de la tarjeta S01840 para mostrarle a Toni; revisar contra el checklist anti-slop y "Errores que ya cometimos".
- [ ] **Step 5:** En la tele: Chrome a 100 % y confirmar a 3-4 m.

## Ejecución recomendada

**Native** (yo implemento en esta sesión y un revisor fresco revisa la rama al final): las tareas encadenan interfaces (`computeTVGrid` → `getCardFit` → card) y son 5; el riesgo está en la calibración visual, que se hace mejor con el contexto completo.
