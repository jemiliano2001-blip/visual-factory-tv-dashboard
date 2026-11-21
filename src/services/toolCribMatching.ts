/**
 * Ligado partida Tool Crib ↔ plano de la biblioteca. Portado de SMV Vision
 * (`src/lib/matching.ts`, `aliasKey.ts`): mismos umbrales y veto por identificadores.
 * Cambio deliberado: si dos partes distintas empatan en el mejor puntaje, la
 * partida queda "ambigua" en vez de tomar la primera en silencio.
 */
import type { ToolCribLine } from './toolCrib';

export const MIN_BLUEPRINT_MATCH_SCORE = 80;

export interface DrawingView {
  partId: string;
  partNumber: string;
  customer: string;
  description: string;
  drawingId: string;
  revision: string;
  sourcePath: string;
  pdfUrl: string | null;
}

export interface PartAlias {
  id: string;
  pattern: string;
  partNumber: string;
  drawingId: string;
}

export type DrawingResolution =
  | { kind: 'match'; view: DrawingView; via: 'alias' | 'exact' | 'fuzzy'; score: number }
  | { kind: 'ambiguous'; candidates: DrawingView[] }
  | { kind: 'none' };

interface Signals {
  identifiers: string[];
  descriptors: string[];
}

const COMMON_STOP_WORDS = new Set([
  'PART', 'NUMBER', 'DRAWING', 'REV', 'REVISION', 'SUPRAJIT', 'TOOL', 'CRIB', 'PIEZA', 'CODIGO',
  'DETALLE', 'ENSAMBLE', 'ASSEMBLY', 'DETAIL', 'SCALE', 'ESCALA', 'SHEET', 'HOJA', 'CLIENTE', 'CUSTOMER',
  'FABRICACION', 'FABRICAR', 'MAQUINADO', 'MAQUINAR', 'MAQUILA', 'MAQUILADO', 'MODIFICACION', 'MODIFICAR',
  'REPARACION', 'REPARAR', 'RETRABAJO', 'AJUSTE', 'MANTENIMIENTO', 'SERVICIO', 'TRABAJO', 'ELABORACION',
  'PRODUCCION', 'DESARROLLO', 'RECTIFICADO', 'AFILADO', 'CORTE', 'TRATAMIENTO', 'TEMPLE', 'PULIDO',
  'PARA', 'CON', 'POR', 'SIN', 'DEL', 'LOS', 'LAS', 'UNA', 'UNO', 'UNOS', 'UNAS', 'SOBRE', 'ENTRE', 'TIPO',
  'FOR', 'WITH', 'WITHOUT', 'FROM', 'THE', 'AND',
  'TALLER', 'SHOP', 'GENERAL', 'PIEZAS', 'ITEM', 'ITEMS', 'REF', 'LINEA', 'ORDEN', 'PEDIDO', 'SOLICITUD', 'SMV',
]);

/** NFD, mayúsculas, solo A-Z0-9-/. y espacios colapsados. */
export function normalizeAliasKey(pattern: string): string {
  return pattern
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\-/. ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isStrongToken(token: string): boolean {
  return /\d{4,}/.test(token) || (/[A-Z]/.test(token) && /\d/.test(token) && token.length >= 3);
}

function compactPartIdentifier(value: string): string {
  return value.replace(/[^A-Z0-9]/g, '').replace(/REV\d*$/g, '');
}

function symmetryBase(compact: string): string | null {
  const base = compact.replace(/(?:LH|RH|IZQ|DER)$/g, '');
  return base.length >= 5 && /\d/.test(base) && base !== compact ? base : null;
}

function extractPartIdentifiers(value: string): string[] {
  const normalized = normalizeAliasKey(value);
  if (!normalized) return [];
  const ids = new Set<string>();
  const candidates = [
    ...(normalized.match(/[A-Z0-9]+(?:[-/.][A-Z0-9]+)+/g) ?? []),
    ...(normalized.match(/[A-Z0-9]{5,}/g) ?? []),
  ];
  for (const candidate of candidates) {
    const compact = compactPartIdentifier(candidate);
    if (compact.length >= 5 && /\d/.test(compact)) {
      ids.add(compact);
      const base = symmetryBase(compact);
      if (base) ids.add(base);
    }
  }
  return [...ids];
}

function descriptiveTokens(value: string): string[] {
  return normalizeAliasKey(value)
    .split(/[^A-Z0-9]+/g)
    .filter(t => t.length >= 3 && /[A-Z]/.test(t) && !/\d{3,}/.test(t) && !COMMON_STOP_WORDS.has(t));
}

function hasStrongIdentifierMatch(a: string[], b: string[]): boolean {
  return a.some(x => b.some(y => x === y || (Math.min(x.length, y.length) >= 6 && (x.includes(y) || y.includes(x)))));
}

function lineSignals(line: ToolCribLine): Signals {
  const ids = new Set<string>();
  if (line.partNumber) extractPartIdentifiers(line.partNumber).forEach(id => ids.add(id));
  extractPartIdentifiers(line.line.name).forEach(id => ids.add(id));
  return { identifiers: [...ids], descriptors: descriptiveTokens(line.line.name) };
}

function viewSignals(view: DrawingView): Signals {
  const ids = new Set<string>();
  const tokens = new Set<string>();
  for (const text of [view.partNumber, view.description, view.sourcePath]) {
    extractPartIdentifiers(text).forEach(id => ids.add(id));
    descriptiveTokens(text).forEach(t => tokens.add(t));
  }
  return { identifiers: [...ids], descriptors: [...tokens] };
}

function scoreMatch(order: Signals, candidate: Signals): number {
  if (order.identifiers.length > 0 && candidate.identifiers.length > 0) {
    return hasStrongIdentifierMatch(order.identifiers, candidate.identifiers) ? 95 : 0;
  }
  const a = new Set(order.descriptors);
  const b = new Set(candidate.descriptors);
  const shared = [...a].filter(t => b.has(t));
  if (shared.length === 0) return 0;
  const overlap = shared.length / Math.min(a.size, b.size);
  const strong = shared.some(isStrongToken);
  if (overlap === 1 && shared.length >= 2) return 90;
  if (strong && overlap >= 0.6) return 85;
  if (shared.length >= 2 && overlap >= 0.5) return 82;
  if (strong && overlap >= 0.75) return 80;
  return 0;
}

function isIso(view: DrawingView): boolean {
  return view.partNumber.toLowerCase().includes('.iso') || view.sourcePath.toLowerCase().includes('.iso');
}

/** Una vista por parte: si hay varias revisiones activas, la de revisión mayor. */
function collapseByPart(library: readonly DrawingView[]): DrawingView[] {
  const byPart = new Map<string, DrawingView>();
  for (const v of library) {
    const prev = byPart.get(v.partId);
    if (!prev || v.revision > prev.revision) byPart.set(v.partId, v);
  }
  return [...byPart.values()];
}

export function resolveLineDrawing(
  line: ToolCribLine,
  library: readonly DrawingView[],
  aliases: readonly PartAlias[],
): DrawingResolution {
  const views = collapseByPart(library);

  const keys = [line.partNumber ?? '', line.line.name].map(normalizeAliasKey).filter(Boolean);
  const alias = aliases.find(a => keys.includes(normalizeAliasKey(a.pattern)));
  const aliased = alias && views.find(v => v.drawingId === alias.drawingId);
  if (aliased) return { kind: 'match', view: aliased, via: 'alias', score: 100 };
  // Alias a un plano inactivo o borrado = "sin plano" (spec); no se vuelve al ligado automático.
  if (alias) return { kind: 'none' };

  const order = lineSignals(line);
  const scored = views
    .map(view => ({ view, score: scoreMatch(order, viewSignals(view)) }))
    .filter(s => s.score >= MIN_BLUEPRINT_MATCH_SCORE);
  if (scored.length === 0) return { kind: 'none' };

  // ISO primero, como en Vision: si algún ISO pasa el umbral, compite solo entre ISO.
  const iso = scored.filter(s => isIso(s.view));
  const pool = iso.length > 0 ? iso : scored;
  const best = Math.max(...pool.map(s => s.score));
  const top = pool.filter(s => s.score === best);
  if (top.length > 1) {
    return { kind: 'ambiguous', candidates: top.map(s => s.view).sort((a, b) => a.partNumber.localeCompare(b.partNumber)) };
  }
  return { kind: 'match', view: top[0].view, via: best >= 95 ? 'exact' : 'fuzzy', score: best };
}
