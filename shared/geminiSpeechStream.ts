import type { GenerateContentParameters } from '@google/genai';

export const SPEECH_STREAM_MAX_CHARS = 240;
export const SPEECH_STREAM_TIMEOUT_MS = 12_000;

const SPEECH_STREAM_ERROR_MESSAGE = 'No se pudo generar el audio.';

export type SpeechStreamEvent =
  | { type: 'audio'; data: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export function validateSpeechStreamBody(body: unknown):
  | { ok: true; text: string }
  | { ok: false; status: 400; error: string } {
  if (typeof body !== 'object' || body === null || !('text' in body) || typeof body.text !== 'string') {
    return { ok: false, status: 400, error: 'El texto es obligatorio.' };
  }

  const text = body.text.trim();
  if (text.length === 0) {
    return { ok: false, status: 400, error: 'El texto no puede estar vacío.' };
  }
  if (text.length > SPEECH_STREAM_MAX_CHARS) {
    return { ok: false, status: 400, error: 'El texto excede el límite permitido.' };
  }
  return { ok: true, text };
}

export function buildSpeechStreamRequest(text: string, abortSignal: AbortSignal): GenerateContentParameters {
  return {
    model: 'gemini-3.1-flash-tts-preview',
    contents: {
      parts: [{
        text: `Habla el siguiente texto en español mexicano claro, con una cadencia norteña cálida y sutil de Monterrey. Mantén un ritmo operativo directo y seguro. No uses jerga, estereotipos, pronunciación exagerada ni caricaturas. No leas estas instrucciones.\n\nTexto a decir:\n${text}`,
      }],
    },
    config: {
      responseModalities: ['AUDIO'],
      responseMimeType: 'audio/L16;rate=24000',
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Sulafat' },
        },
      },
      abortSignal,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function extractSpeechAudio(chunk: unknown): string | null {
  if (!isRecord(chunk) || !Array.isArray(chunk.candidates)) return null;
  const candidate = chunk.candidates[0];
  if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) return null;

  for (const part of candidate.content.parts) {
    if (!isRecord(part) || !isRecord(part.inlineData) || typeof part.inlineData.data !== 'string') continue;
    if (part.inlineData.data.length > 0) return part.inlineData.data;
  }
  return null;
}

export function serializeSpeechStreamEvent(event: SpeechStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

export type SpeechStreamEventWriter = (event: SpeechStreamEvent) => void | Promise<void>;

class SpeechStreamAbortedError extends Error {}

function abortPromise(signal: AbortSignal): { promise: Promise<never>; dispose: () => void } {
  let listener: (() => void) | undefined;
  const promise = new Promise<never>((_, reject) => {
    if (signal.aborted) {
      reject(new SpeechStreamAbortedError());
      return;
    }
    listener = () => reject(new SpeechStreamAbortedError());
    signal.addEventListener('abort', listener, { once: true });
  });
  return {
    promise,
    dispose: () => {
      if (listener) signal.removeEventListener('abort', listener);
    },
  };
}

/** Pumps provider chunks through a transport-owned writer without exposing provider errors. */
export async function pipeGeminiSpeechStream(
  stream: AsyncIterable<unknown>,
  writeEvent: SpeechStreamEventWriter,
  abortController: AbortController,
  timeoutMs = SPEECH_STREAM_TIMEOUT_MS,
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const aborted = abortPromise(abortController.signal);
  const consume = async (): Promise<void> => {
    for await (const chunk of stream) {
      if (abortController.signal.aborted) throw new SpeechStreamAbortedError();
      const audio = extractSpeechAudio(chunk);
      if (audio) await writeEvent({ type: 'audio', data: audio });
    }
    if (abortController.signal.aborted) throw new SpeechStreamAbortedError();
    await writeEvent({ type: 'done' });
  };

  try {
    const timedOut = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        abortController.abort();
        reject(new SpeechStreamAbortedError());
      }, timeoutMs);
    });
    await Promise.race([consume(), timedOut, aborted.promise]);
  } catch {
    await writeEvent({ type: 'error', message: SPEECH_STREAM_ERROR_MESSAGE });
  } finally {
    if (timeout) clearTimeout(timeout);
    aborted.dispose();
  }
}
