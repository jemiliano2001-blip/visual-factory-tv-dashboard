/**
 * Candidatas de clave SAT para una descripción, sin IA: Mary-first (lista OHD), luego
 * catálogo oficial con umbral más alto. Recibe el catálogo oficial como argumento para que
 * el navegador lo cargue bajo demanda y el servidor lo importe estáticamente.
 */
import { rankMaryCandidates, suggestSatOhdCode, type SatRanked as MaryRanked } from './satOhd';
import { normalizeSatText } from './satText';

export type SatCatalog = ReadonlyArray<readonly [code: string, name: string]>;
export interface SatCandidate { code: string; name: string; score: number }
export interface SatRanked { code: string; name: string; score: number; source: 'mary' | 'official' }
export interface SatChoices {
  suggested: string | null;
  maryCandidates: SatRanked[];
  officialCandidates: SatRanked[];
  /** @deprecated usar officialCandidates; se mantiene vacío o espejo para callers viejos en migración */
  candidates?: SatCandidate[];
}

export const OFFICIAL_MIN_SCORE = 25;
/** Tokens de industria ajena: se excluyen del oficial salvo que también vengan en la descripción. */
export const SAT_OFFICIAL_BLOCKLIST = ['PETROLEO', 'HIDROCARB', 'COMBUSTIBLE'] as const;

const STOP = new Set(('DE DEL LA LAS LOS EL CON SIN POR PARA UNA UNO UNOS UNAS EN Y O A AL SE QUE INCLUYE ' +
  'PZA PIEZA PIEZAS FAB DIS DISENO').split(' '));
const GENERIC = new Set(('MAQUINA EQUIPO EQUIPOS SERVICIO SERVICIOS HERRAMIENTA HERRAMIENTAS ACCESORIO ' +
  'ACCESORIOS COMPONENTE COMPONENTES SISTEMA SISTEMAS DISPOSITIVO DISPOSITIVOS SUMINISTRO SUMINISTROS').split(' '));
const MAX_WORDS = 30;

const stem = (w: string) => (w.length > 4 ? w.replace(/(ES|S)$/, '') : w);

function words(text: string): string[] {
  return normalizeSatText(text).split(' ')
    .filter(w => w.length >= 3 && !/\d/.test(w) && !STOP.has(w))
    .map(stem);
}

const isGeneric = (w: string) => GENERIC.has(w) || [...GENERIC].some(g => stem(g) === w);

const indexCache = new WeakMap<SatCatalog, string[][]>();
function indexOf(catalog: SatCatalog): string[][] {
  let idx = indexCache.get(catalog);
  if (!idx) { idx = catalog.map(([, name]) => words(name)); indexCache.set(catalog, idx); }
  return idx;
}

function hasPair(entry: string[], a: string, b: string) {
  for (let i = 0; i < entry.length - 1; i++) if (entry[i] === a && entry[i + 1] === b) return true;
  return false;
}

function blockedOfficial(name: string, description: string): boolean {
  const n = normalizeSatText(name);
  const d = normalizeSatText(description);
  for (const token of SAT_OFFICIAL_BLOCKLIST) {
    if (n.includes(token) && !d.includes(token)) return true;
  }
  return false;
}

export function suggestSatCandidates(description: string, catalog: SatCatalog, limit = 3, minScore = OFFICIAL_MIN_SCORE): SatCandidate[] {
  const q = words(description).slice(0, MAX_WORDS);
  if (q.length === 0) return [];
  const qSet = new Set(q);
  const idx = indexOf(catalog);
  const found: SatCandidate[] = [];
  catalog.forEach(([code, name], i) => {
    if (blockedOfficial(name, description)) return;
    const entry = idx[i];
    let score = 0;
    let specific = 0;
    let unmatched = 0;
    for (const w of new Set(entry)) {
      if (!qSet.has(w)) { unmatched++; continue; }
      if (isGeneric(w)) score += 2; else { score += 10; specific++; }
    }
    if (specific === 0) return;
    for (let k = 0; k < q.length - 1; k++) if (hasPair(entry, q[k], q[k + 1])) score += 15;
    score -= 0.5 * unmatched;
    if (score >= minScore) found.push({ code, name, score: Math.round(score * 10) / 10 });
  });
  found.sort((a, b) => b.score - a.score || a.name.length - b.name.length || (a.code < b.code ? -1 : 1));
  return found.slice(0, limit);
}

const asMary = (r: MaryRanked): SatRanked => ({ code: r.code, name: r.name, score: r.score, source: 'mary' });

export function satChoicesFor(description: string, catalog: SatCatalog | null): SatChoices {
  const maryCandidates = rankMaryCandidates(description, 5).map(asMary);
  const suggested = suggestSatOhdCode(description);
  if (maryCandidates.length > 0 || !catalog) {
    return { suggested, maryCandidates, officialCandidates: [] };
  }
  const officialCandidates = suggestSatCandidates(description, catalog, 3).map(c => ({
    ...c, source: 'official' as const,
  }));
  return { suggested: null, maryCandidates: [], officialCandidates };
}
