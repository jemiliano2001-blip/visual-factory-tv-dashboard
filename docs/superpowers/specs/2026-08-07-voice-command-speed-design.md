# Design: Voice command speed — factual-question fast path + TTS cache

**Date:** 2026-08-07
**Status:** Approved for planning

## Problem

The voice command pipeline (`src/services/ai.ts`, wired in `TVDashboard.tsx`)
already has a local fast path (`tryLocalFastVoiceCommand`) that resolves PO
lookups, "limpiar filtros", and client/status filters in under 5ms with no
network call. But it deliberately bails to Gemini for **any** interrogative
phrasing ("qué", "cuánto", "cuál", "hay", ...) — including purely factual
questions the app can already answer from data it has in memory:

- "¿Cuántas están vencidas?"
- "¿Hay algo urgente?"
- "¿Cuál es la más atrasada?"

For these, the operator waits on two sequential Gemini round-trips
(`processTextVoiceCommand` for interpretation, then `generateSpeech` for
TTS) to get an answer that's just a count or a lookup over `activeOrders` —
slower **and** less reliable than computing it directly, since an LLM can
misread the catalog while a direct filter/count cannot.

Separately, `generateSpeech()` (Gemini TTS) runs on every voice command,
including ones the local fast path already resolved instantly — it's a
second network round-trip that stays in the critical path even when the
interpretation itself was free. Some spoken messages are fixed strings
("Filtros limpiados. Mostrando todas las órdenes.") or repeat verbatim
(the new count answers, when the count doesn't change between commands),
and are re-synthesized from scratch every time.

## Scope

In scope: `src/services/ai.ts` (`tryLocalFastVoiceCommand`, new
`getSpokenAudio` wrapper), `src/pages/TVDashboard.tsx` (swap the
`generateSpeech` call site for `getSpokenAudio`).

Out of scope: narrative/explanatory questions ("cómo va Nissan", "por qué se
atrasó la 546") — these still require Gemini and are unaffected. No changes
to `processTextVoiceCommand`, `executeVoiceCommand`, the Gemini prompt/schema,
the TTS model, or `playPCMBase64`.

## Design

### 1. Factual-question patterns in `tryLocalFastVoiceCommand`

Three new checks are added to the existing step-numbered ladder in
`tryLocalFastVoiceCommand`, evaluated **before** the current step 0 bail-out
that returns `null` for any interrogative-shaped text. Anything that doesn't
match one of these still falls through to that bail-out exactly as today —
narrative questions are unaffected.

**Shared status-word detector.** The four status regexes currently inlined
in step 3 (`vencida[s]?|atrasada[s]?|...` → `overdue`, etc.) are extracted
into a local helper:

```ts
function detectStatusWord(text: string): 'overdue' | 'delivered' | 'pending' | 'critical' | null {
  if (/(vencida[s]?|atrasada[s]?|retrasada[s]?)/i.test(text)) return 'overdue';
  if (/(entregada[s]?|completada[s]?|terminada[s]?)/i.test(text)) return 'delivered';
  if (/(critica[s]?|urgente[s]?)/i.test(text)) return 'critical';
  if (/(pendiente[s]?|en proceso|activas)/i.test(text)) return 'pending';
  return null;
}
```

Step 3's existing filter-type block calls this instead of repeating the four
regexes.

**Count helper**, mirroring the exact semantics `TVDashboard.tsx` already
uses to populate `filteredOdooOrders` (lines 421-434) so a spoken count can
never contradict what's on screen:

```ts
function countByStatus(orders: OdooSaleOrder[], status: 'overdue' | 'pending' | 'delivered' | 'critical'): number {
  if (status === 'delivered') return orders.filter(isOrderFullyDelivered).length;
  const visible = orders.filter(o => !isOrderFullyDelivered(o));
  if (status === 'overdue') return visible.filter(isOrderOverdue).length;
  if (status === 'critical') return visible.filter(o => ['critical', 'high'].includes(getOrderPriority(o))).length;
  return visible.filter(o => getDeliveryProgress(o) < 100 && !isOrderOverdue(o)).length; // pending
}
```

Requires importing `isOrderFullyDelivered` from `./odoo` into `ai.ts`
(already imports `isOrderOverdue`, `getDeliveryProgress`, `getOrderPriority`).

**a) "¿Cuántas [estado] hay?" / "¿Cuántas órdenes hay?"**
Pattern: `/^cu[aá]nt[oa]s?\b/i` combined with `detectStatusWord(text)`. If a
status word is found, count via `countByStatus`; if not (bare "cuántas
órdenes hay en total"), count `activeOrders.filter(o =>
!isOrderFullyDelivered(o)).length`. Message with correct singular/plural:
`0` → `"No hay órdenes vencidas."`, `1` → `"1 orden vencida."`, `N` →
`"${N} órdenes vencidas."` (status label pulled from the existing
`STATE_LABELS` map, already defined for the filter-confirmation message).

**b) "¿Hay algo urgente/crítico/vencido/atrasado?"**
Pattern: `/^hay\s+(algo\s+|alguna\s+orden\s+)?(urgente|cr[ií]tic|vencid|atrasad)/i`.
Maps to the same `critical`/`overdue` count via `countByStatus`. Message:
count `> 0` → `"Sí, hay ${N} orden(es) ${label}."`, else → `"No, no hay
ninguna."`.

**c) "¿Cuál es la más atrasada?"**
Pattern: `/m[aá]s\s+atrasad/i` (catches "cuál es la más atrasada", "la orden
más atrasada", "cuál está más atrasada"). Finds the overdue order with the
oldest `commitment_date` (via `parseOdooDate`, same as `getOrderPriority`
does internally). If none overdue: `"No hay ninguna orden vencida."` with no
highlight. If found: same response shape as the existing direct-PO-match
branch (step 2) — `action: 'highlight'`, `po_number`, and `expected_order`
populated so `VoiceFeedbackOverlay` and the highlight/scroll behavior work
identically to a spoken PO number.

### 2. TTS memoization (`getSpokenAudio`)

```ts
const ttsCache = new Map<string, string>();
const TTS_CACHE_MAX = 50; // ponytail: FIFO eviction, no LRU — the TV runs for
// days without reload, this just caps memory; upgrade to real LRU if the
// 50-slot cap starts evicting phrases that are still in active rotation.

export async function getSpokenAudio(text: string): Promise<string | undefined> {
  const cached = ttsCache.get(text);
  if (cached) return cached;
  const audio = await generateSpeech(text);
  if (audio) {
    if (ttsCache.size >= TTS_CACHE_MAX) {
      const oldestKey = ttsCache.keys().next().value;
      if (oldestKey !== undefined) ttsCache.delete(oldestKey);
    }
    ttsCache.set(text, audio);
  }
  return audio;
}
```

Only successful (truthy) audio is cached — a transient Gemini TTS failure is
never "stuck", the next identical message just retries against the network
as it does today. `TVDashboard.tsx`'s single call site
(`generateSpeech(result.message)`, in the `onresult` handler) is swapped for
`getSpokenAudio(result.message)`; no other change to that block (the
`turnId` interruption check, `playPCMBase64`, and `speakFastLocal` fallback
are untouched).

This is a plain memoization keyed by exact message text — it isn't special-
cased to "known fixed strings". Any message that repeats verbatim benefits,
including the new count answers when the count is unchanged between two
commands.

## Testing

No test runner in this repo (`npm run lint` = `tsc --noEmit` is the only
gate); `tryLocalFastVoiceCommand`'s existing patterns (including
`parseSpanishNumberWords`) have no unit tests today either, so this follows
existing convention rather than introducing a new test file. Verification is
manual with `npm run dev:full`:

- Speak each new pattern ("cuántas están vencidas", "hay algo urgente",
  "cuál es la más atrasada") and confirm an instant response (no network
  call to `/api/ai/generate` in devtools) with a count that matches what's
  visible on screen.
- Speak a narrative question ("cómo va Nissan") and confirm it still goes to
  Gemini (network call visible, response takes longer) — regression check
  that the bail-out still works for anything unmatched.
- Repeat the exact same voice command twice and confirm the second TTS
  playback has no `/api/ai/generate` call (cache hit) but sounds identical.
- Confirm `tsc --noEmit` passes.

## Risks

- Regex false-positives on the new patterns could misfire on a phrasing that
  was meant as a narrative question (e.g. something containing "más
  atrasada" as an aside). Patterns are intentionally narrow (anchored where
  practical) to minimize this; if a real misfire shows up in use, tighten
  the specific pattern rather than broadening the interrogative bail-out.
- `countByStatus` must be kept in sync by hand with `filteredOdooOrders`'
  filter semantics in `TVDashboard.tsx` if that logic ever changes — they're
  duplicated (not shared) because one lives in a React component and the
  other in a plain module with no order-list dependency on component state.
