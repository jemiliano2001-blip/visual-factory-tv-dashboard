# Design: AI layer error handling & robustness

**Date:** 2026-07-17
**Status:** Approved for planning

## Problem

The Gemini AI layer (`src/services/ai.ts`, proxied through `server.ts`) has no
timeout, no retry, and no error classification:

- **Hung spinners:** `generateContent()` (client) and `runGeminiGenerate()`
  (server) call `fetch` / the Gemini SDK with no `AbortController` / timeout.
  If Gemini or the proxy hangs, `AIModal`'s "Generando…" state,
  `isProcessingVoice` on the TV, and `isSearchingAI` in Admin can spin
  forever — worst on the unattended TV dashboard.
- **Misleading errors:** every catch block in `AdminPanel.tsx` and
  `StatsDashboard.tsx` shows a hardcoded "Verifica tu clave API de Gemini",
  regardless of whether the real cause was a network blip, a 429 rate limit,
  an expired Firebase token, or a malformed JSON response from Gemini.
- **No retry:** a single transient failure (network hiccup, 429) kills a
  voice command or report generation outright.
- **Silent failure:** `filterOrdersByNaturalLanguage` swallows JSON parse
  errors and returns `[]` — the user sees "0 results" instead of an error,
  with no signal that the AI call actually failed.

## Scope

In scope: `src/services/ai.ts`, `server.ts` (`/api/ai/generate` handler and
`runGeminiGenerate` in `shared/geminiProxy.ts`), and the four call sites
(`AdminPanel.tsx`, `StatsDashboard.tsx`, `TVDashboard.tsx`) that currently
render hardcoded error strings.

Out of scope: prompt content, model selection, the PCM/TTS audio decode
pipeline, voice/filter business logic. This is purely a failure-handling
pass around the existing calls.

## Design

### 1. `AIError` type (`src/services/ai.ts`)

```ts
type AIErrorKind = 'network' | 'timeout' | 'auth' | 'rate_limit' | 'invalid_response' | 'server' | 'unknown';

class AIError extends Error {
  constructor(public kind: AIErrorKind, public userMessage: string, cause?: unknown) { ... }
}
```

Classification in `generateContent()`:
- `fetch` throws (offline, DNS, CORS) → `network`
- `AbortController` fired the timeout → `timeout`
- HTTP 401/403 → `auth`
- HTTP 429 → `rate_limit`
- HTTP 5xx → `server`
- response body's JSON doesn't parse where a schema was requested → `invalid_response`
- anything else → `unknown`

Each kind maps to a short, specific Spanish `userMessage` (e.g. `rate_limit`
→ "Gemini está saturado, intenta de nuevo en un momento." vs. `auth` →
"Sesión expirada o clave API inválida — vuelve a iniciar sesión.").

### 2. Timeout via `AbortController`

`generateContent()` takes an optional `timeoutMs` (default 30000). An
`AbortController` is wired into the `fetch` call; on abort the error is
classified as `timeout`. `processTextVoiceCommand` (and the `executeVoiceCommand`
it wraps) pass `timeoutMs: 15000` — an operator standing in front of the TV
needs a faster failure than a background admin report.

### 3. Bounded retry

A small `withRetry(fn, { retries: 2, baseDelayMs: 300 })` helper wraps the
`fetch` call inside `generateContent()`. Retries only on `network`,
`timeout`, `rate_limit`, and `server` — never on `auth` (retrying an invalid
token/key wastes time and won't change the outcome). Backoff: 300ms, then
900ms, before giving up and throwing the classified `AIError`.

### 4. Server-side timeout (`server.ts` / `shared/geminiProxy.ts`)

`runGeminiGenerate`'s call into the Gemini SDK is wrapped in
`Promise.race([call, timeout(30000)])` so a hung upstream call doesn't hold
the Express connection open indefinitely. On timeout, the handler responds
`504` with an error body; on a 429 from the SDK it passes through `429`
instead of collapsing everything to `500`. The client's classification in
step 1 reads these status codes directly.

### 5. Fix `filterOrdersByNaturalLanguage` silent failure

Currently:
```ts
try { return JSON.parse(response.text || '[]') as number[]; }
catch { return []; }
```
Changes to re-throw as `AIError('invalid_response', ...)` instead of
swallowing — the existing `catch` block in `AdminPanel.handleNLSearch`
already shows an `AIModal` error; it just needs real signal to act on.

### 6. UI call sites use `error.userMessage`

`AdminPanel.tsx` (`handleNLSearch`, `handleClientReport`, `handleAnomalies`,
`handlePredictRisk`), `StatsDashboard.tsx` (`handleGenerateSummary`), and
`TVDashboard.tsx` (voice command catch block) replace their hardcoded
Spanish error strings with:
```ts
catch (err) {
  const msg = err instanceof AIError ? err.userMessage : 'Ocurrió un error inesperado.';
  setAiModal({ title: 'Error', content: msg });
}
```

## Testing

No test runner in this repo (`npm run lint` = `tsc --noEmit` is the only
gate). Verification is manual: throttle/block the `/api/ai/generate`
network request in devtools to force `network`/`timeout` errors and confirm
the modal/toast shows the right classified message instead of the old
hardcoded one; confirm a forced 429 (or 401 via an expired token) surfaces
distinctly. Confirm `tsc --noEmit` passes.

## Risks

- Retry adds latency to genuinely-failing auth/invalid-key cases only if
  misclassified as retryable — mitigated by the explicit non-retry list.
- Voice command timeout (15s) must stay comfortably above normal Gemini
  latency for the JSON-schema voice response, or it'll false-timeout under
  normal load. 15s is generous relative to observed flash-model latency;
  revisit if false timeouts show up in practice.
