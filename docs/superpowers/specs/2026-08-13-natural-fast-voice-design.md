# Design: Natural and fast operational voice

**Date:** 2026-08-13
**Status:** Approved for planning

## Goal

Keep Gemini as the natural Mexican-Spanish voice while reducing the time from a
completed spoken question to visible and audible feedback. The operator must
never wait silently, and a newer voice turn must still cancel all prior audio.

## Scope

In scope: risk-priority questions, the Gemini TTS transport, audio scheduling,
the short natural acknowledgement, and local timing metrics. The existing
structured Gemini risk selection and persistent TV focus remain authoritative.

Out of scope: Gemini Live or conversational audio input, a new model,
persisting transcripts or metrics, changing authentication, deploy, or
replacing the native-speech emergency fallback.

## Architecture

### Two-speed feedback

When speech recognition produces its final transcript, the TV immediately
enters an `analysing` voice state and displays `Analizando prioridades…`.
Risk questions still call Gemini 3.5 Flash with the validated compact catalogue
and continue to accept only a structured selection of real POs.

At the start of microphone capture, the client starts a best-effort background
request for the exact Gemini TTS acknowledgement `Revisando prioridades.`. It
never delays recognition, Gemini analysis, HUD rendering, or final speech. Once
final transcription is available, it plays only when risk analysis has lasted
at least 450 ms and acknowledgement audio is already available. A final result
always cancels the acknowledgement before final speech begins.

The HUD and persistent focus apply as soon as Gemini's structured risk result
passes the existing validation. The spoken final message remains one short
sentence containing the finding and highest-ranked PO.

### Dedicated PCM streaming endpoint

Add authenticated `POST /api/ai/speech-stream` in both `server.ts` and
`functions/src/index.ts`. It accepts `{ text: string }` only; the server trims
and rejects empty text or text over 240 characters. The endpoint owns the fixed
`gemini-3.1-flash-tts-preview` model, `Sulafat` voice, Spanish-Mexico
instruction, 24 kHz PCM configuration, 12-second upstream timeout, and no
retry. The browser cannot select a model, voice, or arbitrary configuration.

### Voice character: restrained Monterrey style

The fixed speech instruction asks for clear Mexican Spanish with a subtle,
friendly Monterrey/northern-Mexico register: warm, direct, confident, and
spoken at an operational pace. It may use a light regional cadence, but avoids
slang, exaggerated pronunciation, stereotypes, or a caricatured "ranchero"
voice. The wording of the operational message remains concise and factual;
voice character changes delivery, not the risk decision or the message text.

Gemini TTS controls its synthetic rendering, so the application can request
this style but cannot guarantee that every response will sound identically
regional. Manual QA must compare the acknowledgement and final risk sentence
on the target TV speakers, then tune the fixed instruction if its regional
character is too weak or too theatrical.

The endpoint uses the installed SDK's `generateContentStream` API and writes
one newline-delimited JSON event per audio chunk:

```ts
type SpeechStreamEvent =
  | { type: 'audio'; data: string }
  | { type: 'done' }
  | { type: 'error'; message: string };
```

Responses use `application/x-ndjson`, `Cache-Control: no-store`, and terminate
when the client disconnects. The generic `/api/ai/generate` route and shared
allowlist remain unchanged; they continue to serve structured text and legacy
full-response TTS cache requests.

### Client playback

Replace final-response playback's full-base64 wait with a PCM scheduler. It
reads NDJSON chunks from `fetch`, decodes base64 PCM into 24 kHz mono buffers,
and schedules adjacent buffers on the existing `AudioContext`. It waits for a
120 ms initial buffer before starting, then keeps a scheduling cursor so chunks
do not overlap or gap. `voiceTurnRef` remains the cancellation authority: a
new turn aborts fetch, stops scheduled sources, clears queued chunks, and
ignores late chunks.

If streaming emits an error, ends without audio, cannot decode PCM, or reaches
the 4-second first-audio timeout, the client cancels it and calls `speakFastLocal` with
the already validated short final message. It does not retry Gemini or wait for
`getSpokenAudio`. The existing exact-text cache remains responsible only for
acknowledgement prefetch and legacy full-response callers.

### Timing metrics and production verification

Use `performance.now()` only in memory for `recognitionEndToHudMs` and
`hudToFirstAudioMs`. Surface them through development console diagnostics; do
not attach transcripts, order data, user IDs, or metrics to analytics,
Firestore, or an API request.

Cloud Functions and Hosting can buffer response streams depending on deployment
path. Local streaming correctness is necessary but not sufficient: production
verification must confirm first audio arrives before final `done`. If production
buffers chunks, retain the immediate HUD and natural acknowledgement but do not
claim streamed final audio until delivery is changed and reverified.

## Failure handling

- Invalid Gemini risk JSON preserves prior TV focus and shows the existing
  user-safe AI error.
- Failed acknowledgement prefetch is silent; the visual analysing state remains.
- A failed final audio stream falls back once to browser speech synthesis.
- A later turn always wins over acknowledgement, stream, fallback speech, and
  stale HUD audio callbacks.
- No raw audio, text, Gemini error body, or order catalogue is logged to users.

## Validation

- Unit-test NDJSON parsing, 240-character request validation, first-buffer
  scheduling, cancellation, zero-audio failure, and first-chunk metrics.
- Unit-test acknowledgement timing: it plays after 450 ms only if preloaded,
  and cannot delay or overlap final speech.
- Manually assess the acknowledgement and final risk sentence for a subtle,
  intelligible Monterrey-style delivery; confirm it is natural at TV volume and
  does not make operational terminology harder to understand.
- Keep risk-selection/focus tests and TypeScript gate green.
- Manual local test with `npm run dev:full`: slow a risk query, verify immediate
  HUD, acknowledgement behavior, first audio before `done`, interruption with
  a second microphone turn, and native fallback.
- After explicit release authorization, verify deployed streaming with a real
  authenticated Gemini/Odoo query and record whether chunked first audio arrives
  before the final event.
