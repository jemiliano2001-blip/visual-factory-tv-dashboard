# Natural, Fast, Monterrey-Style Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make risk-priority voice responses feel immediate and natural by showing analysis instantly, optionally acknowledging slow analysis, and streaming Gemini TTS with a restrained Monterrey-style delivery.

**Architecture:** Preserve the current fast local path and Gemini risk/focus contract. Add a server-owned authenticated NDJSON TTS endpoint whose fixed Gemini request is validated in a shared module, then consume it through a cancellable browser PCM scheduler. `TVDashboard` owns each voice turn, acknowledgement timing, HUD state, native fallback, and in-memory latency diagnostics.

**Tech Stack:** React 19, TypeScript 5.8, Vite, Express, Firebase Functions v2, Firebase ID tokens, `@google/genai`, Web Audio API, Web Speech API, Node `node:test` via `tsx`.

**Spec:** `docs/superpowers/specs/2026-08-13-natural-fast-voice-design.md`

## Global Constraints

- Keep all visible UI, errors, prompts, and AI output in Spanish.
- Keep simple commands on `tryLocalFastVoiceCommand`; only risk-priority questions use the two-speed acknowledgement behavior.
- `POST /api/ai/speech-stream` accepts only trimmed `text`, rejects empty text and text longer than 240 characters, and always owns model, voice, prompt, audio configuration, 12-second upstream timeout, and zero retries.
- Use `gemini-3.1-flash-tts-preview` with `Sulafat`; never use `gemini-3.5-flash` for TTS.
- Request clear Mexican Spanish with a subtle Monterrey/northern-Mexico cadence; avoid slang, stereotypes, exaggerated pronunciation, and caricatured ranchero delivery.
- Use 24 kHz mono PCM, `application/x-ndjson`, `Cache-Control: no-store`, a 120 ms initial client buffer, and a 4-second first-audio timeout.
- A newer `voiceTurnRef` turn must abort/stop all previous acknowledgement, stream, scheduled PCM, browser-speech fallback, and stale callbacks.
- Preserve the generic `/api/ai/generate` route and its allowlist. Do not expose a client-selectable model, voice, or Gemini configuration through the new endpoint.
- Do not persist transcript, order data, user ID, audio, or timing metrics. Development diagnostics may use `console.debug` only.
- Preserve unrelated dirty work. Do not commit, push, deploy, or change Firebase configuration without explicit user authorization.

---

## File Structure

- Create `shared/geminiSpeechStream.ts`: protocol constants, strict request validation, fixed regional TTS Gemini request, chunk extraction, NDJSON serialization, and a transport-agnostic stream pump used by both servers.
- Create `shared/geminiSpeechStream.test.ts`: Node tests for request validation, fixed Gemini configuration, chunk extraction, NDJSON events, errors, and 12-second cancellation.
- Modify `server.ts`: add the local authenticated stream route after `/api/ai/generate` without changing the generic route.
- Modify `functions/src/index.ts`: add the equivalent authenticated Cloud Functions route before `onRequest` exports the Express app.
- Create `src/services/speechStream.ts`: browser NDJSON parser, 16-bit PCM decoder, Web Audio scheduler, cancellable stream fetcher, and dependency-injection seams for Node tests.
- Create `src/services/speechStream.test.ts`: Node tests for split NDJSON chunks, malformed events, 120 ms buffering, zero-audio/error behavior, and cancellation.
- Modify `src/services/ai.ts`: retain exact-text cache for acknowledgements and legacy callers, but update the legacy Gemini prompt to the same restrained Monterrey-style voice instruction.
- Modify `src/pages/TVDashboard.tsx`: begin acknowledgement prefetch on microphone capture, display risk analysis immediately, replace final full-response playback with streaming, and record local timings.
- Modify `src/components/VoiceFeedbackOverlay.tsx`: show `Analizando prioridades...` during a risk query before Gemini returns.
- Modify `package.json`: add the focused `test:voice-stream` script.

### Task 1: Shared secure speech-stream protocol

**Files:**
- Create: `shared/geminiSpeechStream.ts`
- Create: `shared/geminiSpeechStream.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: no HTTP framework, only an SDK-compatible async iterable of Gemini response chunks.
- Produces:

```ts
export const SPEECH_STREAM_MAX_CHARS = 240;
export const SPEECH_STREAM_TIMEOUT_MS = 12_000;
export type SpeechStreamEvent =
  | { type: 'audio'; data: string }
  | { type: 'done' }
  | { type: 'error'; message: string };
export function validateSpeechStreamBody(body: unknown):
  | { ok: true; text: string }
  | { ok: false; status: 400; error: string };
export function buildSpeechStreamRequest(text: string, abortSignal: AbortSignal): Record<string, unknown>;
export function extractSpeechAudio(chunk: unknown): string | null;
export async function pipeGeminiSpeechStream(...): Promise<void>;
```

- [ ] **Step 1: Write failing shared-protocol tests**

```ts
test('validates only a non-empty text no longer than 240 characters', () => {
  assert.deepEqual(validateSpeechStreamBody({ text: ' Orden S00001 ' }), { ok: true, text: 'Orden S00001' });
  assert.equal(validateSpeechStreamBody({ text: '' }).ok, false);
  assert.equal(validateSpeechStreamBody({ text: 'x'.repeat(241) }).ok, false);
  assert.equal(validateSpeechStreamBody({ text: 42 }).ok, false);
});

test('fixes Sulafat and the restrained Monterrey voice instruction on the server', () => {
  const request = buildSpeechStreamRequest('Orden S00001 requiere atención.', new AbortController().signal);
  assert.equal(request.model, 'gemini-3.1-flash-tts-preview');
  assert.deepEqual(request.config.responseModalities, ['AUDIO']);
  assert.equal(request.config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Sulafat');
  assert.match(request.contents.parts[0].text, /Monterrey|norteño/i);
});

test('emits audio, then done, and never forwards raw Gemini error text', async () => {
  const events: SpeechStreamEvent[] = [];
  await pipeGeminiSpeechStream(fakeAudioStream('AQI='), event => events.push(event));
  assert.deepEqual(events, [{ type: 'audio', data: 'AQI=' }, { type: 'done' }]);
});
```

- [ ] **Step 2: Run the focused shared tests and confirm they fail**

Run: `npx.cmd tsx --test shared/geminiSpeechStream.test.ts`

Expected: FAIL because `geminiSpeechStream.ts` does not exist.

- [ ] **Step 3: Implement strict protocol and transport-neutral pump**

```ts
export const SPEECH_STREAM_MODEL = 'gemini-3.1-flash-tts-preview';
export const SPEECH_STREAM_VOICE = 'Sulafat';

export function buildSpeechPrompt(text: string): string {
  return [
    'Habla en español mexicano claro, con una cadencia norteña/regia sutil de Monterrey.',
    'Tono cálido, directo y seguro; ritmo operativo. Sin muletillas, slang, caricatura ni leer instrucciones.',
    text,
  ].join('\n');
}

export function serializeSpeechStreamEvent(event: SpeechStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}
```

Implement `pipeGeminiSpeechStream` with a `try/catch/finally`: iterate the SDK async iterable, emit only nonempty `inlineData.data` strings, emit exactly one `done` after normal completion, and emit `{ type: 'error', message: 'No se pudo generar el audio.' }` for timeout, abort, or SDK failure. Its injected writer receives only `SpeechStreamEvent`, never a raw provider body or error string. Use an `AbortController` timer set to `SPEECH_STREAM_TIMEOUT_MS`; clear it in `finally`.

- [ ] **Step 4: Run shared tests and TypeScript gate**

Run: `npx.cmd tsx --test shared/geminiSpeechStream.test.ts`

Expected: PASS, including empty/overlong/body-type rejection, fixed model/voice/prompt, non-audio chunk omission, safe error event, and timeout abort.

Run: `npm.cmd run lint`

Expected: PASS.

- [ ] **Step 5: Leave changes uncommitted**

Do not run `git add`, `git commit`, push, or deploy. Record the focused test and lint results for the handoff.

### Task 2: Authenticated local and Cloud Functions stream routes

**Files:**
- Modify: `server.ts:129-154`
- Modify: `functions/src/index.ts:88-113`
- Test: `shared/geminiSpeechStream.test.ts`

**Interfaces:**
- Consumes: `validateSpeechStreamBody`, `buildSpeechStreamRequest`, `pipeGeminiSpeechStream`, and the existing `/api` Firebase-token middleware.
- Produces: `POST /api/ai/speech-stream` returning NDJSON `audio`, `done`, or safe `error` events after auth.

- [ ] **Step 1: Extend the failing transport test with the handler adapter contract**

```ts
test('writes NDJSON event lines in order and aborts when the HTTP request closes', async () => {
  const lines: string[] = [];
  const controller = new AbortController();
  await pipeGeminiSpeechStream(fakeAudioStream('AQI='), event => lines.push(serializeSpeechStreamEvent(event)), controller);
  assert.deepEqual(lines, ['{"type":"audio","data":"AQI="}\n', '{"type":"done"}\n']);
});
```

- [ ] **Step 2: Run the focused test and confirm its adapter assertion fails**

Run: `npx.cmd tsx --test shared/geminiSpeechStream.test.ts`

Expected: FAIL until the stream pump accepts the disconnect controller and route adapter behavior is implemented.

- [ ] **Step 3: Add the same route to both Express apps**

In each route, perform these operations in this order:

```ts
const validated = validateSpeechStreamBody(req.body);
if (validated.ok === false) {
  res.status(validated.status).json({ error: validated.error });
  return;
}
if (!process.env.GEMINI_API_KEY) {
  res.status(503).json({ error: 'Servicio de voz no configurado.' });
  return;
}

res.status(200);
res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
res.setHeader('Cache-Control', 'no-store');
res.setHeader('X-Accel-Buffering', 'no');
res.flushHeaders();
```

Create one `AbortController`, call `controller.abort()` from `req.once('close', ...)`, and pass its signal to `buildSpeechStreamRequest`. Call `ai.models.generateContentStream` with the returned fixed request (cast only at the SDK boundary because root and `functions/` may use different SDK type versions), then pass the result into `pipeGeminiSpeechStream`. Write each serialized event with `res.write` and finish with `res.end` only when the request is still writable. Do not modify `runGeminiGenerate`, `ALLOWED_AI_MODELS`, or `/api/ai/generate`.

- [ ] **Step 4: Run focused checks**

Run: `npx.cmd tsx --test shared/geminiSpeechStream.test.ts`

Expected: PASS.

Run: `npm.cmd run lint`

Expected: PASS.

- [ ] **Step 5: Perform a local authenticated endpoint smoke test**

Run `npm.cmd run dev:full`, authenticate the public TV with anonymous Firebase auth, issue a short request through the app, and inspect the browser Network response. Expected: response content type is NDJSON, at least one `audio` event arrives before `done`, and no Gemini credential/configuration appears in the request body.

- [ ] **Step 6: Leave changes uncommitted**

Do not stage, commit, push, or deploy the route changes.

### Task 3: Browser NDJSON client and cancellable PCM scheduler

**Files:**
- Create: `src/services/speechStream.ts`
- Create: `src/services/speechStream.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: the authenticated fetch headers already assembled by `src/services/ai.ts`.
- Produces:

```ts
export const FIRST_AUDIO_TIMEOUT_MS = 4_000;
export interface PcmStreamPlayback {
  cancel(): void;
  readonly receivedAudio: boolean;
}
export function parseSpeechStreamLines(chunk: string, remainder: string): { events: SpeechStreamEvent[]; remainder: string };
export function decodePcm16Mono(base64: string): Float32Array;
export function playGeminiSpeechStream(text: string, options: SpeechStreamOptions): Promise<SpeechStreamPlaybackResult>;
```

- [ ] **Step 1: Write failing browser-service tests using fake fetch and fake Web Audio objects**

```ts
test('buffers 120 ms before scheduling contiguous 24 kHz PCM', () => {
  const audio = new FakeAudioContext();
  const scheduler = new PcmStreamScheduler(audio, { initialBufferMs: 120 });
  scheduler.enqueue(pcmBase64ForMs(80));
  assert.equal(audio.starts.length, 0);
  scheduler.enqueue(pcmBase64ForMs(60));
  assert.equal(audio.starts.length, 2);
  assert.equal(audio.starts[1].when, audio.starts[0].when + audio.starts[0].duration);
});

test('parses NDJSON split across network reads and rejects malformed events', () => {
  const first = parseSpeechStreamLines('{"type":"audio","data":"AQ', '');
  const second = parseSpeechStreamLines('I="}\n{"type":"done"}\n', first.remainder);
  assert.deepEqual(second.events.map(event => event.type), ['audio', 'done']);
  assert.throws(() => parseSpeechStreamLines('{"type":"audio"}\n', ''), /evento de voz inválido/i);
});

test('cancels every scheduled source and aborts the fetch for a newer turn', async () => {
  const { playback, controller, audio } = await startFakeSpeechPlayback();
  playback.cancel();
  assert.equal(controller.signal.aborted, true);
  assert.equal(audio.stoppedCount > 0, true);
});
```

- [ ] **Step 2: Run the browser-service test and confirm it fails**

Run: `npx.cmd tsx --test src/services/speechStream.test.ts`

Expected: FAIL because the streaming parser and scheduler do not exist.

- [ ] **Step 3: Implement parser, decoder, scheduler, and stream fetcher**

Create a strict `isSpeechStreamEvent` guard which accepts only `{ type: 'audio', data: nonempty string }`, `{ type: 'done' }`, and `{ type: 'error', message: nonempty string }`. Decode incoming bytes with `TextDecoder`, retain the incomplete trailing line, parse each complete line, and reject an unfinished or malformed final event.

`decodePcm16Mono` must use `window.atob`, read little-endian signed 16-bit samples, and map each sample to `sample / 32768`. `PcmStreamScheduler` must create one-channel 24 kHz buffers, wait until queued duration reaches 0.12 seconds, schedule every buffer at `max(nextStartTime, audioContext.currentTime + 0.02)`, and retain every `AudioBufferSourceNode` so `cancel()` stops all of them. Invoke `onFirstAudio` once when the first source is scheduled and invoke `onEnded` only after the last scheduled source ends.

`playGeminiSpeechStream` must POST `{ text }` to `/api/ai/speech-stream`, use the existing Firebase-auth header supplier, own an `AbortController`, enforce a 4,000 ms first-audio timer, feed audio events into the scheduler, and return `{ cancel, receivedAudio }`. It must reject `error`, `done` without audio, non-OK HTTP status, invalid NDJSON, decoder error, and first-audio timeout so the dashboard can choose the native fallback. It must not retry and must not call `getSpokenAudio`.

- [ ] **Step 4: Run all voice-stream tests and TypeScript**

Add this script in `package.json`:

```json
"test:voice-stream": "tsx --test shared/geminiSpeechStream.test.ts src/services/speechStream.test.ts"
```

Run: `npm.cmd run test:voice-stream`

Expected: PASS for parser, scheduler buffer threshold, contiguous timing, cancellation, no-audio failure, provider error, and first-audio timeout.

Run: `npm.cmd run lint`

Expected: PASS.

- [ ] **Step 5: Leave changes uncommitted**

Do not stage, commit, push, or deploy.

### Task 4: Two-speed risk UX, natural acknowledgement, and final streamed speech

**Files:**
- Modify: `src/services/ai.ts:704-748`
- Modify: `src/pages/TVDashboard.tsx:39-100, 235-256, 505-680`
- Modify: `src/components/VoiceFeedbackOverlay.tsx:40-90`
- Test: `src/services/speechStream.test.ts`

**Interfaces:**
- Consumes: `getSpokenAudio`, `speakFastLocal`, `isVoiceRiskQuestion`, `playGeminiSpeechStream`, `SpeechStreamPlaybackResult`, and existing `voiceTurnRef`.
- Produces: instant risk-specific HUD, acknowledgement after 450 ms only when preloaded and still pending, final streamed TTS, and local latency diagnostics.

- [ ] **Step 1: Add failing timing/cancellation tests to the streaming service**

```ts
test('plays the exact acknowledgement only after 450 ms of still-pending risk analysis', () => {
  assert.equal(shouldPlayRiskAcknowledgement({ isRisk: true, elapsedMs: 449, audioReady: true, resultReady: false }), false);
  assert.equal(shouldPlayRiskAcknowledgement({ isRisk: true, elapsedMs: 450, audioReady: true, resultReady: false }), true);
  assert.equal(shouldPlayRiskAcknowledgement({ isRisk: false, elapsedMs: 900, audioReady: true, resultReady: false }), false);
  assert.equal(shouldPlayRiskAcknowledgement({ isRisk: true, elapsedMs: 900, audioReady: true, resultReady: true }), false);
});

test('a final result cancels acknowledgement before starting final streamed speech', () => {
  const calls = resolveVoiceTurn({ acknowledgementPlaying: true, finalMessage: 'Prioridad S00001.' });
  assert.deepEqual(calls, ['cancelAcknowledgement', 'startFinalStream']);
});
```

- [ ] **Step 2: Run the voice-stream suite and confirm the acknowledgement tests fail**

Run: `npm.cmd run test:voice-stream`

Expected: FAIL because no acknowledgement timing helper or turn-resolution sequence exists.

- [ ] **Step 3: Keep cached acknowledgement natural and regio**

In `generateSpeech`, replace the existing generic prompt with the same three fixed delivery constraints used by `buildSpeechPrompt`: clear Mexican Spanish, subtle Monterrey/northern cadence, warm/direct/confident/operational pacing, and no slang/caricature/instruction reading. Keep its 12-second timeout and zero retries unchanged because this legacy path serves only exact-text acknowledgement prefetch and existing callers.

- [ ] **Step 4: Wire turn-scoped acknowledgement and risk HUD in `TVDashboard`**

At microphone start, after incrementing `voiceTurnRef`, create a ref object with `{ turnId, startedAt, audioBase64: undefined, cancelled: false, played: false }` and start `getSpokenAudio('Revisando prioridades.')` without awaiting it. Store successful audio only if its `turnId` remains current; silently ignore its failure.

When final transcription is classified by `isVoiceRiskQuestion`, immediately set `isProcessingVoice` and a dedicated `isRiskVoiceProcessing` state before awaiting Gemini. Pass that state to `VoiceFeedbackOverlay`, which must render the header text exactly as `Analizando prioridades...` while no response exists. Never set that label for local fast commands.

Schedule and re-check the acknowledgement at 450 ms. It can call the existing `playPCMBase64` only when the turn is still current, it is a risk query, Gemini has not resolved, and cached acknowledgement audio is ready. Before setting the validated Gemini risk result, mark the acknowledgement cancelled and call the unified audio stop function. This prevents it from overlapping the final answer.

Replace the `getSpokenAudio(result.message).then(...)` final-response chain with `playGeminiSpeechStream(result.message, { onFirstAudio, onEnded })`. Keep `isSpeaking` true from final start until the scheduler ends. On rejected stream, verify `turnId === voiceTurnRef.current`, then call `speakFastLocal` once; if native speech cannot start, clear `isSpeaking`. Store the playback cancel function in a ref and invoke it from the existing microphone-start interruption path and component unmount cleanup, along with `stopSpokenAudio()` and `window.speechSynthesis.cancel()`.

Record `recognitionEndToHudMs` when the risk analysis HUD state is set and `hudToFirstAudioMs` from HUD set until stream scheduler reports first audio. In development only, log numeric values with `console.debug('[voice timing]', { recognitionEndToHudMs, hudToFirstAudioMs })`; do not include transcript, PO, user ID, or raw errors.

- [ ] **Step 5: Run regression checks**

Run: `npm.cmd run test:voice-stream`

Expected: PASS, including the 450 ms gate, final-over-ack cancellation, stream failure fallback boundary, and timing callbacks.

Run: `npm.cmd run test:voice-risk`

Expected: PASS; risk validation, deduplication, focus ordering, and stale catalogue rejection remain unchanged.

Run: `npm.cmd run test:tv-page-packing`

Expected: PASS; existing TV rotation behavior remains intact.

Run: `npm.cmd run lint`

Expected: PASS.

- [ ] **Step 6: Manually verify the real voice flow locally**

Run `npm.cmd run dev:full` and test all of these in Chrome or Edge with authenticated anonymous Firebase TV access:

1. Ask a risk question slowly enough to exceed 450 ms: the HUD immediately says `Analizando prioridades...`, then `Revisando prioridades.` may play once, and final audio interrupts it before speaking the one-sentence result.
2. Ask a normal command: its existing local fast path runs; no risk acknowledgement is played.
3. Start a second microphone turn while acknowledgement, streamed audio, or browser fallback is active: old audio stops and never resumes.
4. Force the stream to fail or withhold audio: the final message is spoken once by native browser speech and the TV risk focus stays valid.
5. Listen on the target TV speakers: delivery is clear Mexican Spanish with a restrained Monterrey feel, not theatrical or slang-heavy, and PO/product terminology remains intelligible at operational volume.

- [ ] **Step 7: Leave changes uncommitted**

Do not stage, commit, push, or deploy. Report which automated and manual checks ran and explicitly separate local streaming evidence from production behavior.

### Task 5: Production-streaming release gate

**Files:**
- Modify: none without explicit release authorization.

**Interfaces:**
- Consumes: a completed local implementation and an explicit user authorization to deploy the exact Firebase scope.
- Produces: evidence of whether Hosting plus Cloud Functions delivers an audio event before `done`.

- [ ] **Step 1: Obtain explicit deployment authorization**

Do not run Firebase deployment commands, alter Firebase configuration, or infer authorization from local test success. Ask for the exact release approval after Tasks 1–4 are complete.

- [ ] **Step 2: Verify deployed streaming only after authorization**

With a real authenticated Gemini/Odoo risk query, inspect the browser Network stream. Expected: the response contains at least one `audio` NDJSON line before `done` and `hudToFirstAudioMs` appears only in development diagnostics when applicable.

- [ ] **Step 3: Record the outcome without overstating it**

If an `audio` line arrives only after the full response completes, report that Hosting/Functions buffered the stream. Keep immediate HUD and acknowledgement behavior, but do not claim final audio streaming is effective until a delivery-path change is designed and verified.

## Self-Review

### Spec coverage

- Immediate risk HUD and persistent focus preservation: Task 4.
- Gemini structured risk selection remains unchanged: Task 4 regression suite.
- Dedicated fixed, authenticated TTS endpoint and no generic-route widening: Tasks 1–2.
- NDJSON audio/done/error protocol, disconnect, timeout, and no retries: Tasks 1–2.
- 24 kHz PCM streaming, 120 ms scheduling, first-audio timeout, cancellation, and native fallback: Task 3 and Task 4.
- Preloaded 450 ms acknowledgement and one short final phrase: Task 4.
- Restrained Monterrey delivery on acknowledgement and final TTS: Tasks 1 and 4, with target-speaker QA.
- Non-persistent local timing diagnostics and production buffering verification: Tasks 4–5.
- No commit, push, deploy, or unrelated modifications: Global Constraints and each task’s final step.

### Placeholder scan

The prohibited placeholder patterns are absent. All introduced interfaces, events, constants, tests, commands, and failure outcomes are named in the task that creates them.

### Type consistency

`SpeechStreamEvent`, `SPEECH_STREAM_MAX_CHARS`, `SPEECH_STREAM_TIMEOUT_MS`, `FIRST_AUDIO_TIMEOUT_MS`, `validateSpeechStreamBody`, `buildSpeechStreamRequest`, `pipeGeminiSpeechStream`, `parseSpeechStreamLines`, `decodePcm16Mono`, and `playGeminiSpeechStream` are defined in Tasks 1 and 3 before Tasks 2 and 4 consume them. Browser playback retains `voiceTurnRef` as its single stale-turn authority.
