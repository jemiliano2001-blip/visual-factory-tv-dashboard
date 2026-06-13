/** Resultado de predicción de riesgo por IA (efímero — no se persiste). */
export interface RiskPrediction {
  risk_level: 'low' | 'medium' | 'high';
  issue: string;
  suggestion: string;
  analyzedAt: Date;
}
