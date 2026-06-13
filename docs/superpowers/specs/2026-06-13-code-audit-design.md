# Auditoría de código — Visual Factory TV Dashboard

**Fecha:** 2026-06-13  
**Rama:** master  
**Último commit auditado:** 03f804e  
**TypeScript:** compila sin errores (`npm run lint` limpio)

---

## Resumen

Auditoría completa del codebase para detectar bugs de runtime, fugas de recursos,
condiciones de carrera, problemas de performance y riesgos de seguridad.
Se encontraron 12 issues distribuidos en 4 niveles de severidad.

---

## Issues por severidad

### Crítico (1)

#### C1 — `po_number` vacío destaca la primera orden de la lista

**Archivo:** `src/pages/TVDashboard.tsx:319`

**Causa:** Cuando Gemini no identifica una orden específica puede devolver
`po_number: ""` (string vacío) en lugar de `null`. La condición actual usa
`o.name.includes(result.po_number)`, y `String.includes("")` siempre es `true`,
por lo que la búsqueda siempre "encuentra" la primera orden de la lista.

**Impacto:** El operador de fábrica ve una orden destacada incorrectamente cada vez
que el asistente de voz no puede identificar la orden pedida.

**Fix:**
```ts
// Antes
const found = odooOrders.find(
  o => o.name === result.po_number || o.name.includes(result.po_number)
);

// Después
const found = result.po_number
  ? odooOrders.find(o => o.name === result.po_number || o.name.includes(result.po_number))
  : undefined;
```

---

### Alto (4)

#### A1 — Stream de micrófono no se cierra al desmontar el componente

**Archivo:** `src/pages/TVDashboard.tsx:285-348`

**Causa:** `stream.getTracks().forEach(t => t.stop())` se llama dentro de
`mediaRecorder.onstop`, que solo ejecuta al detener la grabación normalmente.
Si el usuario navega a `/admin` mientras graba, el componente desmonta sin
haber parado el MediaRecorder ni las pistas de audio.

**Impacto:** El indicador de micrófono activo permanece encendido en el sistema
operativo y la pista de audio queda abierta indefinidamente.

**Fix:** Almacenar la referencia al `stream` en un `useRef` y cerrar en cleanup:
```ts
const streamRef = useRef<MediaStream | null>(null);

// Al iniciar grabación:
streamRef.current = stream;

// useEffect de cleanup:
useEffect(() => {
  return () => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
  };
}, []);
```

#### A2 — `setTimeout` de toast sin limpieza al desmontar

**Archivo:** `src/pages/TVDashboard.tsx:136-139`

**Causa:** `showToast` usa `setTimeout(() => setToast(null), 4000)` sin conservar
el timer ID para cancelarlo. Si el componente desmonta durante esos 4 s,
`setToast(null)` actualiza estado en un componente desmontado.

**Impacto:** Warning de React en consola; potencialmente state update de component
desmontado en entornos sin React 18 concurrent mode.

**Fix:**
```ts
const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const showToast = useCallback((message: string, type = 'info') => {
  if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  setToast({ message, type });
  toastTimerRef.current = setTimeout(() => setToast(null), 4000);
}, []);

useEffect(() => () => {
  if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
}, []);
```

#### A3 — Race condition de reautenticación en Odoo proxy

**Archivo:** `server.ts:231-236`

**Causa:** Dos peticiones concurrentes que reciben `OdooSessionExpiredError`
llaman ambas a `getSession(true)`. Esto lanza dos `authenticate()` en paralelo;
la segunda sobrescribe `sessionPromise` antes de que la primera complete,
generando dos sesiones simultáneas en Odoo (ninguna liberada automáticamente).

**Impacto:** Bajo carga concurrente (polling de TV + Admin simultáneo después de
un periodo de inactividad largo) el servidor Odoo acumula sesiones huérfanas.
Con credenciales correctas el resultado final suele ser correcto, pero duplica
el costo de autenticación y puede causar fallos intermitentes si Odoo limita
sesiones por usuario.

**Fix:** Usar un único flag de reautenticación en curso:
```ts
let reauthing: Promise<OdooSession> | null = null;

async function odooCall<T>(model, method, args, kwargs): Promise<T> {
  try {
    return await odooRpc<T>(await getSession(), model, method, args, kwargs);
  } catch (err) {
    if (err instanceof OdooSessionExpiredError) {
      if (!reauthing) {
        reauthing = getSession(true).finally(() => { reauthing = null; });
      }
      return await odooRpc<T>(await reauthing, model, method, args, kwargs);
    }
    throw err;
  }
}
```

#### A4 — `JSON.parse` sin guard en funciones AI

**Archivos:** `src/services/ai.ts:77, 96, 140`

**Causa:** Las tres funciones que esperan JSON estructurado de Gemini
(`predictOrderRisk`, `filterOrdersByNaturalLanguage`, `processVoiceCommand`)
usan `JSON.parse(response.text || '<default>')` sin try/catch local.
Si el modelo devuelve JSON malformado (respuesta truncada, tokens agotados,
prefijo de markdown accidental), la excepción se propaga al caller.

**Impacto:** Los callers tienen try/catch que muestran "Verifica tu clave API
de Gemini" — mensaje incorrecto para un error de parsing. Dificulta el debug.

**Fix:** Envolver en try/catch en la propia función de servicio:
```ts
// predictOrderRisk (y análogo en las otras dos)
let result: Record<string, unknown> = {};
try {
  result = JSON.parse(response.text || '{}');
} catch {
  // structured output de Gemini falló — devolver predicción vacía
  result = {};
}
```

---

### Medio (5)

#### M1 — `pages` y `groupedOrders` sin `useMemo`

**Archivo:** `src/pages/TVDashboard.tsx:234-268`

**Causa:** Ambos cómputos se ejecutan en el cuerpo del componente sin
memoización. El reloj actualiza `currentTime` cada segundo, provocando un
render cada segundo que recalcula innecesariamente todos los grupos y páginas.

**Fix:** Envolver en `useMemo`:
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

const pages = useMemo(() => {
  // ... lógica actual de construcción de páginas ...
}, [groupedOrders, ordersPerPage, isTVMode]);
```

#### M2 — `voiceFilter` se asigna sin validar el valor del modelo

**Archivo:** `src/pages/TVDashboard.tsx:316`

**Causa:** `setVoiceFilter(result.filter_type as any)` acepta cualquier string
que devuelva Gemini. Si el modelo devuelve `"Overdue"` (mayúscula) o
`"todos"` en lugar de `"all"`, el filtro queda en un estado desconocido
y ninguna rama del `useMemo` lo maneja.

**Fix:**
```ts
const VALID_FILTERS = ['all', 'overdue', 'pending', 'delivered'] as const;
const ft = result.filter_type;
if (VALID_FILTERS.includes(ft as typeof VALID_FILTERS[number])) {
  setVoiceFilter(ft as typeof VALID_FILTERS[number]);
}
```

#### M3 — Error banner visible durante `isLoading` en AdminPanel

**Archivo:** `src/pages/AdminPanel.tsx:168-173`

**Causa:** El error banner y el spinner de carga se evalúan de forma
independiente. Un error del fetch anterior permanece en el estado de React Query
(`data?.ordersRes.error`) mientras el siguiente fetch está en curso (`isLoading`).

**Fix:**
```tsx
{error && !isLoading && (
  <div className="flex items-center gap-3 ...">
```

#### M4 — AI search no limpia el filtro previo al iniciar

**Archivo:** `src/pages/AdminPanel.tsx:63-75`

**Causa:** `handleNLSearch` no llama a `setAiFilterIds(null)` al inicio,
por lo que la tabla muestra los resultados de la búsqueda anterior durante
el tiempo de respuesta del modelo.

**Fix:** Añadir `setAiFilterIds(null)` como primera instrucción de
`handleNLSearch`, tras la guarda del campo vacío.

#### M5 — Schema de `processVoiceCommand` sin campo `required`

**Archivo:** `src/services/ai.ts:128-138`

**Causa:** A diferencia de `predictOrderRisk`, el schema de `processVoiceCommand`
no define `required`. El modelo puede omitir `action` o `message`, haciendo que
el handler en `TVDashboard` evalúe `result.action === 'filter'` como `false`
cuando el campo es `undefined`.

**Fix:**
```ts
config: {
  responseMimeType: "application/json",
  responseSchema: {
    type: Type.OBJECT,
    required: ['action', 'message'],
    properties: { ... }
  }
}
```

---

### Bajo (2)

#### B1 — CORS responde `Access-Control-Allow-Origin: *` a requests sin `Origin`

**Archivo:** `server.ts:35-36`

**Causa:** La condición `!origin` envía `Access-Control-Allow-Origin: *` a
requests de curl o servidor-a-servidor. Esto no es explotable (la auth middleware
protege todos los endpoints), pero es más permisivo de lo necesario.

**Fix:** Omitir el header CORS cuando no hay `origin`:
```ts
if (origin && allowedOrigins.includes(origin)) {
  res.setHeader('Access-Control-Allow-Origin', origin);
}
```

#### B2 — `key={i}` en listas de líneas y remisiones

**Archivo:** `src/components/admin/OrdersTable.tsx:282, 302`

**Causa:** Se usa el índice del array como `key` en listas read-only.
No es incorrecto en datos estáticos, pero genera advertencias de React
si el contenido alguna vez se reordena.

**Fix:**
```tsx
// Líneas de producto
{order.lines.map((line, i) => <tr key={`${line.name}-${i}`} ...>)}

// Remisiones
{order.deliveries.map((d, i) => <div key={`${d.name}-${i}`} ...>)}
```

---

## Alcance del plan de implementación

Todos los issues listados se corregirán en una única sesión de trabajo
ordenada por severidad: Crítico → Alto → Medio → Bajo.

**Archivos modificados:**
- `src/pages/TVDashboard.tsx` (C1, A1, A2, M1, M2)
- `server.ts` (A3, B1)
- `src/services/ai.ts` (A4, M5)
- `src/pages/AdminPanel.tsx` (M3, M4)
- `src/components/admin/OrdersTable.tsx` (B2)

**Sin cambios en:** tipos, Firestore rules, vite.config, firebase.ts, hooks,
páginas de Login/Stats, componentes de UI no mencionados.
