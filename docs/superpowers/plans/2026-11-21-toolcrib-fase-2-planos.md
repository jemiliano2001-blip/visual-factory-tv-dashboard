# Fase 2: planos de Tool Crib (ligar, imprimir, marcar impreso) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada partida de la vista Tool Crib se ligue con su plano de la biblioteca de Vision, se imprima estampada con SO, PO, cantidad y fecha en N copias, y quede marcada "impreso" con su bitácora.

**Architecture:** Se porta de SMV Vision (`D:\proyectos_code\IA Personal\apps\SMV-VISION`) el ligado de planos y el estampado de PDF, reusando sus colecciones de Firestore (`toolcribParts`, `toolcribDrawings`, `toolcribPrintLogs`, `partAliases`) y los PDF de Storage, sin migrar datos. La lógica pura vive en `src/services/` con pruebas `node:test`; el acceso a Firestore en `src/services/toolCribLibrary.ts`; la UI cuelga de `ToolCribTab`.

**Tech Stack:** React 19, TypeScript estricto, Firebase 12 (`db` de `src/firebase.ts`, base `(default)`), React Query, `pdf-lib` (dependencia nueva, requiere aprobación), `node:test` vía `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-11-21-fusion-vision-toolcrib-design.md` (Fase 2). Requiere la Fase 1 (`docs/superpowers/plans/2026-11-21-toolcrib-fase-1.md`) ya en la rama: usa `ToolCribLine`, `collectToolCribLines` y `ToolCribTab`.

## Global Constraints

- Interfaz en español; `DESIGN.md` y tokens existentes. Móvil y escritorio (`useMobile`).
- **No se despliega nada y no se tocan reglas**: las reglas de Vision ya permiten leer/escribir `toolcribParts`, `toolcribDrawings`, `toolcribPrintLogs`, `partAliases` y Storage `tool-crib/{customer}/**` a cualquier cuenta real. Si algo requiere regla nueva, parar y preguntar.
- Tool Crib = cliente Suprajit; los planos viven en `tool-crib/SUPRAJIT/` y `customer: 'SUPRAJIT'`.
- Mínimo de ligado por parecido: **80** (`MIN_BLUEPRINT_MATCH_SCORE`). Regla ISO-first como en Vision.
- **Empate = ambigua**: si dos o más **partes distintas** empatan en el mejor puntaje, la partida queda "ambigua" y no se imprime hasta que alguien elija. Nunca se toma "el primero" en silencio.
- Impresión: una sola descarga de PDF combinado; `copies` por defecto `DEFAULT_COPIES = 2` (constante; la Fase 3 la sustituye por la config de la cuenta). Rango 1–5 en la UI, el log acepta 1–50 (validación de Vision).
- El log de impresión se escribe **solo después** de generar el PDF sin error. `printedByUid` es siempre el uid de la sesión; nunca de un parámetro.
- Sin IA (nada de Gemini, nada de rasterizado con IA). Sin juegos/sets (`toolcribSets`) ni notas por pieza: fuera de alcance.
- Dependencia nueva: `pdf-lib@^1.17.1` (la misma que usa Vision). **Pedir aprobación antes de `npm install`.**
- Cada commit lleva `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. No hacer push.

## Review Focus

- Dos partes distintas con el mismo mejor puntaje: partida ambigua, el botón Imprimir no aparece.
- Identificadores de parte distintos (`90-1012-05` vs `90-1012-06`) no se ligan aunque compartan palabras (veto = 0).
- Alias que apunta a un plano inactivo o inexistente: se trata como "sin plano", no como error.
- Plano activo sin `pdfUrl`: no imprimible, con mensaje claro; no se escribe log.
- La descarga del PDF falla (red o CORS): error visible, no se escribe log, la partida no pasa a impreso.
- SO con muchos registros en la bitácora: la consulta por `orderRef` va en lotes de 30 (límite de `in`).
- Cantidad vacía, 0, negativa o decimal: no se imprime; el diálogo exige entero ≥ 1.
- Texto con acentos, "ñ" o símbolos fuera de WinAnsi en la descripción o PO: no revienta el estampado (`sanitizeWinAnsi`).
- Reimprimir una partida ya impresa pide confirmación y suma otro log.

---

### Task 1: Compuerta previa (dependencia y acceso a los PDF)

**Files:**
- Modify: `package.json`, `package-lock.json` (solo `pdf-lib`)

**Interfaces:**
- Produces: `pdf-lib` disponible para las Tasks 4 y 6; decisión registrada sobre el acceso a `pdfUrl` desde el dashboard.

- [ ] **Step 1: Pedir aprobación a Emiliano** para instalar `pdf-lib@^1.17.1` (misma versión que Vision, ~400 KB, se importa con `import()` dinámico para no engordar el bundle principal). Esperar el sí.
- [ ] **Step 2: Instalar** con `npm install pdf-lib@^1.17.1` y confirmar con `npm run lint` que no rompe nada.
- [ ] **Step 3: Comprobar el acceso a los PDF desde el dashboard.** Los PDF se descargan con `fetch(pdfUrl)` desde el navegador; si el bucket `smv-brain.firebasestorage.app` no permite el origen del dashboard (CORS), la impresión no funcionaría. Con una cuenta ya iniciada, Emiliano pega en la consola del navegador (en el dashboard) `fetch('<pdfUrl de un plano de SUPRAJIT>').then(r => r.status)` y reporta el resultado. **Yo no inicio sesión ni uso credenciales.** Si es 200: seguir. Si falla por CORS: parar y preguntar, porque configurar CORS del bucket es un cambio de producción compartido.
- [ ] **Step 4: Commit** (solo si Step 2 cambió archivos)

```bash
git add package.json package-lock.json
git commit -m "chore: agregar pdf-lib para estampar planos"
```

---

### Task 2: Ligado de planos (lógica pura)

**Files:**
- Create: `src/services/toolCribMatching.ts`
- Test: `src/services/toolCribMatching.test.ts`
- Referencia a portar: `SMV-VISION/src/lib/matching.ts` (`normalizePieceLabel`, `extractPartIdentifiers`, `descriptiveTokens`, `extractOrderSignals`, `extractLibrarySignals`, `scorePieceMatch`, `isIsoDrawingView`, constante `MIN_BLUEPRINT_MATCH_SCORE`), `SMV-VISION/src/lib/aliasKey.ts` (`normalizeAliasKey`) y el paso de alias de `SMV-VISION/src/lib/visionPipeline/fetchOrdersAndMatch.ts` (líneas ~190-225).

**Interfaces:**
- Consumes: `ToolCribLine` (Fase 1, `src/services/toolCrib.ts`).
- Produces:
  - `interface DrawingView { partId: string; partNumber: string; customer: string; description: string; drawingId: string; revision: string; sourcePath: string; pdfUrl: string | null }` (subconjunto de `ToolcribActiveDrawingView` de Vision).
  - `interface PartAlias { id: string; pattern: string; partNumber: string; drawingId: string }`
  - `type DrawingResolution = { kind: 'match'; view: DrawingView; via: 'alias' | 'exact' | 'fuzzy'; score: number } | { kind: 'ambiguous'; candidates: DrawingView[] } | { kind: 'none' }`
  - `resolveLineDrawing(line: ToolCribLine, library: readonly DrawingView[], aliases: readonly PartAlias[]): DrawingResolution`
  - `normalizeAliasKey(pattern: string): string`

- [ ] **Step 1: Escribir las pruebas que fallan** (Vision no tiene pruebas de matching; estas son las primeras). Casos, con aserciones exactas:
  - Plano `partNumber: 'ABC-123'` y partida `'[ABC-123] Buje'` → `kind: 'match', via: 'exact', view.partNumber === 'ABC-123'`.
  - Veto: biblioteca solo con `'90-1012-06'` y partida `'[90-1012-05] Eje'` → `kind: 'none'`.
  - Alias: partida `'[ZZ-9] Eje especial'` con alias `{ pattern: 'ZZ-9', drawingId: 'd1' }` y plano `drawingId: 'd1'` → `via: 'alias'`.
  - Alias a un `drawingId` que no está en la biblioteca → `kind: 'none'` (no error).
  - Parecido: sin identificadores, partida `'Buje de bronce SAE 660'` contra plano con descripción `'BUJE BRONCE SAE 660'` → `via: 'fuzzy'`, `score >= 80`; contra una descripción sin palabras en común → `none`.
  - ISO-first: dos planos de la misma pieza, uno con `partNumber: 'ABC-123.iso'` y otro `'ABC-123'`, ambos ≥ 80 → gana el `.iso`.
  - **Empate:** dos planos de partes distintas (`'AB-100'` y `'AB-100-X'` no cuentan; usar `partId` distinto y mismo identificador) con el mismo puntaje máximo → `kind: 'ambiguous'` con ambos en `candidates`.
  - Mismo `partId` con dos revisiones activas no es empate: se queda con la `revision` mayor (comparación de cadenas) o el primero si son iguales.
  - `normalizeAliasKey('  áb-1/2  x ')` → `'AB-1/2 X'`.

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx tsx --test src/services/toolCribMatching.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar** portando las funciones puras de Vision **tal cual** (mismos umbrales 95/90/85/82/80, veto con identificadores, ISO-first) y agregando `resolveLineDrawing`. Orden de prioridad: (1) alias — candidatos `normalizeAliasKey(line.partNumber ?? '')` y `normalizeAliasKey(line.line.name)` contra `normalizeAliasKey(alias.pattern)`; si el `drawingId` del alias está en la biblioteca → `match via alias`, si no, sigue sin error; (2) identificador exacto; (3) parecido ≥ 80. Los puntajes de (2) y (3) salen de `scorePieceMatch`; si el mejor puntaje lo comparten planos de `partId` distintos → `ambiguous` (ordenados por puntaje, luego por `partNumber`); colapsar primero revisiones del mismo `partId`. Documentar con un comentario que el empate es un cambio deliberado respecto de Vision.

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npx tsx --test src/services/toolCribMatching.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/toolCribMatching.ts src/services/toolCribMatching.test.ts
git commit -m "feat(toolcrib): ligado de planos con empate ambiguo"
```

---

### Task 3: Biblioteca, alias y bitácora desde Firestore

**Files:**
- Create: `src/services/toolCribLibrary.ts` (acceso a Firestore + lógica pura de "impreso")
- Create: `src/hooks/useToolCribLibrary.ts`
- Test: `src/services/toolCribLibrary.test.ts` (solo la parte pura)
- Referencia: `SMV-VISION/src/lib/firebase/toolcrib.ts` (`listActiveToolcribParts`, `listActiveDrawingViews`, `recordToolcribPrintLog`), `.../aliases.ts` (`listPartAliases`, `savePartAlias`), `.../toolcribValidators.ts` (`validateToolcribPrintLogInput`, `normalizeToolcribPrintLog`).

**Interfaces:**
- Consumes: `db`, `auth` de `src/firebase.ts`; `DrawingView`, `PartAlias` (Task 2).
- Produces:
  - `loadLibrary(): Promise<DrawingView[]>` (solo partes `status === 'active'` y planos `isActive`, `customer === 'SUPRAJIT'`).
  - `loadAliases(): Promise<PartAlias[]>`
  - `savePartAlias(input: { pattern: string; partNumber: string; drawingId: string }): Promise<void>`
  - `interface PrintLog { id: string; drawingId: string; partId: string; copies: number; orderRef: string | null; printedByUid: string | null; printedAtUTC: string | null }`
  - `loadPrintLogs(orderRefs: string[]): Promise<PrintLog[]>` (consulta `where('orderRef','in',lote)` en lotes de 30, sin `orderBy` para no pedir índice).
  - `recordPrintLog(input: { drawingId: string; partId: string; copies: number; orderRef: string }): Promise<void>` (lanza si falla; `printedByUid` y `origin: 'toolcrib-v1-ui'` los pone la función).
  - `buildPrintedIndex(logs: PrintLog[]): Map<string, { printedAtUTC: string | null; printedByUid: string | null; count: number }>` con clave `` `${orderRef}|${partId}` ``.
  - Hook `useToolCribLibrary(orderRefs: string[])` → `{ library, aliases, printed, isLoading, error, refetchPrinted }`.

- [ ] **Step 1: Escribir las pruebas que fallan** solo de la parte pura: `buildPrintedIndex` con dos logs de la misma SO y parte (`count: 2`, `printedAtUTC` el más reciente), logs sin `orderRef` (se ignoran) y logs de otra SO (no mezclan).
- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx tsx --test src/services/toolCribLibrary.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar** `toolCribLibrary.ts`. Las funciones de Firestore usan los nombres de colección y los campos exactos de Vision (`pdfUrl`, `sourcePath`, `isActive`, `partId`, `printedAtUTC` como `Timestamp`→ISO). `recordPrintLog` escribe `{ drawingId, partId, copies, orderRef, origin: 'toolcrib-v1-ui', printedByUid: auth.currentUser.uid, printedAtUTC: serverTimestamp() }` y valida `copies` entero 1–50 y `orderRef` ≤128 antes de escribir (misma validación que Vision). `savePartAlias` usa `setDoc(..., { merge: true })` con **todos** los campos que exige la regla (`pattern, partNumber, drawingId, createdByUid, createdAtUTC, updatedAtUTC`), id estable derivado de `normalizeAliasKey(pattern)`. El hook usa React Query con `staleTime` de 5 min para biblioteca y alias, y de 30 s para la bitácora.
- [ ] **Step 4: Correr y verificar que pasan** (mismo comando). Expected: PASS. Correr también `npm run lint`.
- [ ] **Step 5: Commit**

```bash
git add src/services/toolCribLibrary.ts src/hooks/useToolCribLibrary.ts src/services/toolCribLibrary.test.ts
git commit -m "feat(toolcrib): biblioteca de planos, alias y bitácora de impresión"
```

---

### Task 4: Estampado del PDF (con copias)

**Files:**
- Create: `src/services/planoOt.ts`
- Test: `src/services/planoOt.test.ts` (helpers puros)
- Referencia a portar: `SMV-VISION/src/lib/planoOt.ts` (`PlanoOtStamp`, `wrapStampText`, `cleanFilename`, `sanitizeWinAnsi`, `stampDetailLine`, `stampPlanoOt`, `createStampedPlanoOtBatch`). **No portar** `createStampedPlanoOtSet`/`openStampedPlanoOtSet` (juegos) ni la ficha con foto isométrica/IA (`fichaPhoto`, `quantityMask`).

**Interfaces:**
- Consumes: `pdf-lib` (Task 1).
- Produces:
  - `interface PlanoOtStamp { soNumber: string; cantidad: string; fecha: string; poNumber?: string; partNumber?: string; customer?: string; piezaDescripcion?: string; mode?: 'blueprint' | 'board_ticket' | 'both' }`
  - `sanitizeWinAnsi(text?: string | null): string`, `wrapStampText(...)`, `stampDetailLine(...)`, `cleanFilename(...)` (iguales a Vision)
  - `stampPlanoOt(pdfBytes: Uint8Array, stamp: PlanoOtStamp): Promise<Uint8Array>`
  - `buildPrintPdf(items: { pdfBytes: Uint8Array; stamp: PlanoOtStamp; copies: number }[]): Promise<Uint8Array>` — un solo PDF con cada plano estampado repetido `copies` veces, en el orden recibido.
  - `openPdfForPrint(bytes: Uint8Array): void` — abre el Blob en una pestaña nueva.

- [ ] **Step 1: Escribir las pruebas que fallan** de lo puro, copiando de Vision los casos que existan para esas funciones y agregando: `sanitizeWinAnsi('Ñandú “x”')` no contiene caracteres fuera de WinAnsi y conserva `Ñ`/`ú`; `wrapStampText` parte un texto largo sin exceder el ancho medido; `stampDetailLine({ fecha: '21/11/2026', poNumber: '' })` omite el PO. Y una prueba de `buildPrintPdf` con un PDF generado en la propia prueba con `pdf-lib` (1 página): con `copies: 2` y dos ítems el resultado tiene **4 páginas**.
- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx tsx --test src/services/planoOt.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar** portando el estampado de Vision sin reescribir su geometría (posiciones de SO/CANT/FECHA/PO y ficha de pizarrón). Cambios respecto a Vision: `stampPlanoOt` recibe `Uint8Array` (no data-URL), y `buildPrintPdf` sustituye a `createStampedPlanoOtBatch` y repite cada ítem `copies` veces. Importar `pdf-lib` con `import()` dinámico.
- [ ] **Step 4: Correr y verificar que pasan** (mismo comando) y `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/services/planoOt.ts src/services/planoOt.test.ts
git commit -m "feat(toolcrib): estampado de planos con SO, PO, cantidad y copias"
```

---

### Task 5: Resolver y mostrar "impreso" en la tabla

**Files:**
- Modify: `src/components/admin/ToolCribTab.tsx` (columna "Impreso" y acciones por partida), `src/pages/AdminPanel.tsx` (solo si hace falta pasar props)
- Create: `src/services/toolCribPrint.ts` (lógica pura de estado de impresión de la partida)
- Test: `src/services/toolCribPrint.test.ts`

**Interfaces:**
- Consumes: `ToolCribLine` (Fase 1), `resolveLineDrawing`, `DrawingResolution` (Task 2), `buildPrintedIndex` y `useToolCribLibrary` (Task 3).
- Produces:
  - `type PrintState = { kind: 'printed'; at: string | null; byUid: string | null; count: number } | { kind: 'ready' } | { kind: 'no-pdf' } | { kind: 'ambiguous' } | { kind: 'none' }`
  - `printStateForLine(resolution: DrawingResolution, printed: ReturnType<typeof buildPrintedIndex>, orderRef: string): PrintState` — clave `` `${orderRef}|${view.partId}` ``; `ready`/`printed` solo si el plano tiene `pdfUrl`; `no-pdf` si no.
  - `formatPrintedLabel(state: Extract<PrintState, { kind: 'printed' }>, myUid: string | null): string` — `"Impreso 21 nov"` o `"Impreso 21 nov · tú"`; si `count > 1` agrega `" (×N)"`.

- [ ] **Step 1: Escribir las pruebas que fallan** de `printStateForLine` (impreso con el índice, sin log → `ready`, plano sin `pdfUrl` → `no-pdf`, ambigua, sin plano) y de `formatPrintedLabel` (con y sin `myUid`, con `count: 3`; fecha formateada con `date-fns` `format(d, 'd MMM', { locale: es })`).
- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx tsx --test src/services/toolCribPrint.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar** `toolCribPrint.ts` y conectar `ToolCribTab`: llamar a `useToolCribLibrary(orderRefs)` con los `order.name` de las partidas, resolver cada partida con `resolveLineDrawing` (memoizado por `[lines, library, aliases]`) y reemplazar el "—" de la columna Impreso por la etiqueta (`—` mientras carga la biblioteca, "Sin plano" / "Ambigua" / "Plano sin PDF" según `PrintState`). En móvil, mostrar la misma etiqueta bajo la descripción. Los KPIs no cambian.
- [ ] **Step 4: Correr y verificar que pasan**, luego `npm run lint` y `npm test`. Expected: todo PASS.
- [ ] **Step 5: Commit**

```bash
git add src/services/toolCribPrint.ts src/services/toolCribPrint.test.ts src/components/admin/ToolCribTab.tsx src/pages/AdminPanel.tsx
git commit -m "feat(toolcrib): columna Impreso desde la bitácora y estado del plano"
```

---

### Task 6: Diálogo de impresión

**Files:**
- Create: `src/components/admin/ToolCribPrintDialog.tsx`
- Create: `src/services/toolCribPrintRun.ts` (orquestación testeable)
- Modify: `src/components/admin/ToolCribTab.tsx` (botón "Imprimir" por partida con estado `ready`/`printed`, y "Imprimir seleccionadas" si ya existe selección; si no existe, solo por partida)
- Test: `src/services/toolCribPrintRun.test.ts`

**Interfaces:**
- Consumes: `buildPrintPdf`, `openPdfForPrint`, `PlanoOtStamp` (Task 4); `recordPrintLog` (Task 3); `DEFAULT_COPIES` (nueva constante exportada de `toolCribPrint.ts`, valor 2).
- Produces:
  - `validatePrintInput(input: { cantidad: string; copies: number }): { ok: true; cantidad: number } | { ok: false; error: string }` — `cantidad` entero ≥ 1 (rechaza vacío, 0, negativos, decimales), `copies` entero 1–5.
  - `runPrint(deps: { fetchPdf: (url: string) => Promise<Uint8Array>; stamp: typeof buildPrintPdf; open: (b: Uint8Array) => void; log: typeof recordPrintLog }, job: { items: { view: DrawingView; line: ToolCribLine; cantidad: number; stamp: PlanoOtStamp }[]; copies: number }): Promise<void>` — orden fijo: descargar todos los PDF → generar el PDF → abrirlo → **al final** un `log` por ítem. Si cualquier paso anterior lanza, no se llama a `log`.

- [ ] **Step 1: Escribir las pruebas que fallan** de `validatePrintInput` (los casos de Review Focus) y de `runPrint` con dependencias falsas: (a) camino feliz llama a `open` una vez y a `log` una vez por ítem con `orderRef === line.order.name` y `copies`; (b) si `fetchPdf` lanza, `open` y `log` no se llaman y el error se propaga; (c) si `stamp` lanza, tampoco; (d) si `log` falla para un ítem, el PDF ya se abrió y el error se propaga con el nombre de la SO.
- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx tsx --test src/services/toolCribPrintRun.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar** `toolCribPrintRun.ts` y el diálogo. El diálogo (shadcn `Dialog`, `Drawer` en móvil como el resto del Admin) precarga: SO (`line.order.name`), PO (`customer_reference`), No. de parte, plano elegido (con revisión), cantidad = `line.missing` o, si es 0, `line.line.qty`, copias = `DEFAULT_COPIES`, interruptor "Incluir ficha de pizarrón" (`mode: 'both'` vs `'blueprint'`, activo por defecto como en Vision). La fecha se genera al imprimir (`format(new Date(), 'dd/MM/yyyy')`). Si el estado es `printed`, un aviso arriba: "Ya se imprimió el {fecha}. ¿Reimprimir?" y el botón dice "Reimprimir". Errores se muestran dentro del diálogo, sin cerrarlo. Tras éxito, `refetchPrinted()` para que la fila cambie a impreso.
- [ ] **Step 4: Correr y verificar que pasan**, `npm run lint`, `npm test`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/components/admin/ToolCribPrintDialog.tsx src/services/toolCribPrintRun.ts src/services/toolCribPrintRun.test.ts src/components/admin/ToolCribTab.tsx
git commit -m "feat(toolcrib): imprimir planos estampados y registrar la impresión"
```

---

### Task 7: Elegir plano y subir plano

**Files:**
- Create: `src/components/admin/ToolCribDrawingPicker.tsx`
- Create: `src/services/toolCribUpload.ts` (subida a Storage y alta de parte/plano)
- Test: `src/services/toolCribUpload.test.ts` (validación pura)
- Modify: `src/components/admin/ToolCribTab.tsx` (acciones "Elegir plano" cuando el estado es `none` o `ambiguous`)
- Referencia: `SMV-VISION/src/lib/firebase/toolcrib.ts` (`uploadDrawingPdf`, `createPartAndDrawing`) y `toolcribValidators.ts`.

**Interfaces:**
- Consumes: `DrawingView`, `savePartAlias` (Task 3), `normalizeAliasKey` (Task 2).
- Produces:
  - `validateUpload(input: { file: { name: string; size: number; type: string }; partNumber: string; revision: string }): { ok: true } | { ok: false; error: string }` — solo `application/pdf`, ≤ 25 MB (límite de `storage.rules`), `partNumber` 1–128, `revision` 1–32.
  - `uploadDrawing(input: { file: File; partNumber: string; revision: string; description: string }): Promise<DrawingView>` — sube a `tool-crib/SUPRAJIT/{partNumber}/{revision}.pdf`, obtiene la URL de descarga y crea `toolcribParts` + `toolcribDrawings` con los campos y validadores de Vision (`customer: 'SUPRAJIT'`, `sourceType: 'storage'`, `isActive: true`, `createdByUid` = uid de la sesión).

- [ ] **Step 1: Escribir las pruebas que fallan** de `validateUpload`: PDF válido; archivo `.png`; 26 MB; `partNumber` vacío o de 129 caracteres; `revision` vacía.
- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx tsx --test src/services/toolCribUpload.test.ts`
Expected: FAIL.
- [ ] **Step 3: Implementar.** El selector (diálogo/`Drawer`) lista la biblioteca con búsqueda por texto sobre número de parte y descripción; si la partida era `ambiguous`, muestra primero sus `candidates`. Al elegir uno guarda el alias con `savePartAlias({ pattern: line.partNumber ?? line.line.name, partNumber, drawingId })` y refresca. La pestaña "Subir plano" usa `uploadDrawing` y, al terminar, guarda también el alias. Para la subida importar `firebase/storage` (`getStorage(app)`) desde `src/firebase.ts` (exportar `storage` ahí; es la única modificación de ese archivo). Mensajes de error en pantalla; nunca dejar un plano a medias: si falla el alta tras subir el PDF, informar que el archivo quedó subido y la ruta.
- [ ] **Step 4: Correr y verificar que pasan**, `npm run lint`, `npm test`. Expected: PASS.
- [ ] **Step 5: Verificar en el navegador** con una cuenta ya iniciada por Emiliano (yo no inicio sesión): partida con plano → imprimir abre un PDF con 2 copias y SO/PO/cantidad estampados; recargar muestra "Impreso hoy · tú"; partida sin plano → "Elegir plano" guarda el alias y luego imprime; consola sin errores. Revisar en la consola de Firebase que el documento de `toolcribPrintLogs` trae `orderRef`, `copies: 2` y el uid. Si no se puede, decirlo y dejarlo como pendiente de verificación.
- [ ] **Step 6: Commit**

```bash
git add src/components/admin/ToolCribDrawingPicker.tsx src/services/toolCribUpload.ts src/services/toolCribUpload.test.ts src/components/admin/ToolCribTab.tsx src/firebase.ts
git commit -m "feat(toolcrib): elegir o subir plano cuando no hay match o es ambiguo"
```

---

## Self-review

- **Cobertura del spec (Fase 2):** lectura de biblioteca (T3), ligado con alias → exacto → parecido ≥ 80 y empate ambiguo, ISO-first (T2), estampado y copias (T4), bitácora y "Impreso 21 nov · tú" (T3, T5, T6), reimpresión con aviso (T6), "Elegir plano" con alias y "Subir plano" a `tool-crib/SUPRAJIT/` (T7), sin IA (restricción global). La impresión por lote queda como "Imprimir seleccionadas" condicionada a que exista selección (ver decisión 3).
- **Decisiones mías, a revisar:** (1) sin nombre en la etiqueta: "tú" solo cuando el uid es el de la sesión; (2) `DEFAULT_COPIES = 2` fijo hasta la Fase 3; (3) sin selección múltiple nueva: se imprime por partida (la selección de la tabla de Órdenes no existe en Tool Crib); un lote se agrega si Emiliano lo pide; (4) se omiten juegos/sets, la ficha con foto y la máscara de cantidad de Vision; (5) la "ficha de pizarrón" va activada por defecto como en Vision; (6) dos revisiones activas de la misma parte no son empate.
- **Riesgos abiertos:** CORS del bucket para `fetch(pdfUrl)` (T1, paso 3, puede detener la fase); `pdf-lib` requiere aprobación; el resolver ISO/CAD depende de que `partNumber` traiga ".iso" como en Vision, sin datos reales no verificado.
- **Consistencia de tipos:** `DrawingView`, `PartAlias`, `DrawingResolution` (T2) → T3, T5, T6, T7; `PrintLog`/`buildPrintedIndex` (T3) → T5; `PlanoOtStamp`/`buildPrintPdf` (T4) → T6; `DEFAULT_COPIES` se define en T5 (`toolCribPrint.ts`) y se usa en T6.
