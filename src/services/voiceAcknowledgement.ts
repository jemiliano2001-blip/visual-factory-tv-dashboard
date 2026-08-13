export const RISK_ACKNOWLEDGEMENT_TEXT = 'Revisando prioridades.';
export const RISK_ACKNOWLEDGEMENT_DELAY_MS = 450;

export function shouldPlayRiskAcknowledgement(input: {
  isRisk: boolean;
  elapsedMs: number;
  audioReady: boolean;
  resultReady: boolean;
}): boolean {
  return input.isRisk
    && input.elapsedMs >= RISK_ACKNOWLEDGEMENT_DELAY_MS
    && input.audioReady
    && !input.resultReady;
}

type VoiceTurnResolution = 'cancelAcknowledgement' | 'startFinalStream';

export function resolveVoiceTurn(input: {
  acknowledgementPlaying: boolean;
  finalMessage: string;
}): readonly VoiceTurnResolution[] {
  const resolution: VoiceTurnResolution[] = [];
  if (input.acknowledgementPlaying) resolution.push('cancelAcknowledgement');
  if (input.finalMessage.trim()) resolution.push('startFinalStream');
  return resolution;
}
