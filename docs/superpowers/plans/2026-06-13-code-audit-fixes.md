# Auditoría de código — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir los 12 issues de la auditoría (1 crítico, 4 altos, 5 medios, 2 bajos) identificados en `docs/superpowers/specs/2026-06-13-code-audit-design.md`.

**Architecture:** Correcciones quirúrgicas en 5 archivos existentes — sin nuevos archivos, sin nuevas dependencias. Las tareas siguen el orden de severidad (Crítico → Alto → Medio → Bajo) y cada una termina con un commit. No hay test runner; la única verificación automática disponible es `npm run lint` (tsc --noEmit).

**Tech Stack:** React 18, TypeScript, Express/Node 18+, `@google/genai`, `@tanstack/react-table`, `@tanstack/react-query`. Build: Vite.

---

### Task 1: [C1] Guard po_number vacío en TVDashboard

**Files:**
- Modify: `src/pages/TVDashboard.tsx` (~línea 319)

- [ ] **Step 1: Localizar la línea**

Abrir `src/pages/TVDashboard.tsx`. Buscar: `o.name.includes(result.po_number)`.
Está dentro del bloque `} else if (result.po_number) {` en el handler de voz.

- [ ] **Step 2: Aplicar el fix**

```tsx
// ANTES
const found = odooOrders.find(o => o.name === result.po_number || o.name.includes(result.po_number));

// DESPUÉS — result.po_number puede ser "" (falsy) además de null/undefined
const found = result.po_number
  ? odooOrders.find(o => o.name === result.po_number || o.name.includes(result.po_number))
  : undefined;
```

- [ ] **Step 3: Verificar compilación**

```bash
npm run lint
```

Resultado esperado: sin errores ni warnings.

- [ ] **Step 4: Commit**

```bash
git add src/pages/TVDashboard.tsx
git commit -m "fix(tv): guard po_number vacío para que includes('') no destaque toda la lista"
```

---

### Task 2: [A1, A2] Limpiar stream de micrófono y timer de toast al desmontar

**Files:**
- Modify: `src/pages/TVDashboard.tsx` (refs ~línea 129-130, showToast ~línea 136-139, toggleRecording ~línea 291, nuevo useEffect de cleanup)

- [ ] **Step 1: Añadir streamRef y toastTimerRef junto a los refs existentes**

Localizar el bloque de refs de voz (~línea 129-130):

```ts
const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
const audioChunksRef    = useRef<Blob[]>([]);
```

Reemplazar por:

```ts
const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
const audioChunksRef    = useRef<Blob[]>([]);
const streamRef         = useRef<MediaStream | null>(null);
const toastTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
```

- [ ] **Step 2: Actualizar showToast para cancelar el timer anterior**

Localizar `showToast` (~línea 136-139):

```ts
const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
  setToast({ message, type });
  setTimeout(() => setToast(null), 4000);
}, []);
```

Reemplazar por:

```ts
const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
  if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  setToast({ message, type });
  toastTimerRef.current = setTimeout(() => setToast(null), 4000);
}, []);
```

- [ ] **Step 3: Almacenar el stream en streamRef al iniciar la grabación**

Dentro de `toggleRecording`, localizar (~línea 291):

```ts
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
```

Añadir la siguiente línea inmediatamente debajo:

```ts
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
streamRef.current = stream;
```

- [ ] **Step 4: Añadir useEffect de cleanup al desmontar**

Localizar el último `useEffect` existente (~línea 278-280, el de `currentPageIndex >= pages.length`).
Añadir un nuevo `useEffect` inmediatamente después:

```ts
useEffect(() => {
  return () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
  };
}, []);
```

- [ ] **Step 5: Verificar compilación**

```bash
npm run lint
```

Resultado esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/pages/TVDashboard.tsx
git commit -m "fix(tv): cerrar stream de micrófono y limpiar timer de toast al desmontar"
```

---

### Task 3: [M1, M2] useMemo en pages/groupedOrders y validar voiceFilter

**Files:**
- Modify: `src/pages/TVDashboard.tsx` (groupedOrders ~línea 234, pages ~línea 241-268, voiceFilter ~línea 315-317)

- [ ] **Step 1: Añadir constante VALID_VOICE_FILTERS antes del componente**

Buscar la línea que dice `export default function TVDashboard()` y añadir justo encima:

```ts
const VALID_VOICE_FILTERS = ['all', 'overdue', 'pending', 'delivered'] as const;
type VoiceFilter = typeof VALID_VOICE_FILTERS[number];
```

- [ ] **Step 2: Convertir groupedOrders a useMemo**

Localizar (~línea 234-239):

```ts
const groupedOrders = filteredOdooOrders.reduce((acc, order) => {
  const key = order.partner_name;
  if (!acc[key]) acc[key] = [];
  acc[key].push(order);
  return acc;
}, {} as Record<string, OdooSaleOrder[]>);
```

Reemplazar por:

```ts
const groupedOrders = useMemo(() =>
  filteredOdooOrders.reduce((acc, order) => {
    const key = order.partner_name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(order);
    return acc;
  }, {} as Record<string, OdooSaleOrder[]>),
  [filteredOdooOrders]
);
```

- [ ] **Step 3: Convertir pages a useMemo**

Localizar el bloque que comienza con `const pages: { ... }[] = [];` y termina con el segundo bloque de `Object.entries(groupedOrders).forEach(...)`. Todo ese bloque (~líneas 241-268):

```ts
const pages: { company: string; orders: OdooSaleOrder[]; current: number; total: number }[] = [];

if (isTVMode) {
  Object.entries(groupedOrders).forEach(([company, companyOrders]) => {
    const totalPages = Math.ceil(companyOrders.length / ordersPerPage);
    for (let i = 0; i < totalPages; i++) {
      pages.push({
        company,
        orders: companyOrders.slice(i * ordersPerPage, (i + 1) * ordersPerPage),
        current: i + 1,
        total: totalPages,
      });
    }
  });
} else {
  Object.entries(groupedOrders).forEach(([company, companyOrders]) => {
    pages.push({
      company,
      orders: companyOrders,
      current: 1,
      total: 1,
    });
  });
}
```

Reemplazar por:

```ts
const pages = useMemo(() => {
  const result: { company: string; orders: OdooSaleOrder[]; current: number; total: number }[] = [];
  if (isTVMode) {
    Object.entries(groupedOrders).forEach(([company, companyOrders]) => {
      const totalPages = Math.ceil(companyOrders.length / ordersPerPage);
      for (let i = 0; i < totalPages; i++) {
        result.push({
          company,
          orders: companyOrders.slice(i * ordersPerPage, (i + 1) * ordersPerPage),
          current: i + 1,
          total: totalPages,
        });
      }
    });
  } else {
    Object.entries(groupedOrders).forEach(([company, companyOrders]) => {
      result.push({
        company,
        orders: companyOrders,
        current: 1,
        total: 1,
      });
    });
  }
  return result;
}, [groupedOrders, ordersPerPage, isTVMode]);
```

- [ ] **Step 4: Validar voiceFilter antes de asignar**

Localizar (~línea 315-317):

```ts
if (result.action === 'filter' && result.filter_type) {
  setVoiceFilter(result.filter_type as any);
  setCurrentPageIndex(0);
```

Reemplazar por:

```ts
if (result.action === 'filter' && result.filter_type) {
  const ft = result.filter_type as string;
  if ((VALID_VOICE_FILTERS as readonly string[]).includes(ft)) {
    setVoiceFilter(ft as VoiceFilter);
  }
  setCurrentPageIndex(0);
```

- [ ] **Step 5: Verificar compilación**

```bash
npm run lint
```

Resultado esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/pages/TVDashboard.tsx
git commit -m "perf(tv): memoizar pages/groupedOrders; fix: validar voiceFilter antes de asignar"
```

---

### Task 4: [A3, B1] Race condition de reautenticación y CORS en server.ts

**Files:**
- Modify: `server.ts` (CORS ~línea 34-36, sessionPromise ~línea 100, odooCall ~línea 222-237)

- [ ] **Step 1: Acotar el header CORS a requests con Origin**

Localizar (~línea 34-36):

```ts
const origin = req.headers.origin || '';
if (allowedOrigins.includes(origin) || !origin) {
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
}
```

Reemplazar las tres líneas por:

```ts
const origin = req.headers.origin || '';
if (origin && allowedOrigins.includes(origin)) {
  res.setHeader('Access-Control-Allow-Origin', origin);
}
```

- [ ] **Step 2: Declarar variable de reautenticación en curso**

Localizar (~línea 100):

```ts
let sessionPromise: Promise<OdooSession> | null = null;
```

Añadir la variable `reauthing` justo debajo:

```ts
let sessionPromise: Promise<OdooSession> | null = null;
let reauthing: Promise<OdooSession> | null = null;
```

- [ ] **Step 3: Usar reauthing en odooCall para evitar autenticaciones concurrentes**

Localizar la función `odooCall` (~línea 222-237):

```ts
async function odooCall<T = unknown>(
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {}
): Promise<T> {
  try {
    return await odooRpc<T>(await getSession(), model, method, args, kwargs);
  } catch (err) {
    if (err instanceof OdooSessionExpiredError) {
      console.warn('[Odoo] Sesión expirada — reautenticando…');
      return await odooRpc<T>(await getSession(true), model, method, args, kwargs);
    }
    throw err;
  }
}
```

Reemplazar por:

```ts
async function odooCall<T = unknown>(
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {}
): Promise<T> {
  try {
    return await odooRpc<T>(await getSession(), model, method, args, kwargs);
  } catch (err) {
    if (err instanceof OdooSessionExpiredError) {
      console.warn('[Odoo] Sesión expirada — reautenticando…');
      if (!reauthing) {
        reauthing = getSession(true).finally(() => { reauthing = null; });
      }
      return await odooRpc<T>(await reauthing, model, method, args, kwargs);
    }
    throw err;
  }
}
```

- [ ] **Step 4: Verificar compilación**

```bash
npm run lint
```

Resultado esperado: sin errores.

- [ ] **Step 5: Commit**

```bash
git add server.ts
git commit -m "fix(proxy): evitar reautenticaciones concurrentes; fix: acotar CORS a requests con Origin"
```

---

### Task 5: [A4, M5] JSON.parse guards y campo required en ai.ts

**Files:**
- Modify: `src/services/ai.ts` (predictOrderRisk ~línea 77-81, filterOrdersByNaturalLanguage ~línea 96, processVoiceCommand schema ~línea 128 y return ~línea 140)

- [ ] **Step 1: Añadir try/catch en predictOrderRisk**

`RiskPrediction` tiene los campos: `risk_level: 'low'|'medium'|'high'`, `issue: string`, `suggestion: string`, `analyzedAt: Date`.

Localizar (~línea 77-81):

```ts
const result = JSON.parse(response.text || '{}');
return {
  ...result,
  analyzedAt: new Date(result.analyzedAt || Date.now())
};
```

Reemplazar por:

```ts
// JSON.parse retorna any; el try/catch protege contra respuesta truncada o malformada
let result: any = {};
try {
  result = JSON.parse(response.text || '{}');
} catch {
  /* malformed JSON — los campos de RiskPrediction quedarán undefined */
}
return {
  ...result,
  analyzedAt: new Date(result.analyzedAt || Date.now())
};
```

- [ ] **Step 2: Añadir try/catch en filterOrdersByNaturalLanguage**

Localizar (~línea 96):

```ts
return JSON.parse(response.text || '[]');
```

Reemplazar por:

```ts
try {
  return JSON.parse(response.text || '[]') as number[];
} catch {
  return [];
}
```

- [ ] **Step 3: Añadir required al schema de processVoiceCommand**

Localizar el bloque `config` de `processVoiceCommand` (~línea 127-138). El `responseSchema` actual NO tiene `required`:

```ts
responseSchema: {
  type: Type.OBJECT,
  properties: {
    po_number: { type: Type.STRING, description: "The PO number to highlight or complete, if applicable" },
    action: { type: Type.STRING, description: "The action: 'highlight', 'complete', 'filter', or 'answer'" },
    filter_type: { type: Type.STRING, description: "If action is filter: 'all', 'overdue', 'delivered', 'pending'" },
    message: { type: Type.STRING, description: "Conversational response in Spanish to speak to the user" }
  }
}
```

Añadir `required` después de `type: Type.OBJECT,`:

```ts
responseSchema: {
  type: Type.OBJECT,
  required: ['action', 'message'],
  properties: {
    po_number: { type: Type.STRING, description: "The PO number to highlight or complete, if applicable" },
    action: { type: Type.STRING, description: "The action: 'highlight', 'complete', 'filter', or 'answer'" },
    filter_type: { type: Type.STRING, description: "If action is filter: 'all', 'overdue', 'delivered', 'pending'" },
    message: { type: Type.STRING, description: "Conversational response in Spanish to speak to the user" }
  }
}
```

- [ ] **Step 4: Añadir try/catch en el return de processVoiceCommand**

Localizar (~línea 140):

```ts
return JSON.parse(response.text || '{"po_number": null, "action": "answer", "message": "No pude entender el comando."}');
```

Reemplazar por:

```ts
try {
  return JSON.parse(response.text || '{}');
} catch {
  return { po_number: null, action: 'answer', message: 'No pude entender el comando.' };
}
```

- [ ] **Step 5: Verificar compilación**

```bash
npm run lint
```

Resultado esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/services/ai.ts
git commit -m "fix(ai): JSON.parse guards en respuestas Gemini; fix: required en schema de voz"
```

---

### Task 6: [M3, M4] Error banner y reset de AI search en AdminPanel

**Files:**
- Modify: `src/pages/AdminPanel.tsx` (handleNLSearch ~línea 63-75, error banner ~línea 168)

- [ ] **Step 1: Limpiar aiFilterIds al iniciar handleNLSearch**

Localizar (~línea 63-67):

```ts
const handleNLSearch = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!nlQuery.trim()) return;
  setIsSearchingAI(true);
```

Añadir `setAiFilterIds(null)` después de la guarda de campo vacío:

```ts
const handleNLSearch = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!nlQuery.trim()) return;
  setAiFilterIds(null);
  setIsSearchingAI(true);
```

- [ ] **Step 2: Ocultar error banner durante isLoading**

Localizar (~línea 168):

```tsx
{error && (
  <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-2xl p-4">
    <WifiOff className="w-5 h-5 shrink-0" />
    <span className="font-bold">SIN CONEXIÓN A ODOO — {error}</span>
  </div>
)}
```

Reemplazar la condición por `error && !isLoading`:

```tsx
{error && !isLoading && (
  <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-2xl p-4">
    <WifiOff className="w-5 h-5 shrink-0" />
    <span className="font-bold">SIN CONEXIÓN A ODOO — {error}</span>
  </div>
)}
```

- [ ] **Step 3: Verificar compilación**

```bash
npm run lint
```

Resultado esperado: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/pages/AdminPanel.tsx
git commit -m "fix(admin): limpiar filtro IA al iniciar nueva búsqueda; ocultar error durante carga"
```

---

### Task 7: [B2] Keys estables en listas de OrdersTable

**Files:**
- Modify: `src/components/admin/OrdersTable.tsx` (~línea 282, ~línea 302)

- [ ] **Step 1: Key estable en filas de líneas de producto**

Localizar (~línea 281-283):

```tsx
{order.lines.map((line, i) => (
  <tr key={i} className="text-zinc-300">
```

Reemplazar por:

```tsx
{order.lines.map((line, i) => (
  <tr key={`${line.name}-${i}`} className="text-zinc-300">
```

(Se incluye `i` porque dos líneas pueden tener el mismo nombre de producto.)

- [ ] **Step 2: Key estable en tarjetas de remisiones**

Localizar (~línea 301-303):

```tsx
{order.deliveries.map((d, i) => (
  <div key={i} className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2 py-1">
```

Reemplazar por:

```tsx
{order.deliveries.map((d, i) => (
  <div key={`${d.name}-${i}`} className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2 py-1">
```

- [ ] **Step 3: Verificar compilación**

```bash
npm run lint
```

Resultado esperado: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/OrdersTable.tsx
git commit -m "fix(admin): keys estables en listas de líneas de producto y remisiones"
```

---

## Self-review

**Cobertura del spec:**
| Issue | Task |
|-------|------|
| C1 — po_number vacío | Task 1 ✓ |
| A1 — stream no cierra | Task 2 ✓ |
| A2 — timer toast sin cleanup | Task 2 ✓ |
| A3 — race condition reauth | Task 4 ✓ |
| A4 — JSON.parse sin guard | Task 5 ✓ |
| M1 — useMemo pages/groupedOrders | Task 3 ✓ |
| M2 — voiceFilter sin validar | Task 3 ✓ |
| M3 — error banner durante isLoading | Task 6 ✓ |
| M4 — AI search no limpia filtro | Task 6 ✓ |
| M5 — required en schema voz | Task 5 ✓ |
| B1 — CORS permite * sin Origin | Task 4 ✓ |
| B2 — key={i} en listas | Task 7 ✓ |

**Placeholders:** ninguno — todos los pasos tienen el código exacto.

**Consistencia de tipos:**
- `streamRef`: `useRef<MediaStream | null>(null)` — compatible con `stream` devuelto por `getUserMedia`.
- `toastTimerRef`: `useRef<ReturnType<typeof setTimeout> | null>(null)` — compatible con el retorno de `setTimeout` en entorno browser.
- `reauthing`: `Promise<OdooSession> | null` — mismo tipo que `sessionPromise`.
- `VALID_VOICE_FILTERS` / `VoiceFilter`: coinciden con el tipo declarado en el estado `voiceFilter`.
- `result: any` en `predictOrderRisk`: consistente con el `any` implícito que devuelve `JSON.parse`.
