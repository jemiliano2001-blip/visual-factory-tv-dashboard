import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SPEECH_STREAM_MAX_CHARS,
  buildSpeechStreamRequest,
  extractSpeechAudio,
  pipeGeminiSpeechStream,
  serializeSpeechStreamEvent,
  validateSpeechStreamBody,
} from './geminiSpeechStream.ts';

test('validateSpeechStreamBody acepta texto recortado y rechaza entradas inseguras', () => {
  assert.deepEqual(validateSpeechStreamBody({ text: '  Pedido listo  ' }), {
    ok: true,
    text: 'Pedido listo',
  });
  assert.equal(validateSpeechStreamBody({ text: '   ' }).ok, false);
  assert.equal(validateSpeechStreamBody({ text: 'x'.repeat(SPEECH_STREAM_MAX_CHARS + 1) }).ok, false);
  assert.equal(validateSpeechStreamBody({ text: 42 }).ok, false);
  assert.equal(validateSpeechStreamBody(null).ok, false);
});

test('buildSpeechStreamRequest fija modelo, voz, audio PCM y la instruccion regional', () => {
  const controller = new AbortController();
  const request = buildSpeechStreamRequest('Pedido listo', controller.signal);
  const config = request.config as {
    responseModalities: string[];
    responseMimeType: string;
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: string } } };
  };
  const contents = request.contents as { parts: Array<{ text: string }> };

  assert.equal(request.model, 'gemini-3.1-flash-tts-preview');
  assert.deepEqual(config.responseModalities, ['AUDIO']);
  assert.equal(config.responseMimeType, 'audio/L16;rate=24000');
  assert.equal(config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Sulafat');
  assert.match(contents.parts[0].text, /Monterrey|norte/i);
  assert.equal('abortSignal' in request, false);
  assert.equal((request.config as { abortSignal?: AbortSignal }).abortSignal, controller.signal);
});

test('extractSpeechAudio solo extrae audio base64 no vacio', () => {
  assert.equal(extractSpeechAudio({
    candidates: [{ content: { parts: [{ text: 'sin audio' }, { inlineData: { data: 'QUJD' } }] } }],
  }), 'QUJD');
  assert.equal(extractSpeechAudio({ candidates: [{ content: { parts: [{ inlineData: { data: '' } }] } }] }), null);
  assert.equal(extractSpeechAudio({ candidates: [{ content: { parts: [{ inlineData: { data: 4 } }] } }] }), null);
  assert.equal(extractSpeechAudio({ candidates: [] }), null);
  assert.equal(extractSpeechAudio(null), null);
});

test('serializeSpeechStreamEvent produce exactamente una linea NDJSON', () => {
  assert.equal(serializeSpeechStreamEvent({ type: 'audio', data: 'QUJD' }), '{"type":"audio","data":"QUJD"}\n');
  assert.equal(serializeSpeechStreamEvent({ type: 'done' }), '{"type":"done"}\n');
});

async function* chunks(...values: unknown[]): AsyncGenerator<unknown> {
  yield* values;
}

test('pipeGeminiSpeechStream conserva el orden de audio y termina una sola vez', async () => {
  const events: Array<{ type: string; data?: string; message?: string }> = [];
  const controller = new AbortController();
  await pipeGeminiSpeechStream(
    chunks(
      { candidates: [{ content: { parts: [{ text: 'ignorar' }] } }] },
      { candidates: [{ content: { parts: [{ inlineData: { data: 'AAA=' } }] } }] },
      { candidates: [{ content: { parts: [{ inlineData: { data: 'BBB=' } }] } }] },
    ),
    event => { events.push(event); },
    controller,
  );
  assert.deepEqual(events, [
    { type: 'audio', data: 'AAA=' },
    { type: 'audio', data: 'BBB=' },
    { type: 'done' },
  ]);
});

test('pipeGeminiSpeechStream oculta errores del proveedor', async () => {
  const events: Array<{ type: string; message?: string }> = [];
  const controller = new AbortController();
  const provider = {
    async *[Symbol.asyncIterator](): AsyncGenerator<unknown> {
      throw new Error('respuesta privada de Gemini');
    },
  };

  await pipeGeminiSpeechStream(provider, event => { events.push(event); }, controller);
  assert.deepEqual(events, [{ type: 'error', message: 'No se pudo generar el audio.' }]);
});

test('pipeGeminiSpeechStream aborta al vencer el timeout', async () => {
  const events: Array<{ type: string; message?: string }> = [];
  const controller = new AbortController();
  const provider = {
    async *[Symbol.asyncIterator](): AsyncGenerator<unknown> {
      await new Promise<void>(resolve => controller.signal.addEventListener('abort', () => resolve(), { once: true }));
    },
  };

  await pipeGeminiSpeechStream(provider, event => { events.push(event); }, controller, 1);
  assert.equal(controller.signal.aborted, true);
  assert.deepEqual(events, [{ type: 'error', message: 'No se pudo generar el audio.' }]);
});
