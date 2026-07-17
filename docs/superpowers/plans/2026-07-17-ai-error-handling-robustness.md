# AI Error Handling & Robustness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Gemini AI layer real error classification, request timeouts, and bounded retries so failures surface a specific, correct message instead of a hung spinner or a hardcoded "verifica tu clave API".

**Architecture:** A new `AIError` class + classifier lives in `src/services/ai.ts` and wraps every client→proxy call with an `AbortController` timeout and a small retry-with-backoff helper. The shared `shared/geminiProxy.ts` module (consumed by both `server.ts` and `functions/src/index.ts`) gets the matching server-side timeout and correct HTTP status passthrough. Four UI call sites swap their hardcoded error strings for `AIError.userMessage`.

**Tech Stack:** TypeScript, native `fetch` + `AbortController`, no new npm dependencies.

## Global Constraints

- No test runner exists in this repo. `npm run lint` (`tsc --noEmit`) is the only automated gate — run it after every task instead of a test suite.
- `functions/` has its own tsconfig (`target: es2021`, `strict: true`, `noUnusedLocals: true`) and is a **separate** TypeScript project from the root — anything added to `shared/geminiProxy.ts` must compile under both. Run `cd functions && npm run build` after touching that file.
- No new npm dependencies. Timeout/retry are hand-rolled with native `AbortController`/`setTimeout`.
- All user-facing strings are Spanish (matches the rest of the app).
- Do not touch: AI prompt content, model selection (`gemini-3.5-flash` / `gemini-2.5-flash-preview-tts`), the PCM/TTS audio decode pipeline in `TVDashboard.tsx`, or voice/filter business logic beyond adding a timeout value.
- `shared/geminiProxy.ts` must stay decoupled from any specific `@google/genai` SDK version — root uses `^1.45.0`, `functions/` uses `^2.10.0`. Classify SDK errors by duck-typing a numeric `.status` property, never by importing an SDK error class.

---

### Task 1: `AIError` type + timeout + retry in `src/services/ai.ts`

**Files:**
- Modify: `src/services/ai.ts:74-95` (the `PROXY_BASE` / `getAuthHeaders` / `generateContent` block)

**Interfaces:**
- Produces: `export class AIError extends Error { kind: AIErrorKind; userMessage: string }`, `export type AIErrorKind = 'network' | 'timeout' | 'auth' | 'rate_limit' | 'invalid_response' | 'server' | 'unknown'`, and `generateContent(params: GeminiRequest, timeoutMs = 30000): Promise<GeminiProxyResponse>` (now throws `AIError` instead of a plain `Error`). Every later task in this plan consumes `AIError`.

- [ ] **Step 1: Replace the `generateContent` block with the classified, timed-out, retried version**

In `src/services/ai.ts`, find this exact block:

```ts
const PROXY_BASE = import.meta.env.VITE_ODOO_PROXY_URL || '';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getIdTokenOrThrow();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function generateContent(params: GeminiRequest): Promise<GeminiProxyResponse> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${PROXY_BASE}/api/ai/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(errorBody?.error || `AI Request failed: ${response.statusText}`);
  }
  return await response.json() as GeminiProxyResponse;
}
```

Replace it with:

```ts
export type AIErrorKind = 'network' | 'timeout' | 'auth' | 'rate_limit' | 'invalid_response' | 'server' | 'unknown';

const AI_ERROR_MESSAGES: Record<AIErrorKind, string> = {
  network: 'No se pudo conectar con el servidor. Verifica tu conexión a internet.',
  timeout: 'La IA tardó demasiado en responder. Intenta de nuevo.',
  auth: 'Sesión expirada o clave API inválida — vuelve a iniciar sesión.',
  rate_limit: 'Gemini está saturado, intenta de nuevo en un momento.',
  invalid_response: 'La IA devolvió una respuesta que no se pudo interpretar.',
  server: 'El servidor de IA tuvo un problema. Intenta de nuevo en un momento.',
  unknown: 'Ocurrió un error inesperado al contactar la IA.',
};

export class AIError extends Error {
  readonly kind: AIErrorKind;
  readonly userMessage: string;

  constructor(kind: AIErrorKind, message?: string, cause?: unknown) {
    super(message || AI_ERROR_MESSAGES[kind], cause !== undefined ? { cause } : undefined);
    this.name = 'AIError';
    this.kind = kind;
    this.userMessage = AI_ERROR_MESSAGES[kind];
  }
}

const RETRYABLE_KINDS: ReadonlySet<AIErrorKind> = new Set(['network', 'timeout', 'rate_limit', 'server']);

function classifyHttpStatus(status: number): AIErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  return 'unknown';
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Reintenta solo fallos transitorios (red/timeout/rate-limit/servidor); nunca auth. */
async function withRetry<T>(fn: () => Promise<T>, retries = 2, baseDelayMs = 300): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const kind = err instanceof AIError ? err.kind : 'unknown';
      if (attempt === retries || !RETRYABLE_KINDS.has(kind)) throw err;
      await sleep(baseDelayMs * Math.pow(3, attempt));
    }
  }
}

const PROXY_BASE = import.meta.env.VITE_ODOO_PROXY_URL || '';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getIdTokenOrThrow();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function fetchOnce(params: GeminiRequest, timeoutMs: number): Promise<GeminiProxyResponse> {
  const headers = await getAuthHeaders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${PROXY_BASE}/api/ai/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) throw new AIError('timeout', undefined, err);
    throw new AIError('network', undefined, err);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { error?: string } | null;
    throw new AIError(classifyHttpStatus(response.status), errorBody?.error);
  }
  return await response.json() as GeminiProxyResponse;
}

async function generateContent(params: GeminiRequest, timeoutMs = 30000): Promise<GeminiProxyResponse> {
  return withRetry(() => fetchOnce(params, timeoutMs));
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: no output, exit code 0 (this is `tsc --noEmit` — silence means success).

- [ ] **Step 3: Commit**

```bash
git add src/services/ai.ts
git commit -m "feat(ai): add AIError classification, timeout, and bounded retry to generateContent"
```

---

### Task 2: Fix silent/generic parse-failure throws to use `AIError`

**Files:**
- Modify: `src/services/ai.ts` (`predictOrderRisk` and `filterOrdersByNaturalLanguage`)

**Interfaces:**
- Consumes: `AIError` from Task 1.
- Produces: `predictOrderRisk` and `filterOrdersByNaturalLanguage` now throw `AIError('invalid_response')` on a JSON parse failure instead of a plain `Error` (predictOrderRisk) or silently returning `[]` (filterOrdersByNaturalLanguage).

- [ ] **Step 1: Fix `predictOrderRisk`'s parse-failure throw**

Find:

```ts
  let result: RiskPredictionRaw;
  try {
    result = JSON.parse(response.text || '{}') as RiskPredictionRaw;
  } catch {
    throw new Error('La IA devolvió una respuesta no válida');
  }
```

Replace with:

```ts
  let result: RiskPredictionRaw;
  try {
    result = JSON.parse(response.text || '{}') as RiskPredictionRaw;
  } catch {
    throw new AIError('invalid_response');
  }
```

- [ ] **Step 2: Fix `filterOrdersByNaturalLanguage`'s silent swallow**

Find:

```ts
  try {
    return JSON.parse(response.text || '[]') as number[];
  } catch {
    return [];
  }
```

Replace with:

```ts
  try {
    return JSON.parse(response.text || '[]') as number[];
  } catch {
    throw new AIError('invalid_response');
  }
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run lint`
Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add src/services/ai.ts
git commit -m "fix(ai): surface AI parse failures instead of a generic/silent fallback"
```

---

### Task 3: Faster timeout for the live voice-command pipeline

**Files:**
- Modify: `src/services/ai.ts` (`executeVoiceCommand`)

**Interfaces:**
- Consumes: `generateContent(params, timeoutMs)` from Task 1.
- Produces: no new symbols — the voice command path now fails after 15s instead of the default 30s, since an operator standing at the TV needs a faster failure than a background admin report.

- [ ] **Step 1: Pass a 15s timeout to the voice command's `generateContent` call**

Inside `executeVoiceCommand`, find the closing of its `generateContent` call:

```ts
          filter_client: { type: Type.STRING, description: "If filtering by client/customer: the client name, otherwise null" },
          message: { type: Type.STRING, description: "Conversational response in Spanish to speak to the user" }
        }
      }
    }
  });
```

Replace the final two lines with:

```ts
          filter_client: { type: Type.STRING, description: "If filtering by client/customer: the client name, otherwise null" },
          message: { type: Type.STRING, description: "Conversational response in Spanish to speak to the user" }
        }
      }
    }
  }, 15000);
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/services/ai.ts
git commit -m "fix(ai): voice command times out at 15s instead of the default 30s"
```

---

### Task 4: Server-side timeout + correct status passthrough in `shared/geminiProxy.ts`

**Files:**
- Modify: `shared/geminiProxy.ts:34-51` (the `runGeminiGenerate` function)

**Interfaces:**
- Produces: `runGeminiGenerate(generate, body, timeoutMs = 30000)` — same return shape (`GeminiGenerateResult`) as before, so **no changes needed** in `server.ts` or `functions/src/index.ts`. On a hung upstream call it now resolves `{ ok: false, status: 504, ... }` instead of hanging the Express request forever; on a Gemini SDK error carrying a numeric `.status` (401/429/5xx), that status now passes through instead of always collapsing to whatever the outer try/catch in each server file defaults to.

- [ ] **Step 1: Add the timeout wrapper and status-aware error handling**

Find this exact block (the end of the file):

```ts
export async function runGeminiGenerate(
  generate: GeminiGenerateFn,
  body: GeminiGenerateBody,
): Promise<GeminiGenerateResult> {
  const validated = validateGeminiGenerateBody(body);
  if (validated.ok === false) {
    return { ok: false, status: validated.status, error: validated.error };
  }
  const response = await generate(validated.model, validated.contents, validated.config);
  return {
    ok: true,
    payload: {
      text: response.text,
      candidates: response.candidates,
    },
  };
}
```

Replace with:

```ts
class GeminiTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new GeminiTimeoutError(`Gemini no respondió en ${ms}ms`)), ms);
    promise
      .then(value => { clearTimeout(timer); resolve(value); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}

/** Duck-types the SDK's ApiError shape without importing @google/genai — root and
 * functions/ pin different major versions of that package. */
function hasNumericStatus(err: unknown): err is { status: number } {
  return typeof err === 'object' && err !== null && typeof (err as { status?: unknown }).status === 'number';
}

export async function runGeminiGenerate(
  generate: GeminiGenerateFn,
  body: GeminiGenerateBody,
  timeoutMs = 30000,
): Promise<GeminiGenerateResult> {
  const validated = validateGeminiGenerateBody(body);
  if (validated.ok === false) {
    return { ok: false, status: validated.status, error: validated.error };
  }

  try {
    const response = await withTimeout(
      generate(validated.model, validated.contents, validated.config),
      timeoutMs,
    );
    return {
      ok: true,
      payload: {
        text: response.text,
        candidates: response.candidates,
      },
    };
  } catch (err) {
    if (err instanceof GeminiTimeoutError) {
      return { ok: false, status: 504, error: err.message };
    }
    const status = hasNumericStatus(err) ? err.status : 500;
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, status, error };
  }
}
```

- [ ] **Step 2: Verify it compiles in the root project**

Run: `npm run lint`
Expected: no output, exit code 0.

- [ ] **Step 3: Verify it compiles in the `functions/` project**

Run: `cd functions && npm run build`
Expected: `tsc` exits 0 with no errors (this is the separate, stricter `es2021`/`strict` tsconfig that also includes `shared/`).

- [ ] **Step 4: Commit**

```bash
git add shared/geminiProxy.ts
git commit -m "fix(ai): server-side timeout and real HTTP status passthrough for Gemini calls"
```

---

### Task 5: UI call sites show the classified error message

**Files:**
- Modify: `src/pages/AdminPanel.tsx:1-128` (imports + `handleNLSearch`, `handleClientReport`, `handleAnomalies`, `handlePredictRisk`)
- Modify: `src/pages/StatsDashboard.tsx:1-35` (imports + `handleGenerateSummary`)
- Modify: `src/pages/TVDashboard.tsx:1-20,607-613` (imports + the voice command catch block)

**Interfaces:**
- Consumes: `AIError` (with `.userMessage`) from Task 1.

- [ ] **Step 1: `AdminPanel.tsx` — import `AIError`**

Find:

```ts
import {
  filterOrdersByNaturalLanguage, generateClientReport,
  analyzeOrderAnomalies, predictOrderRisk,
} from '../services/ai';
```

Replace with:

```ts
import {
  filterOrdersByNaturalLanguage, generateClientReport,
  analyzeOrderAnomalies, predictOrderRisk, AIError,
} from '../services/ai';
```

- [ ] **Step 2: `AdminPanel.tsx` — use `err.userMessage` in all four AI handlers**

Find:

```ts
  const handleNLSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlQuery.trim()) return;
    setAiFilterIds(null);
    setIsSearchingAI(true);
    try {
      const ids = await filterOrdersByNaturalLanguage(nlQuery, orders);
      setAiFilterIds(ids);
    } catch (err) {
      console.error('Error en búsqueda IA', err);
      setAiModal({ title: 'Error', content: 'No se pudo procesar la búsqueda. Verifica tu clave API de Gemini.' });
    }
    setIsSearchingAI(false);
  };
```

Replace with:

```ts
  const handleNLSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlQuery.trim()) return;
    setAiFilterIds(null);
    setIsSearchingAI(true);
    try {
      const ids = await filterOrdersByNaturalLanguage(nlQuery, orders);
      setAiFilterIds(ids);
    } catch (err) {
      console.error('Error en búsqueda IA', err);
      const msg = err instanceof AIError ? err.userMessage : 'Ocurrió un error inesperado al buscar.';
      setAiModal({ title: 'Error', content: msg });
    }
    setIsSearchingAI(false);
  };
```

Find:

```ts
  const handleClientReport = async (order: OdooSaleOrder) => {
    setAiModal({ title: `Reporte para ${order.partner_name} — ${order.name}`, content: null });
    try {
      const text = await generateClientReport(order);
      setAiModal({ title: `Reporte para ${order.partner_name} — ${order.name}`, content: text || 'Sin respuesta del modelo.' });
    } catch (err) {
      console.error(err);
      setAiModal({ title: 'Error', content: 'No se pudo generar el reporte. Verifica tu clave API de Gemini.' });
    }
  };
```

Replace with:

```ts
  const handleClientReport = async (order: OdooSaleOrder) => {
    setAiModal({ title: `Reporte para ${order.partner_name} — ${order.name}`, content: null });
    try {
      const text = await generateClientReport(order);
      setAiModal({ title: `Reporte para ${order.partner_name} — ${order.name}`, content: text || 'Sin respuesta del modelo.' });
    } catch (err) {
      console.error(err);
      const msg = err instanceof AIError ? err.userMessage : 'Ocurrió un error inesperado al generar el reporte.';
      setAiModal({ title: 'Error', content: msg });
    }
  };
```

Find:

```ts
  const handleAnomalies = async () => {
    setAiModal({ title: `Análisis de anomalías (${filteredOrders.length} órdenes)`, content: null });
    try {
      const text = await analyzeOrderAnomalies(filteredOrders);
      setAiModal({ title: `Análisis de anomalías (${filteredOrders.length} órdenes)`, content: text || 'Sin respuesta del modelo.' });
    } catch (err) {
      console.error(err);
      setAiModal({ title: 'Error', content: 'No se pudo analizar. Verifica tu clave API de Gemini.' });
    }
  };
```

Replace with:

```ts
  const handleAnomalies = async () => {
    setAiModal({ title: `Análisis de anomalías (${filteredOrders.length} órdenes)`, content: null });
    try {
      const text = await analyzeOrderAnomalies(filteredOrders);
      setAiModal({ title: `Análisis de anomalías (${filteredOrders.length} órdenes)`, content: text || 'Sin respuesta del modelo.' });
    } catch (err) {
      console.error(err);
      const msg = err instanceof AIError ? err.userMessage : 'Ocurrió un error inesperado al analizar.';
      setAiModal({ title: 'Error', content: msg });
    }
  };
```

Find:

```ts
  const handlePredictRisk = async (order: OdooSaleOrder) => {
    setPredictions(p => ({ ...p, [order.id]: 'loading' }));
    try {
      const result = await predictOrderRisk(order);
      setPredictions(p => ({ ...p, [order.id]: result }));
    } catch (err) {
      console.error(err);
      setPredictions(p => {
        const { [order.id]: _removed, ...rest } = p;
        return rest;
      });
      setAiModal({ title: 'Error', content: 'No se pudo predecir el riesgo. Verifica tu clave API de Gemini.' });
    }
  };
```

Replace with:

```ts
  const handlePredictRisk = async (order: OdooSaleOrder) => {
    setPredictions(p => ({ ...p, [order.id]: 'loading' }));
    try {
      const result = await predictOrderRisk(order);
      setPredictions(p => ({ ...p, [order.id]: result }));
    } catch (err) {
      console.error(err);
      setPredictions(p => {
        const { [order.id]: _removed, ...rest } = p;
        return rest;
      });
      const msg = err instanceof AIError ? err.userMessage : 'Ocurrió un error inesperado al predecir el riesgo.';
      setAiModal({ title: 'Error', content: msg });
    }
  };
```

- [ ] **Step 3: `StatsDashboard.tsx` — import `AIError` and use it in `handleGenerateSummary`**

Find:

```ts
import { generateShiftSummary } from '../services/ai';
```

Replace with:

```ts
import { generateShiftSummary, AIError } from '../services/ai';
```

Find:

```ts
  const handleGenerateSummary = async () => {
    setIsGenerating(true);
    try {
      const summary = await generateShiftSummary(orders);
      setAiSummary(summary || 'Sin respuesta del modelo.');
    } catch (e) {
      console.error(e);
      setAiSummary('Error al generar el resumen. Por favor, compruebe su clave API e inténtelo de nuevo.');
    }
    setIsGenerating(false);
  };
```

Replace with:

```ts
  const handleGenerateSummary = async () => {
    setIsGenerating(true);
    try {
      const summary = await generateShiftSummary(orders);
      setAiSummary(summary || 'Sin respuesta del modelo.');
    } catch (e) {
      console.error(e);
      const msg = e instanceof AIError ? e.userMessage : 'Ocurrió un error inesperado al generar el resumen.';
      setAiSummary(msg);
    }
    setIsGenerating(false);
  };
```

- [ ] **Step 4: `TVDashboard.tsx` — import `AIError` and use it in the voice command catch block**

Find:

```ts
import { processTextVoiceCommand, generateSpeech } from '../services/ai';
```

Replace with:

```ts
import { processTextVoiceCommand, generateSpeech, AIError } from '../services/ai';
```

Find:

```ts
          } catch (e) {
            console.error('Error en el procesamiento de voz', e);
            showToast('Hubo un error al procesar el comando de voz.', 'error');
            await playErrorSound();
          } finally {
```

Replace with:

```ts
          } catch (e) {
            console.error('Error en el procesamiento de voz', e);
            const msg = e instanceof AIError ? e.userMessage : 'Hubo un error al procesar el comando de voz.';
            showToast(msg, 'error');
            await playErrorSound();
          } finally {
```

- [ ] **Step 5: Verify it compiles**

Run: `npm run lint`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AdminPanel.tsx src/pages/StatsDashboard.tsx src/pages/TVDashboard.tsx
git commit -m "fix(ai): show the real classified error instead of a hardcoded API-key message"
```

---

### Task 6: Manual verification pass

**Files:** none (verification only, no code changes)

- [ ] **Step 1: Full typecheck, both projects**

Run: `npm run lint`
Expected: exit code 0, no output.

Run: `cd functions && npm run build`
Expected: exit code 0, no output beyond normal `tsc` completion.

- [ ] **Step 2: Force a network error and confirm the classified message appears**

Start the app: `npm run dev:full`. Open `/admin`, open DevTools → Network tab → set throttling to "Offline". Trigger "Analizar anomalías" (or any AI action). Confirm the modal shows *"No se pudo conectar con el servidor. Verifica tu conexión a internet."* — not the old "Verifica tu clave API de Gemini" text. Restore network to "No throttling" afterward.

- [ ] **Step 3: Force a timeout and confirm the TV voice pipeline recovers**

With DevTools Network throttling set to a custom profile with very high latency (e.g. >15s), open `/` (TV dashboard), use the mic button, and speak a command. Confirm that after ~15s the toast shows *"La IA tardó demasiado en responder. Intenta de nuevo."* and `isProcessingVoice` clears (mic button becomes usable again) — it must not hang indefinitely. Restore normal network afterward.

- [ ] **Step 4: Confirm a genuine auth failure still reads as an auth problem**

In DevTools, run `indexedDBs` / sign out, or manually corrupt the Firebase ID token (e.g. via `localStorage` if cached) to force a 401 from `/api/ai/generate`, and confirm the message is the `auth`-kind copy ("Sesión expirada o clave API inválida…") rather than a generic network message. If this is impractical to force manually, code-review `classifyHttpStatus` instead and confirm 401/403 map to `'auth'`.

No commit for this task — it's verification only. If any step fails, fix the relevant task's code and re-run `npm run lint` before moving on.
