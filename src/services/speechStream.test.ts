import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PcmStreamScheduler,
  parseSpeechStreamLines,
  playGeminiSpeechStream,
  type AudioBufferLike,
  type AudioBufferSourceLike,
  type AudioContextLike,
  type FetchLike,
} from './speechStream.ts';

const encoder = new TextEncoder();

class FakeAudioBuffer implements AudioBufferLike {
  readonly channels: Float32Array[];

  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel];
  }
}

class FakeAudioSource implements AudioBufferSourceLike {
  buffer: AudioBufferLike | null = null;
  onended: ((event: Event) => void) | null = null;
  startTimes: number[] = [];
  stopped = false;

  connect(_destination: AudioNode): AudioBufferSourceLike {
    return this;
  }

  start(when = 0): void {
    this.startTimes.push(when);
  }

  stop(): void {
    this.stopped = true;
  }

  end(): void {
    this.onended?.(new Event('ended'));
  }
}

class FakeAudioContext implements AudioContextLike {
  currentTime = 0;
  state: AudioContextState;
  readonly destination = {} as AudioNode;
  readonly sources: FakeAudioSource[] = [];
  resumeCalls = 0;
  private resumeResolver: (() => void) | null = null;

  constructor(state: AudioContextState = 'running') {
    this.state = state;
  }

  resume(): Promise<void> {
    this.resumeCalls += 1;
    if (this.state !== 'suspended') return Promise.resolve();
    return new Promise(resolve => {
      this.resumeResolver = () => {
        this.state = 'running';
        resolve();
      };
    });
  }

  resolveResume(): void {
    this.resumeResolver?.();
    this.resumeResolver = null;
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBufferLike {
    return new FakeAudioBuffer(numberOfChannels, length, sampleRate);
  }

  createBufferSource(): AudioBufferSourceLike {
    const source = new FakeAudioSource();
    this.sources.push(source);
    return source;
  }
}

function pcmBase64(sampleCount: number): string {
  return Buffer.alloc(sampleCount * 2).toString('base64');
}

function streamFromLines(...lines: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
}

function responseFor(...lines: string[]): Response {
  return new Response(streamFromLines(...lines), {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

function options(audioContext = new FakeAudioContext()) {
  return {
    audioContext,
    getIdToken: async () => 'token-prueba',
    decodePcm: (base64: string) => new Float32Array(Buffer.from(base64, 'base64').length / 2),
  };
}

test('parseSpeechStreamLines conserva NDJSON dividido y entrega solo eventos completos', () => {
  const first = parseSpeechStreamLines(encoder.encode('{"type":"audio","data":"QU'), '');
  assert.deepEqual(first.events, []);
  assert.equal(first.remainder, '{"type":"audio","data":"QU');

  const second = parseSpeechStreamLines(encoder.encode('JD"}\n{"type":"done"}\n'), first.remainder);
  assert.deepEqual(second.events, [
    { type: 'audio', data: 'QUJD' },
    { type: 'done' },
  ]);
  assert.equal(second.remainder, '');
});

test('parseSpeechStreamLines rechaza eventos con forma inválida', () => {
  assert.throws(
    () => parseSpeechStreamLines(encoder.encode('{"type":"audio","data":""}\n'), ''),
    /audio válido/i,
  );
  assert.throws(
    () => parseSpeechStreamLines(encoder.encode('{"type":"done"'), '', true),
    /NDJSON/i,
  );
});

test('PcmStreamScheduler espera 120 ms y programa PCM de forma contigua', () => {
  const audioContext = new FakeAudioContext();
  const scheduler = new PcmStreamScheduler(audioContext);

  scheduler.enqueue(new Float32Array(1_920)); // 80 ms
  assert.equal(audioContext.sources.length, 0);

  scheduler.enqueue(new Float32Array(1_440)); // 60 ms; 140 ms acumulados
  assert.equal(audioContext.sources.length, 2);
  assert.equal(audioContext.sources[0].startTimes[0], 0.02);
  assert.equal(audioContext.sources[1].startTimes[0], 0.1);
});

test('reanuda el AudioContext antes de programar y anunciar el primer audio', async () => {
  const audioContext = new FakeAudioContext('suspended');
  let firstAudioCalls = 0;
  const fetchImpl: FetchLike = async () => responseFor(
    `{"type":"audio","data":"${pcmBase64(2_880)}"}\n`,
    '{"type":"done"}\n',
  );
  const playback = playGeminiSpeechStream('Pedido listo', {
    ...options(audioContext),
    fetchImpl,
    onFirstAudio: () => { firstAudioCalls += 1; },
  });

  await new Promise<void>(resolve => setTimeout(resolve, 0));
  assert.equal(audioContext.resumeCalls, 1);
  assert.equal(audioContext.sources.length, 0);
  assert.equal(firstAudioCalls, 0);

  audioContext.resolveResume();
  await playback.promise;

  assert.equal(audioContext.sources.length, 1);
  assert.equal(firstAudioCalls, 1);
});

test('cancelar durante resume impide fetch, fuentes y falso primer audio', async () => {
  const audioContext = new FakeAudioContext('suspended');
  let fetchCalls = 0;
  let firstAudioCalls = 0;
  const fetchImpl: FetchLike = async () => {
    fetchCalls += 1;
    return responseFor(
      `{"type":"audio","data":"${pcmBase64(2_880)}"}\n`,
      '{"type":"done"}\n',
    );
  };
  const playback = playGeminiSpeechStream('Pedido listo', {
    ...options(audioContext),
    fetchImpl,
    onFirstAudio: () => { firstAudioCalls += 1; },
  });

  await new Promise<void>(resolve => setTimeout(resolve, 0));
  playback.cancel();
  await assert.rejects(playback.promise, /cancelada/i);
  audioContext.resolveResume();

  assert.equal(fetchCalls, 0);
  assert.equal(audioContext.sources.length, 0);
  assert.equal(firstAudioCalls, 0);
});

test('cancelar aborta la solicitud y detiene todas las fuentes creadas', async () => {
  const audioContext = new FakeAudioContext();
  let fetchSignal: AbortSignal | undefined;
  const fetchImpl: FetchLike = async (_input, init) => {
    fetchSignal = init?.signal ?? undefined;
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`{"type":"audio","data":"${pcmBase64(2_880)}"}\n`));
      },
    }), { status: 200 });
  };
  const playback = playGeminiSpeechStream('Pedido listo', { ...options(audioContext), fetchImpl });

  await new Promise<void>(resolve => setTimeout(resolve, 0));
  playback.cancel();

  await assert.rejects(playback.promise, /cancelada/i);
  assert.equal(fetchSignal?.aborted, true);
  assert.ok(audioContext.sources.every(source => source.stopped));
});

test('done sin audio rechaza la reproducción', async () => {
  const fetchImpl: FetchLike = async () => responseFor('{"type":"done"}\n');
  const playback = playGeminiSpeechStream('Sin audio', { ...options(), fetchImpl });

  await assert.rejects(playback.promise, /sin audio/i);
});

test('un error del proveedor rechaza la reproducción', async () => {
  const fetchImpl: FetchLike = async () => responseFor('{"type":"error","message":"falló"}\n');
  const playback = playGeminiSpeechStream('Con error', { ...options(), fetchImpl });

  await assert.rejects(playback.promise, /proveedor/i);
});

test('expira si no se programa el primer audio a tiempo', async () => {
  const fetchImpl: FetchLike = async () => new Response(new ReadableStream<Uint8Array>({
    start() {
      // El lector queda abierto hasta que el AbortController cancele la operación.
    },
  }), { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
  const playback = playGeminiSpeechStream('Esperando audio', {
    ...options(),
    fetchImpl,
    firstAudioTimeoutMs: 5,
  });

  await assert.rejects(playback.promise, /tiempo de espera/i);
});
