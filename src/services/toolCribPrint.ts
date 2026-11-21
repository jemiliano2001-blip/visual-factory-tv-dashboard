/** Estado de impresión de una partida Tool Crib (puro, probado). */
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { DrawingResolution } from './toolCribMatching';
import { printedKey, type PrintedInfo } from './toolCribPrintIndex';

/** Copias por defecto al imprimir; la Fase 3 la sustituye por la config de la cuenta. */
export const DEFAULT_COPIES = 2;

export type PrintState =
  | { kind: 'printed'; at: string | null; byUid: string | null; count: number }
  | { kind: 'ready' }
  | { kind: 'no-pdf' }
  | { kind: 'ambiguous' }
  | { kind: 'none' };

export function printStateForLine(
  resolution: DrawingResolution,
  printed: Map<string, PrintedInfo>,
  orderRef: string,
): PrintState {
  if (resolution.kind === 'none') return { kind: 'none' };
  if (resolution.kind === 'ambiguous') return { kind: 'ambiguous' };
  if (!resolution.view.pdfUrl) return { kind: 'no-pdf' };
  const info = printed.get(printedKey(orderRef, resolution.view.partId));
  return info ? { kind: 'printed', at: info.printedAtUTC, byUid: info.printedByUid, count: info.count } : { kind: 'ready' };
}

export function formatPrintedLabel(state: Extract<PrintState, { kind: 'printed' }>, myUid: string | null): string {
  const date = state.at ? ` ${format(new Date(state.at), 'd MMM', { locale: es }).replace('.', '')}` : '';
  const who = myUid && state.byUid === myUid ? ' · tú' : '';
  const times = state.count > 1 ? ` (×${state.count})` : '';
  return `Impreso${date}${who}${times}`;
}
