/**
 * Claves SAT (catálogo de productos y servicios) que usa OHD en sus facturas y remisiones.
 * Fuente: "PRODUCTOS Y SERV. DE OHD (SAT).xlsx" (2026-11). Las palabras clave son las del
 * Excel; la sugerencia es solo una propuesta: el ingeniero la confirma o la cambia.
 */
import { normalizeSatText } from './satText';

export interface SatOhdKey { code: string; name: string; keywords: string[] }

export const SAT_OHD_CATALOG: SatOhdKey[] = [
  { code: '23151607', name: 'Prensas', keywords: [] },
  { code: '23152200', name: 'Mesa y estantes para fabricación', keywords: ['MESA'] },
  { code: '23153000', name: 'Dispositivos y sistemas de guía, posicionamiento y sujeción', keywords: ['FIXTURE'] },
  { code: '23153035', name: 'Placa', keywords: ['PLACA'] },
  { code: '23153100', name: 'Componentes y accesorios de maquinaria industrial', keywords: ['VISAGRA', 'BISAGRA', 'BRACKET', 'POLYTECH'] },
  { code: '23153418', name: 'Accesorios o herramientas para ensamble a la medida', keywords: ['NIDO', 'COPLE', 'BASE CON AJUSTE', 'POLYTECH'] },
  { code: '23241600', name: 'Herramientas cortadoras de metales', keywords: [] },
  { code: '23242120', name: 'Base de tabla de máquina', keywords: ['POLYTECH', 'BASE GIRATORIA'] },
  { code: '23251800', name: 'Troqueles y herramientas para el formado de metales', keywords: ['DADO', 'TROQUEL', 'PUNZON', 'MATRIZ', 'MATRICES', 'MOLDE'] },
  { code: '24101504', name: 'Carretones de mano o accesorios', keywords: ['CARRITO'] },
  { code: '24101700', name: 'Transportadores y accesorios', keywords: ['CINTA TRANSPORTADORA', 'CINTAS TRANSPORTADORAS', 'RODILLO', 'CONVEYOR'] },
  { code: '24141500', name: 'Suministros para seguridad y protección', keywords: ['GUARDA DE LEXAN'] },
  { code: '27111500', name: 'Herramientas de corte y engarzado y punzones', keywords: ['PUNZON', 'NAVAJA'] },
  { code: '27112810', name: 'Equipos para reparar roscas', keywords: [] },
  { code: '27131500', name: 'Herramientas neumáticas', keywords: ['POLYTECH'] },
  { code: '27131703', name: 'Pistones de cilindro neumático', keywords: [] },
  { code: '30103800', name: 'Fibras y filamentos mecánicos', keywords: ['FILAMENTO'] },
  { code: '31133706', name: 'Recubrimiento conformal de acrílico', keywords: ['GUARDA DE ACRILICO', 'GUARDAS DE ACRILICO'] },
  { code: '31161500', name: 'Tornillos', keywords: ['TORNILLO'] },
  { code: '31161700', name: 'Tuercas', keywords: [] },
  { code: '31391500', name: 'Maquinados de precisión estándar', keywords: ['TOPE', 'MECANISMO', 'GAGE', 'REPUESTO', 'FAB DE INTERFACES'] },
  { code: '31391501', name: 'Maquinado de precisión estándar de plástico', keywords: [] },
  { code: '31391502', name: 'Maquinado de precisión estándar de cerámica', keywords: [] },
  { code: '31391503', name: 'Maquinado de precisión estándar de acero', keywords: [] },
  { code: '31391504', name: 'Maquinado de precisión estándar de acero inoxidable', keywords: [] },
  { code: '31391505', name: 'Maquinado de precisión estándar de aluminio', keywords: [] },
  { code: '31391506', name: 'Maquinado de precisión estándar de latón', keywords: [] },
  { code: '31391600', name: 'Maquinados de precisión media', keywords: [] },
  { code: '31391601', name: 'Maquinado de precisión media de plástico', keywords: [] },
  { code: '31391602', name: 'Maquinado de precisión media de cerámica', keywords: [] },
  { code: '31391603', name: 'Maquinado de precisión media de acero', keywords: [] },
  { code: '31391604', name: 'Maquinado de precisión media de acero inoxidable', keywords: [] },
  { code: '31391605', name: 'Maquinado de precisión media de aluminio', keywords: [] },
  { code: '31391606', name: 'Maquinado de precisión media de latón', keywords: [] },
  { code: '31391700', name: 'Maquinados de precisión alta', keywords: [] },
  { code: '31391701', name: 'Maquinado de alta precisión de plástico', keywords: [] },
  { code: '31391702', name: 'Maquinado de alta precisión de cerámica', keywords: [] },
  { code: '31391703', name: 'Maquinado de alta precisión de acero', keywords: [] },
  { code: '31391704', name: 'Maquinado de alta precisión de acero inoxidable', keywords: [] },
  { code: '31391705', name: 'Maquinado de alta precisión de aluminio', keywords: ['PLACA DE ALUMINIO', 'BASE DE ALUMINIO', 'SOPORTE DE ALUMINIO', 'SPACER', 'PIEZAS DE ALUMINIO'] },
  { code: '31391706', name: 'Maquinado de alta precisión de latón', keywords: [] },
  { code: '32151700', name: 'Controladores lógicos programables', keywords: ['PROGRAMACION ESTACION', 'PROGRAMACION DE ESTACION'] },
  { code: '32151900', name: 'Dispositivos de automatización de control de la conectividad', keywords: ['AUTOMATIZACION'] },
  { code: '39101600', name: 'Lámparas y bombillas', keywords: ['LAMPARA'] },
  { code: '39121600', name: 'Dispositivos y accesorios para la protección de circuitos', keywords: ['PORTAFUSIBLE', 'FUSIBLE'] },
  { code: '39121607', name: 'Fusible', keywords: [] },
  { code: '43211900', name: 'Monitores y pantallas de computador', keywords: [] },
  { code: '56111707', name: 'Repisas no modulares', keywords: ['REPISA'] },
  { code: '72151802', name: 'Servicio de refacción y reparación de componentes de maquinaria', keywords: ['POLYTECH', 'REPARACION'] },
  { code: '73152100', name: 'Servicios de mantenimiento y reparación de equipo de manufactura', keywords: ['CAMBIO DE ESTRIADO', 'CAMBIO DE CABLEADO', 'RETRABAJO DE SPROKET', 'RETRABAJO', 'MANTENIMIENTO'] },
  { code: '73152101', name: 'Servicio de mantenimiento de equipo industrial', keywords: ['REP DE ESTACION', 'KOHLER'] },
  { code: '73152102', name: 'Servicio de reparación de equipo industrial', keywords: [] },
  { code: '73152103', name: 'Servicios de mantenimiento de equipos de ingeniería', keywords: [] },
  { code: '73152104', name: 'Servicio de mantenimiento y reparación de equipos para empacar', keywords: [] },
  { code: '73152105', name: 'Refacción de equipos de pruebas', keywords: [] },
  { code: '73152106', name: 'Servicio de mantenimiento y reparación de equipos para calentar y hornear', keywords: [] },
  { code: '73152107', name: 'Servicio de reconstrucción y refacción de equipos maquinados', keywords: [] },
  { code: '73181000', name: 'Servicios de maquinado', keywords: [] },
  { code: '73181900', name: 'Servicios de soldadura', keywords: ['SOLDADURA'] },
  { code: '81101600', name: 'Ingeniería mecánica (diseño)', keywords: ['MEJORA DE CANDADO', 'SISTEMA DE CANDADEO', 'SITEMA DE CANDADEO', 'MODIFICACION DE ESTACION', 'CALIBRACION DE PISTON'] },
  { code: '81101700', name: 'Ingeniería eléctrica y electrónica', keywords: [] },
];

const BY_CODE = new Map(SAT_OHD_CATALOG.map(k => [k.code, k]));

export const isOhdPartner = (partnerName: string) => /\bohd\b|overhead door/i.test(partnerName);
export const isSatOhdCode = (code: unknown): code is string => typeof code === 'string' && BY_CODE.has(code);
export const satOhdName = (code: string) => BY_CODE.get(code)?.name ?? null;

export interface SatRanked { code: string; name: string; score: number; source: 'mary' }

/** Keywords cortas (TOPE=4, PLACA=5) deben contar; el margen evita empates. */
export const MARY_MIN_SCORE = 4;
export const MARY_CLEAR_MARGIN = 3;

const STOP = new Set(('DE DEL LA LAS LOS EL CON SIN POR PARA UNA UNO UNOS UNAS EN Y O A AL SE QUE INCLUYE ' +
  'PZA PIEZA PIEZAS FAB DIS DISENO').split(' '));
const GENERIC = new Set(('MAQUINA EQUIPO EQUIPOS SERVICIO SERVICIOS HERRAMIENTA HERRAMIENTAS ACCESORIO ' +
  'ACCESORIOS COMPONENTE COMPONENTES SISTEMA SISTEMAS DISPOSITIVO DISPOSITIVOS SUMINISTRO SUMINISTROS').split(' '));
const stem = (w: string) => (w.length > 4 ? w.replace(/(ES|S)$/, '') : w);
const words = (text: string) => normalizeSatText(text).split(' ')
  .filter(w => w.length >= 3 && !/\d/.test(w) && !STOP.has(w)).map(stem);
const isGeneric = (w: string) => GENERIC.has(w) || [...GENERIC].some(g => stem(g) === w);

function scoreMaryName(description: string, name: string): number {
  const q = words(description).slice(0, 30);
  if (q.length === 0) return 0;
  const qSet = new Set(q);
  const entry = words(name);
  let score = 0;
  let specific = 0;
  let unmatched = 0;
  for (const w of new Set(entry)) {
    if (!qSet.has(w)) { unmatched++; continue; }
    if (isGeneric(w)) score += 2; else { score += 10; specific++; }
  }
  if (specific === 0) return 0;
  for (let k = 0; k < q.length - 1; k++) {
    for (let i = 0; i < entry.length - 1; i++) {
      if (entry[i] === q[k] && entry[i + 1] === q[k + 1]) { score += 15; break; }
    }
  }
  return Math.round((score - 0.5 * unmatched) * 10) / 10;
}

function keywordBonus(description: string, keywords: string[]): number {
  const text = normalizeSatText(description);
  let best = 0;
  for (const kw of keywords) {
    const word = normalizeSatText(kw).trim();
    if (!word || !text.includes(` ${word}`)) continue;
    const multi = word.includes(' ') ? 5 : 0;
    best = Math.max(best, word.length + multi);
  }
  return best;
}

/**
 * Candidatas de la lista Mary (nombre + keywords), solo con score ≥ MARY_MIN_SCORE.
 * Tie-break: score desc, name length asc, code asc.
 */
export function rankMaryCandidates(description: string, limit = 5): SatRanked[] {
  const found: SatRanked[] = [];
  for (const key of SAT_OHD_CATALOG) {
    const score = scoreMaryName(description, key.name) + keywordBonus(description, key.keywords);
    if (score < MARY_MIN_SCORE) continue;
    found.push({ code: key.code, name: key.name, score, source: 'mary' });
  }
  found.sort((a, b) => b.score - a.score || a.name.length - b.name.length || (a.code < b.code ? -1 : 1));
  return found.slice(0, limit);
}

/**
 * Clave sugerida de Mary solo si hay margen claro vs la 2ª. Empates / ambigüedad → null
 * (las candidatas se listan vía rankMaryCandidates / satChoicesFor).
 */
export function suggestSatOhdCode(description: string): string | null {
  const ranked = rankMaryCandidates(description, 5);
  if (ranked.length === 0) return null;
  if (ranked.length === 1) return ranked[0].code;
  if (ranked[0].score - ranked[1].score >= MARY_CLEAR_MARGIN) return ranked[0].code;
  return null;
}
