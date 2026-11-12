/** Modos del fondo aurora de la TV. Se alternan con el botón de paleta del header. */
export const AURORA_MODES = ['gemini-flow', 'gemini-reactive', 'oled-minimal'] as const;
export type AuroraMode = typeof AURORA_MODES[number];

export const AURORA_LABEL: Record<AuroraMode, string> = {
  'gemini-flow': 'Aurora',
  'gemini-reactive': 'Aurora reactiva',
  'oled-minimal': 'Mínimo',
};

/** Un valor guardado que ya no existe (o manipulado) cae al modo por defecto. */
export function normalizeAuroraMode(value: unknown): AuroraMode {
  return AURORA_MODES.includes(value as AuroraMode) ? (value as AuroraMode) : 'gemini-flow';
}

export function nextAuroraMode(mode: AuroraMode): AuroraMode {
  return AURORA_MODES[(AURORA_MODES.indexOf(mode) + 1) % AURORA_MODES.length];
}

/** Solo el modo reactivo acelera y mete carmesí, y solo si más de la mitad está vencida. */
export function isAuroraUrgent(mode: AuroraMode, overdueShare: number): boolean {
  return mode === 'gemini-reactive' && overdueShare > 0.5;
}
