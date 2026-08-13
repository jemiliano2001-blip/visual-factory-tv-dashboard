import type { SpeechStreamEvent } from '../../shared/geminiSpeechStream';
import { getIdTokenOrThrow } from '../firebase';

const PROXY_BASE = import.meta.env?.VITE_ODOO_PROXY_URL || '';
const PCM_SAMPLE_RATE = 24_000;
const PCM_START_BUFFER_SECONDS = 0.12;
const PCM_SCHEDULE_LEAD_SECONDS = 0.02;

export const FIRST_AUDIO_TIMEOUT_MS = 4_000;

export interface AudioBufferLike {
  readonly duration: number;
  getChannelData(channel: number): Float32Array;
}

export interface AudioBufferSourceLike {
  buffer: AudioBufferLike | null;
  onended: ((event: Event) => void) | null;
  connect(destination: AudioNode): unknown;
  start(when?: number): void;
  stop(): void;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly destination: AudioNode;
  readonly state: AudioContextState;
  resume(): Promise<void>;
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBufferLike;
  createBufferSource(): AudioBufferSourceLike;
}

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface ParsedSpeechStreamLines {
  events: SpeechStreamEvent[];
  remainder: string;
}

export interface PcmStreamSchedulerOptions {
  onFirstAudio?: () => void;
  onEnded?: () => void;
}

export interface SpeechStreamPlaybackOptions {
  audioContext?: AudioContextLike;
  fetchImpl?: FetchLike;
  getIdToken?: () => Promise<string>;
  decodePcm?: (base64: string) => Float32Array;
  onFirstAudio?: () => void;
  onEnded?: () => void;
  firstAudioTimeoutMs?: number;
}

export interface SpeechStreamPlayback {
  promise: Promise<void>;
  cancel: () => void;
}

class SpeechStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpeechStreamError';
  }
}

class SpeechStreamCancelledError extends SpeechStreamError {
  constructor() {
    super('La reproducción de voz fue cancelada.');
  }
}

function parseSpeechStreamEvent(value: unknown): SpeechStreamEvent {
  if (typeof value !== 'object' || value === null || !('type' in value) || typeof value.type !== 'string') {
    throw new SpeechStreamError('El servidor envió un evento de audio inválido.');
  }

  const keys = Object.keys(value);

  if (value.type === 'audio') {
    const data = 'data' in value ? value.data : undefined;
    if (
      keys.length !== 2
      || typeof data !== 'string'
      || data.length === 0
      || data.length % 4 !== 0
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)
    ) {
      throw new SpeechStreamError('El servidor envió un evento de audio válido sin datos.');
    }
    return { type: 'audio', data };
  }

  if (value.type === 'done') {
    if (keys.length !== 1) throw new SpeechStreamError('El servidor envió un evento de audio inválido.');
    return { type: 'done' };
  }

  if (value.type === 'error') {
    if (
      keys.length !== 2
      || !('message' in value)
      || typeof value.message !== 'string'
      || value.message.trim().length === 0
    ) {
      throw new SpeechStreamError('El proveedor devolvió un error de audio inválido.');
    }
    throw new SpeechStreamError('El proveedor no pudo generar el audio.');
  }

  throw new SpeechStreamError('El servidor envió un evento de audio inválido.');
}

/** Decodifica líneas NDJSON completas y conserva la línea parcial para el siguiente chunk. */
export function parseSpeechStreamLines(
  chunk: Uint8Array,
  remainder: string,
  isFinal = false,
): ParsedSpeechStreamLines {
  const combined = remainder + new TextDecoder().decode(chunk);
  const lines = combined.split('\n');
  const trailing = lines.pop() ?? '';
  const completeLines = isFinal && trailing.length > 0 ? [...lines, trailing] : lines;
  const events: SpeechStreamEvent[] = [];

  for (const line of completeLines) {
    if (line.trim().length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new SpeechStreamError('El servidor envió NDJSON de audio inválido.');
    }
    events.push(parseSpeechStreamEvent(parsed));
  }

  return { events, remainder: isFinal ? '' : trailing };
}

/** Decodifica PCM mono de 16 bits, little-endian, a muestras Web Audio normalizadas. */
export function decodePcm16Mono(base64: string): Float32Array {
  if (typeof window === 'undefined' || typeof window.atob !== 'function') {
    throw new SpeechStreamError('Este navegador no puede decodificar el audio de voz.');
  }

  let bytes: string;
  try {
    bytes = window.atob(base64);
  } catch {
    throw new SpeechStreamError('El audio recibido no se pudo decodificar.');
  }
  if (bytes.length === 0 || bytes.length % 2 !== 0) {
    throw new SpeechStreamError('El audio recibido no se pudo decodificar.');
  }

  const samples = new Float32Array(bytes.length / 2);
  for (let index = 0; index < samples.length; index += 1) {
    const offset = index * 2;
    const unsigned = bytes.charCodeAt(offset) | (bytes.charCodeAt(offset + 1) << 8);
    const signed = unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned;
    samples[index] = signed / 32768;
  }
  return samples;
}

export class PcmStreamScheduler {
  private readonly queued: Float32Array[] = [];
  private readonly sources: AudioBufferSourceLike[] = [];
  private readonly activeSources = new Set<AudioBufferSourceLike>();
  private nextStartTime = 0;
  private started = false;
  private inputFinished = false;
  private cancelled = false;
  private endedNotified = false;

  constructor(
    private readonly audioContext: AudioContextLike,
    private readonly options: PcmStreamSchedulerOptions = {},
  ) {}

  enqueue(samples: Float32Array): void {
    if (this.cancelled || samples.length === 0) return;
    this.queued.push(samples);
    this.flush();
  }

  finish(): void {
    if (this.cancelled) return;
    this.inputFinished = true;
    this.flush(true);
    this.notifyEndedIfComplete();
  }

  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.queued.length = 0;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Una fuente ya terminada puede rechazar stop(); igualmente queda cancelada.
      }
    }
    this.activeSources.clear();
  }

  private flush(force = false): void {
    if (this.cancelled || this.queued.length === 0) return;
    if (!force && !this.started && this.queuedDuration() < PCM_START_BUFFER_SECONDS) return;

    while (this.queued.length > 0 && !this.cancelled) {
      const samples = this.queued.shift();
      if (!samples) continue;
      const buffer = this.audioContext.createBuffer(1, samples.length, PCM_SAMPLE_RATE);
      buffer.getChannelData(0).set(samples);

      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext.destination);
      const startAt = Math.max(this.nextStartTime, this.audioContext.currentTime + PCM_SCHEDULE_LEAD_SECONDS);
      this.nextStartTime = startAt + buffer.duration;
      this.sources.push(source);
      this.activeSources.add(source);
      source.onended = () => {
        this.activeSources.delete(source);
        this.notifyEndedIfComplete();
      };
      source.start(startAt);

      if (!this.started) {
        this.started = true;
        this.options.onFirstAudio?.();
      }
    }
  }

  private queuedDuration(): number {
    return this.queued.reduce((duration, samples) => duration + samples.length / PCM_SAMPLE_RATE, 0);
  }

  private notifyEndedIfComplete(): void {
    if (
      !this.cancelled
      && !this.endedNotified
      && this.inputFinished
      && this.sources.length > 0
      && this.activeSources.size === 0
    ) {
      this.endedNotified = true;
      this.options.onEnded?.();
    }
  }
}

let defaultAudioContext: AudioContextLike | null = null;

function createDefaultAudioContext(): AudioContextLike {
  if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') {
    throw new SpeechStreamError('Este navegador no puede reproducir el audio de voz.');
  }
  if (!defaultAudioContext) {
    defaultAudioContext = new window.AudioContext({ sampleRate: PCM_SAMPLE_RATE });
  }
  return defaultAudioContext;
}

function waitForAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(new SpeechStreamCancelledError());
      return;
    }
    signal.addEventListener('abort', () => reject(new SpeechStreamCancelledError()), { once: true });
  });
}

async function raceWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return Promise.race([operation, waitForAbort(signal)]);
}

async function ensureAudioContextReady(audioContext: AudioContextLike, signal: AbortSignal): Promise<void> {
  if (audioContext.state === 'suspended') {
    await raceWithAbort(audioContext.resume(), signal);
  }
  if (audioContext.state !== 'running') {
    throw new SpeechStreamError('No se pudo activar el audio de voz.');
  }
}

function userFacingError(error: unknown, cancelled: boolean, timeoutError: SpeechStreamError | null): SpeechStreamError {
  if (timeoutError) return timeoutError;
  if (cancelled || error instanceof SpeechStreamCancelledError) return new SpeechStreamCancelledError();
  if (error instanceof SpeechStreamError) return error;
  return new SpeechStreamError('No se pudo reproducir el audio de voz.');
}

export function playGeminiSpeechStream(text: string, options: SpeechStreamPlaybackOptions = {}): SpeechStreamPlayback {
  const controller = new AbortController();
  const audioContext = options.audioContext ?? createDefaultAudioContext();
  const scheduler = new PcmStreamScheduler(audioContext, {
    onFirstAudio: () => {
      firstAudioScheduled = true;
      if (timer) clearTimeout(timer);
      options.onFirstAudio?.();
    },
    onEnded: options.onEnded,
  });
  const fetchImpl = options.fetchImpl ?? fetch;
  const getToken = options.getIdToken ?? getIdTokenOrThrow;
  const decodePcm = options.decodePcm ?? decodePcm16Mono;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let cancelled = false;
  let firstAudioScheduled = false;
  let timeoutError: SpeechStreamError | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  const cancel = (): void => {
    if (cancelled) return;
    cancelled = true;
    clearTimer();
    controller.abort();
    scheduler.cancel();
    void reader?.cancel().catch(() => undefined);
  };

  let completed = false;
  const promise = (async (): Promise<void> => {
    timer = setTimeout(() => {
      if (firstAudioScheduled || cancelled) return;
      timeoutError = new SpeechStreamError('Se agotó el tiempo de espera para recibir el primer audio.');
      controller.abort();
      scheduler.cancel();
      void reader?.cancel().catch(() => undefined);
    }, options.firstAudioTimeoutMs ?? FIRST_AUDIO_TIMEOUT_MS);

    try {
      await ensureAudioContextReady(audioContext, controller.signal);
      const token = await raceWithAbort(getToken(), controller.signal);
      const response = await raceWithAbort(
        fetchImpl(`${PROXY_BASE}/api/ai/speech-stream`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        }),
        controller.signal,
      );
      if (!response.ok) {
        throw new SpeechStreamError(`No se pudo generar el audio (HTTP ${response.status}).`);
      }
      if (!response.body) {
        throw new SpeechStreamError('El servidor no devolvió audio para reproducir.');
      }

      reader = response.body.getReader();
      let remainder = '';
      let receivedAudio = false;
      let receivedDone = false;

      const handleEvent = async (event: SpeechStreamEvent): Promise<void> => {
        if (receivedDone) throw new SpeechStreamError('El servidor envió datos después de finalizar el audio.');
        if (event.type === 'audio') {
          let samples: Float32Array;
          try {
            samples = decodePcm(event.data);
          } catch {
            throw new SpeechStreamError('El audio recibido no se pudo decodificar.');
          }
          if (samples.length === 0) throw new SpeechStreamError('El audio recibido no se pudo decodificar.');
          await ensureAudioContextReady(audioContext, controller.signal);
          receivedAudio = true;
          scheduler.enqueue(samples);
          return;
        }
        if (event.type === 'done') receivedDone = true;
      };

      while (true) {
        const next = await raceWithAbort(reader.read(), controller.signal);
        if (next.done) break;
        const parsed = parseSpeechStreamLines(next.value, remainder);
        remainder = parsed.remainder;
        for (const event of parsed.events) await handleEvent(event);
      }

      const finalParsed = parseSpeechStreamLines(new Uint8Array(), remainder, true);
      for (const event of finalParsed.events) await handleEvent(event);

      if (!receivedDone) throw new SpeechStreamError('El servidor terminó el audio sin confirmarlo.');
      if (!receivedAudio) throw new SpeechStreamError('El servidor terminó la respuesta sin audio.');
      scheduler.finish();
      completed = true;
    } catch (error) {
      scheduler.cancel();
      throw userFacingError(error, cancelled, timeoutError);
    } finally {
      clearTimer();
      if (!completed) await reader?.cancel().catch(() => undefined);
      reader?.releaseLock();
    }
  })();

  return { promise, cancel };
}
