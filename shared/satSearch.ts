/**
 * Candidatas de clave SAT para una descripción, sin IA: puntaje por palabras (raíz simple),
 * frases contiguas y palabras específicas. Recibe el catálogo como argumento para que el
 * navegador lo cargue bajo demanda y el servidor lo importe estáticamente.
 */
import { suggestSatOhdCode } from './satOhd';
import { normalizeSatText } from './satText';

export type SatCatalog = ReadonlyArray<readonly [code: string, name: string]>;
export interface SatCandidate { code: string; name: string; score: number }
export interface SatChoices { suggested: string | null; candidates: SatCandidate[] }

const STOP = new Set(('DE DEL LA LAS LOS EL CON SIN POR PARA UNA UNO UNOS UNAS EN Y O A AL SE QUE INCLUYE ' +
  'PZA PIEZA PIEZAS FAB DIS DISENO').split(' '));
const GENERIC = new Set(('MAQUINA EQUIPO EQUIPOS SERVICIO SERVICIOS HERRAMIENTA HERRAMIENTAS ACCESORIO ' +
  'ACCESORIOS COMPONENTE COMPONENTES SISTEMA SISTEMAS DISPOSITIVO DISPOSITIVOS SUMINISTRO SUMINISTROS').split(' '));
const MAX_WORDS = 30;
const MIN_SCORE = 10;

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

export function suggestSatCandidates(description: string, catalog: SatCatalog, limit = 3): SatCandidate[] {
  const q = words(description).slice(0, MAX_WORDS);
  if (q.length === 0) return [];
  const qSet = new Set(q);
  const idx = indexOf(catalog);
  const found: SatCandidate[] = [];
  catalog.forEach(([code, name], i) => {
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
    if (score >= MIN_SCORE) found.push({ code, name, score: Math.round(score * 10) / 10 });
  });
  found.sort((a, b) => b.score - a.score || a.name.length - b.name.length || (a.code < b.code ? -1 : 1));
  return found.slice(0, limit);
}

export function satChoicesFor(description: string, catalog: SatCatalog | null): SatChoices {
  const suggested = suggestSatOhdCode(description);
  if (suggested || !catalog) return { suggested, candidates: [] };
  return { suggested: null, candidates: suggestSatCandidates(description, catalog) };
}
