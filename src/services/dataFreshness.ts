/**
 * Cálculo puro de frescura de datos Odoo (reloj legible + edad relativa + alerta
 * de datos obsoletos tras perder ≥ 2 ciclos de sondeo de 5 minutos).
 */
import { format } from 'date-fns';

export const STALE_THRESHOLD_MS = 10 * 60 * 1000;

export interface DataFreshness {
  clock: string;
  relative: string;
  stale: boolean;
  ageMs: number;
}

export function formatDataFreshness(
  iso: string | null | undefined,
  nowMs: number = Date.now(),
): DataFreshness | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  const ts = parsed.getTime();
  if (Number.isNaN(ts)) return null;

  const ageMs = Math.max(0, nowMs - ts);
  const mins = Math.floor(ageMs / 60_000);

  let relative: string;
  if (mins < 1) {
    relative = 'ahora';
  } else if (mins === 1) {
    relative = 'hace 1 min';
  } else if (mins < 60) {
    relative = `hace ${mins} min`;
  } else {
    const hours = Math.floor(mins / 60);
    if (hours < 24) {
      relative = hours === 1 ? 'hace 1 h' : `hace ${hours} h`;
    } else {
      const days = Math.floor(hours / 24);
      relative = days === 1 ? 'hace 1 día' : `hace ${days} días`;
    }
  }

  return {
    clock: format(parsed, 'HH:mm'),
    relative,
    stale: ageMs >= STALE_THRESHOLD_MS,
    ageMs,
  };
}
