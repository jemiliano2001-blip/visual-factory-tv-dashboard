# Voice Command Speed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut voice-command latency for factual questions ("¿cuántas están vencidas?", "¿hay algo urgente?", "¿cuál es la más atrasada?") by answering them locally instead of round-tripping to Gemini twice, and memoize spoken TTS audio by exact message text so a repeated message never re-hits the network.

**Architecture:** Three new pattern-matching blocks are added to the front of `tryLocalFastVoiceCommand()` in `src/services/ai.ts`, ahead of the existing bail-out that currently sends every interrogative straight to Gemini. They reuse the exact filter semantics `TVDashboard.tsx` already uses for `filteredOdooOrders`, so a spoken count can never contradict what's on screen. A new `getSpokenAudio()` wrapper adds a plain `Map`-based memoization cache in front of the existing `generateSpeech()` Gemini TTS call; `TVDashboard.tsx`'s single call site swaps to it.

**Tech Stack:** TypeScript, no new npm dependencies, no new files.

## Global Constraints

- No test runner exists in this repo. `npm run lint` (`tsc --noEmit`) is the only automated gate — run it after every task.
- No new npm dependencies.
- All user-facing/spoken strings are Spanish (matches the rest of the app).
- Do not touch: `processTextVoiceCommand`, `executeVoiceCommand`, the Gemini prompt/schema for voice interpretation, the TTS model (`gemini-3.1-flash-tts-preview`) or its config, `playPCMBase64`, `speakFastLocal`.
- Follow the existing numbered-step comment convention inside `tryLocalFastVoiceCommand` (`// 0.`, `// 1.`, `// 2.`, `// 3.` — new checks are `// 0.a`, `// 0.b`, `// 0.c`, and the existing bail-out becomes `// 0.z`, still the last thing checked before falling through to Gemini).
- New factual-question counts must use the same status semantics `TVDashboard.tsx` uses for `filteredOdooOrders` (`src/pages/TVDashboard.tsx:404-436`): overdue = `isOrderOverdue`, pending = `getDeliveryProgress < 100 && !isOrderOverdue`, critical = `getOrderPriority` is `'critical'` or `'high'`, delivered = `isOrderFullyDelivered`.

---

### Task 1: Shared status-word detector + order-counting helper

**Files:**
- Modify: `src/services/ai.ts` (top import, and the `STATE_LABELS`/`CLIENT_CAPTURE_STOPWORDS` block, and step 3's inline filter-type detection inside `tryLocalFastVoiceCommand`)

**Interfaces:**
- Produces: `function detectStatusWord(text: string): 'overdue' | 'delivered' | 'pending' | 'critical' | null` and `function countByStatus(orders: OdooSaleOrder[], status: 'overdue' | 'pending' | 'delivered' | 'critical'): number`, both module-private in `ai.ts`. Also makes `isOrderFullyDelivered` (from `./odoo`) available in this file. Task 2 consumes all three.

- [ ] **Step 1: Import `isOrderFullyDelivered`**

Find:

```ts
import { OdooSaleOrder, getOrderPriority, isOrderOverdue, getDeliveryProgress, parseOdooDate } from './odoo';
```

Replace:

```ts
import { OdooSaleOrder, getOrderPriority, isOrderOverdue, isOrderFullyDelivered, getDeliveryProgress, parseOdooDate } from './odoo';
```

- [ ] **Step 2: Add `detectStatusWord` and `countByStatus` helpers**

Find:

```ts
const STATE_LABELS: Record<'overdue' | 'delivered' | 'pending' | 'critical', string> = {
  overdue: 'vencidas', delivered: 'entregadas', pending: 'pendientes', critical: 'críticas',
};

/** Palabras que cortan la captura de un nombre de cliente ("las de Nissan que están vencidas" -> "nissan"). */
const CLIENT_CAPTURE_STOPWORDS = new Set([
  'que', 'esta', 'está', 'estan', 'están', 'esa', 'ese', 'y', 'del', 'la', 'el', 'los', 'las',
]);
```

Replace:

```ts
const STATE_LABELS: Record<'overdue' | 'delivered' | 'pending' | 'critical', string> = {
  overdue: 'vencidas', delivered: 'entregadas', pending: 'pendientes', critical: 'críticas',
};

/** Detecta una palabra de estado en el texto. Compartido entre el filtro de cliente/estado
 * (paso 3) y las preguntas factuales de conteo (paso 0). */
function detectStatusWord(text: string): 'overdue' | 'delivered' | 'pending' | 'critical' | null {
  if (/(vencida[s]?|atrasada[s]?|retrasada[s]?)/i.test(text)) return 'overdue';
  if (/(entregada[s]?|completada[s]?|terminada[s]?)/i.test(text)) return 'delivered';
  if (/(critica[s]?|urgente[s]?)/i.test(text)) return 'critical';
  if (/(pendiente[s]?|en proceso|activas)/i.test(text)) return 'pending';
  return null;
}

/** Cuenta órdenes por estado con la misma semántica que TVDashboard.tsx usa para poblar
 * filteredOdooOrders (isOrderFullyDelivered / isOrderOverdue / getDeliveryProgress /
 * getOrderPriority) — una respuesta hablada nunca debe contradecir lo que se ve en pantalla. */
function countByStatus(orders: OdooSaleOrder[], status: 'overdue' | 'pending' | 'delivered' | 'critical'): number {
  if (status === 'delivered') return orders.filter(isOrderFullyDelivered).length;
  const visible = orders.filter(o => !isOrderFullyDelivered(o));
  if (status === 'overdue') return visible.filter(isOrderOverdue).length;
  if (status === 'critical') return visible.filter(o => ['critical', 'high'].includes(getOrderPriority(o))).length;
  return visible.filter(o => getDeliveryProgress(o) < 100 && !isOrderOverdue(o)).length;
}

/** Palabras que cortan la captura de un nombre de cliente ("las de Nissan que están vencidas" -> "nissan"). */
const CLIENT_CAPTURE_STOPWORDS = new Set([
  'que', 'esta', 'está', 'estan', 'están', 'esa', 'ese', 'y', 'del', 'la', 'el', 'los', 'las',
]);
```

- [ ] **Step 3: Replace step 3's inline filter-type detection with `detectStatusWord`**

Find:

```ts
  let filterType: 'overdue' | 'delivered' | 'pending' | 'critical' | null = null;
  if (/(vencida[s]?|atrasada[s]?|retrasada[s]?)/i.test(text)) filterType = 'overdue';
  else if (/(entregada[s]?|completada[s]?|terminada[s]?)/i.test(text)) filterType = 'delivered';
  else if (/(critica[s]?|urgente[s]?)/i.test(text)) filterType = 'critical';
  else if (/(pendiente[s]?|en proceso|activas)/i.test(text)) filterType = 'pending';

  if (matchedClient || filterType) {
```

Replace:

```ts
  const filterType = detectStatusWord(text);

  if (matchedClient || filterType) {
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run lint`
Expected: no output, exit code 0.

- [ ] **Step 5: Manual regression check — existing status filter still works**

Run: `npm run dev:full`, open `/` (TV dashboard), click the mic, say **"muéstrame las vencidas"** (or any existing status/client phrase). Confirm it filters exactly as it did before this change (this refactor must be behavior-preserving for step 3 — only its internals changed).

- [ ] **Step 6: Commit**

```bash
git add src/services/ai.ts
git commit -m "refactor(ai): extract shared status-word detector and add order-count helper"
```

---

### Task 2: Factual-question patterns in `tryLocalFastVoiceCommand`

**Files:**
- Modify: `src/services/ai.ts` (inside `tryLocalFastVoiceCommand`, and the helper block just above it)

**Interfaces:**
- Consumes: `detectStatusWord`, `countByStatus`, `isOrderFullyDelivered`, `STATE_LABELS` (Task 1); `formatPONumber`, `getDeliveryProgress`, `isOrderOverdue`, `parseOdooDate` (already imported in this file).
- Produces: `function countMessage(count: number, pluralLabel: string): string`, module-private. No change to `tryLocalFastVoiceCommand`'s exported signature — only new return branches. `TVDashboard.tsx` (unmodified in this task) continues to receive whatever this function returns exactly as before.

- [ ] **Step 1: Add the `countMessage` formatting helper**

Find:

```ts
/** Palabras que cortan la captura de un nombre de cliente ("las de Nissan que están vencidas" -> "nissan"). */
const CLIENT_CAPTURE_STOPWORDS = new Set([
  'que', 'esta', 'está', 'estan', 'están', 'esa', 'ese', 'y', 'del', 'la', 'el', 'los', 'las',
]);
```

Replace:

```ts
/** Palabras que cortan la captura de un nombre de cliente ("las de Nissan que están vencidas" -> "nissan"). */
const CLIENT_CAPTURE_STOPWORDS = new Set([
  'que', 'esta', 'está', 'estan', 'están', 'esa', 'ese', 'y', 'del', 'la', 'el', 'los', 'las',
]);

/** Frasea un conteo con concordancia singular/plural ("1 orden vencida" / "3 órdenes vencidas").
 * `pluralLabel` viene de STATE_LABELS (ya en plural femenino: "vencidas", "críticas", ...);
 * el singular se deriva quitando la 's' final, válido para las cuatro etiquetas existentes. */
function countMessage(count: number, pluralLabel: string): string {
  if (count === 0) return `No hay órdenes ${pluralLabel}.`;
  if (count === 1) return `1 orden ${pluralLabel.slice(0, -1)}.`;
  return `${count} órdenes ${pluralLabel}.`;
}
```

- [ ] **Step 2: Insert the three factual-question checks ahead of the interrogative bail-out**

Find:

```ts
  const text = transcript.trim().toLowerCase();
  if (!text) return null;

  // 0. Preguntas ("qué", "cuánto", "hay algo urgente...") van directo a Gemini: el fast
  // path solo sabe filtrar/resaltar, no responder. Sin esto, "hay algo urgente" se
  // interpretaba como filtro crítico en vez de como pregunta.
  // Nota: se usa (?=\s|$) en vez de \b porque \b no detecta límite de palabra después de
  // una vocal acentuada en el motor de regex de JS ("qué" + \b nunca hace match).
  if (/^(qué|que|cuál|cual|cuáles|cuales|cuánto|cuanto|cuánta|cuanta|cuántos|cuantos|cuántas|cuantas|cómo|como|quién|quien|dónde|donde|hay|por qué|porque)(?=\s|$)/i.test(text)) {
    return null;
  }
```

Replace:

```ts
  const text = transcript.trim().toLowerCase();
  if (!text) return null;

  // 0.a "¿Cuál es la más atrasada?" — la orden vencida con el commitment_date más antiguo.
  // Mismo formato de respuesta que un PO directo (paso 2) para que el resaltado/overlay
  // se comporten igual que si el operador hubiera dicho el número de orden.
  if (/m[aá]s\s+atrasad/i.test(text)) {
    const overdueOrders = activeOrders.filter(isOrderOverdue);
    if (overdueOrders.length === 0) {
      return {
        transcript,
        po_number: null,
        action: 'answer',
        message: 'No hay ninguna orden vencida.',
        user_intent_summary: 'Consultando la orden más atrasada',
      };
    }
    const worst = overdueOrders.reduce((oldest, o) => {
      const oldestDate = parseOdooDate(oldest.commitment_date)?.getTime() ?? Infinity;
      const currentDate = parseOdooDate(o.commitment_date)?.getTime() ?? Infinity;
      return currentDate < oldestDate ? o : oldest;
    });
    const formattedPO = formatPONumber(worst.name);
    const deliveryProgress = `${worst.qty_delivered}/${worst.qty_total} (${getDeliveryProgress(worst)}%)`;
    return {
      transcript,
      po_number: formattedPO,
      action: 'highlight',
      message: `La más atrasada es la orden ${formattedPO} de ${worst.partner_name}.`,
      user_intent_summary: 'Consultando la orden más atrasada',
      expected_order: {
        po_number: formattedPO,
        client: worst.partner_name,
        product: worst.main_product,
        status: 'overdue',
        delivery_progress: deliveryProgress,
        reason: 'Orden vencida con la fecha de compromiso más antigua',
      },
    };
  }

  // 0.b "¿Hay algo urgente/crítico/vencido/atrasado?" — existencia, sin resaltar nada.
  const existenceMatch = text.match(/^hay\s+(algo\s+|alguna\s+orden\s+)?(urgente|cr[ií]tic\w*|vencid\w*|atrasad\w*)/i);
  if (existenceMatch) {
    const status: 'overdue' | 'critical' = /urgente|cr[ií]tic/i.test(existenceMatch[2]) ? 'critical' : 'overdue';
    const count = countByStatus(activeOrders, status);
    return {
      transcript,
      po_number: null,
      action: 'answer',
      message: count > 0
        ? `Sí, hay ${count} orden${count === 1 ? '' : 'es'} ${STATE_LABELS[status]}.`
        : 'No, no hay ninguna.',
      user_intent_summary: `Consultando si hay órdenes ${STATE_LABELS[status]}`,
    };
  }

  // 0.c "¿Cuántas [estado] hay?" / "¿Cuántas órdenes hay en total?" — conteo exacto en vez
  // de dejar que Gemini cuente (y potencialmente se equivoque) sobre el mismo catálogo.
  if (/^cu[aá]nt[oa]s?\b/i.test(text)) {
    const status = detectStatusWord(text);
    if (status) {
      const count = countByStatus(activeOrders, status);
      return {
        transcript,
        po_number: null,
        action: 'answer',
        message: countMessage(count, STATE_LABELS[status]),
        user_intent_summary: `Contando órdenes ${STATE_LABELS[status]}`,
      };
    }
    if (/\b(ordenes|órdenes)\b/i.test(text)) {
      const count = activeOrders.filter(o => !isOrderFullyDelivered(o)).length;
      return {
        transcript,
        po_number: null,
        action: 'answer',
        message: count === 1 ? '1 orden activa.' : `${count} órdenes activas.`,
        user_intent_summary: 'Contando órdenes activas',
      };
    }
  }

  // 0.z Preguntas ("qué", "cuánto", "hay algo urgente...") que no matchearon arriba van
  // directo a Gemini: el fast path solo sabe filtrar/resaltar/contar, no narrar ni explicar.
  // Nota: se usa (?=\s|$) en vez de \b porque \b no detecta límite de palabra después de
  // una vocal acentuada en el motor de regex de JS ("qué" + \b nunca hace match).
  if (/^(qué|que|cuál|cual|cuáles|cuales|cuánto|cuanto|cuánta|cuanta|cuántos|cuantos|cuántas|cuantas|cómo|como|quién|quien|dónde|donde|hay|por qué|porque)(?=\s|$)/i.test(text)) {
    return null;
  }
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run lint`
Expected: no output, exit code 0.

- [ ] **Step 4: Manual test — new factual questions resolve instantly and correctly**

Run: `npm run dev:full`, open `/` (TV dashboard), open DevTools → Network tab. For each phrase below: click the mic, speak it, and confirm (a) **no** request to `/api/ai/generate` fires, (b) the spoken/toast message matches what's visible on screen:

- "¿Cuántas están vencidas?" → count matches the number of overdue orders you can see.
- "¿Hay algo urgente?" → "Sí, hay N órdenes críticas." or "No, no hay ninguna." matching what's on screen.
- "¿Cuál es la más atrasada?" → highlights an actually-overdue order, or "No hay ninguna orden vencida." if none exist.

If there are currently zero overdue orders in the connected Odoo data, temporarily test the zero-count branches ("Hay algo urgente" → "No, no hay ninguna.", "Cuál es la más atrasada" → "No hay ninguna orden vencida.") and skip the non-zero branches, noting this in your task completion notes.

- [ ] **Step 5: Manual regression check — narrative questions still go to Gemini**

Speak a narrative question, e.g. **"¿cómo va Nissan?"**. Confirm a request to `/api/ai/generate` **does** fire (this must still fall through to Gemini — it's not covered by any new pattern) and a longer, more conversational response comes back.

- [ ] **Step 6: Commit**

```bash
git add src/services/ai.ts
git commit -m "feat(ai): answer factual voice questions (counts, existence, most-overdue) locally"
```

---

### Task 3: TTS memoization — `getSpokenAudio`

**Files:**
- Modify: `src/services/ai.ts` (append after `generateSpeech`)

**Interfaces:**
- Consumes: `generateSpeech(text: string): Promise<string | undefined>` (existing, unchanged).
- Produces: `export async function getSpokenAudio(text: string): Promise<string | undefined>`. Task 4 consumes this.

- [ ] **Step 1: Add the cache and wrapper function**

Find:

```ts
  }, 12000, 0);
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};
```

Replace:

```ts
  }, 12000, 0);
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};

const ttsCache = new Map<string, string>();
const TTS_CACHE_MAX = 50; // ponytail: FIFO eviction, no LRU — el TV corre días sin recargar,
// esto solo acota la memoria; si el tope de 50 empieza a desalojar frases que siguen en
// rotación activa, subir a una LRU real.

/** Envuelve generateSpeech() con memoización por texto exacto: cualquier mensaje que se
 * repita literalmente (fijo o coincidencia de conteo) evita una vuelta de red a Gemini TTS.
 * Solo se cachea audio exitoso — una falla transitoria no se queda "pegada" en el cache. */
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

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/services/ai.ts
git commit -m "feat(ai): memoize TTS audio by exact message text"
```

---

### Task 4: Wire `getSpokenAudio` into `TVDashboard.tsx`

**Files:**
- Modify: `src/pages/TVDashboard.tsx` (import line, and the TTS call site inside the voice `onresult` handler)

**Interfaces:**
- Consumes: `getSpokenAudio` from Task 3.

- [ ] **Step 1: Swap the import**

Find:

```ts
import { processTextVoiceCommand, tryLocalFastVoiceCommand, speakFastLocal, generateSpeech, AIError, type VoiceCommandResponse } from '../services/ai';
```

Replace:

```ts
import { processTextVoiceCommand, tryLocalFastVoiceCommand, speakFastLocal, getSpokenAudio, AIError, type VoiceCommandResponse } from '../services/ai';
```

- [ ] **Step 2: Swap the call site**

Find:

```ts
            if (result.message) {
              showToast(result.message, result.action === 'answer' ? 'info' : 'success');
              setIsSpeaking(true);
              // Gemini TTS es la voz principal para todo comando (local o de Gemini): la app
              // ya depende de internet para todo lo demás (Odoo, interpretación de voz), así
              // que evitar la red aquí no compra nada real — y la voz de Gemini suena mejor
              // que la nativa del navegador. speakFastLocal queda solo como respaldo de
              // emergencia si el TTS en la nube falla.
              generateSpeech(result.message)
                .then(audioBase64 => {
```

Replace:

```ts
            if (result.message) {
              showToast(result.message, result.action === 'answer' ? 'info' : 'success');
              setIsSpeaking(true);
              // Gemini TTS es la voz principal para todo comando (local o de Gemini): la app
              // ya depende de internet para todo lo demás (Odoo, interpretación de voz), así
              // que evitar la red aquí no compra nada real — y la voz de Gemini suena mejor
              // que la nativa del navegador. speakFastLocal queda solo como respaldo de
              // emergencia si el TTS en la nube falla. getSpokenAudio memoiza por texto exacto,
              // así que un mensaje repetido (p. ej. "Filtros limpiados...") no vuelve a golpear
              // la red.
              getSpokenAudio(result.message)
                .then(audioBase64 => {
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run lint`
Expected: no output, exit code 0.

- [ ] **Step 4: Manual test — repeated message hits the cache**

Run: `npm run dev:full`, open `/`, DevTools → Network tab. Click the mic and say **"limpiar filtros"** — confirm one `/api/ai/generate` request (the TTS call) and the audio plays. Click the mic again and say **"limpiar filtros"** a second time — confirm **no** `/api/ai/generate` request fires this time, and the audio still plays (from cache).

- [ ] **Step 5: Commit**

```bash
git add src/pages/TVDashboard.tsx
git commit -m "feat(tv): use memoized TTS for spoken voice-command responses"
```

---

### Task 5: Full manual verification pass

**Files:** none (verification only, no code changes)

- [ ] **Step 1: Typecheck**

Run: `npm run lint`
Expected: exit code 0, no output.

- [ ] **Step 2: End-to-end pass on the TV dashboard**

Run: `npm run dev:full`, open `/`, open DevTools → Network tab (leave it open through all of the following):

1. Say **"¿cuántas están vencidas?"** — instant answer, no `/api/ai/generate` call, count matches the screen.
2. Say **"¿hay algo urgente?"** — instant answer, no `/api/ai/generate` call.
3. Say **"¿cuál es la más atrasada?"** — instant answer, no `/api/ai/generate` call; if an overdue order exists, it gets highlighted and scrolled into view same as a spoken PO number would.
4. Say **"¿cómo va Nissan?"** (or any client with active orders) — this one **does** call `/api/ai/generate` (goes to Gemini) and returns a longer, conversational answer — confirms narrative questions are unaffected.
5. Say **"limpiar filtros"** twice in a row — second time has no `/api/ai/generate` call (TTS cache hit) but audio still plays both times.
6. Say a direct PO number that exists in the current catalog — confirm the existing highlight/scroll/TTS behavior is unaffected by any of the above changes.

No commit for this task — it's verification only. If any step fails, fix the relevant task's code and re-run `npm run lint` before moving on.
