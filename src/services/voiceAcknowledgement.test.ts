import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveVoiceTurn,
  shouldPlayRiskAcknowledgement,
} from './voiceAcknowledgement.ts';

test('espera 450 ms antes de reproducir el acknowledgement de una consulta de riesgo pendiente', () => {
  assert.equal(shouldPlayRiskAcknowledgement({
    isRisk: true,
    elapsedMs: 449,
    audioReady: true,
    resultReady: false,
  }), false);
  assert.equal(shouldPlayRiskAcknowledgement({
    isRisk: true,
    elapsedMs: 450,
    audioReady: true,
    resultReady: false,
  }), true);
});

test('no reproduce acknowledgement sin riesgo, sin audio o con el resultado listo', () => {
  assert.equal(shouldPlayRiskAcknowledgement({
    isRisk: false,
    elapsedMs: 450,
    audioReady: true,
    resultReady: false,
  }), false);
  assert.equal(shouldPlayRiskAcknowledgement({
    isRisk: true,
    elapsedMs: 450,
    audioReady: false,
    resultReady: false,
  }), false);
  assert.equal(shouldPlayRiskAcknowledgement({
    isRisk: true,
    elapsedMs: 450,
    audioReady: true,
    resultReady: true,
  }), false);
});

test('cancela el acknowledgement antes de iniciar el stream final', () => {
  assert.deepEqual(resolveVoiceTurn({
    acknowledgementPlaying: true,
    finalMessage: 'La orden prioritaria es 2026/S00142.',
  }), ['cancelAcknowledgement', 'startFinalStream']);
});

test('inicia el stream final directamente cuando no hay acknowledgement reproduciéndose', () => {
  assert.deepEqual(resolveVoiceTurn({
    acknowledgementPlaying: false,
    finalMessage: 'La orden prioritaria es 2026/S00142.',
  }), ['startFinalStream']);
  assert.deepEqual(resolveVoiceTurn({
    acknowledgementPlaying: true,
    finalMessage: '   ',
  }), ['cancelAcknowledgement']);
});
