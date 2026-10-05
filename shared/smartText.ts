// ─── Diccionario de abreviaciones comunes en español (manufactura) ──────────
export const ABBREVIATIONS: [RegExp, string][] = [
  [/\bServicio\b/gi, 'Serv.'],
  [/\bServicios\b/gi, 'Serv.'],
  [/\bFabricaci[oó]n\b/gi, 'Fab.'],
  [/\bManufactura\b/gi, 'Mfg.'],
  [/\binoxidable\b/gi, 'inox.'],
  [/\bTratamiento\b/gi, 'Trat.'],
  [/\bGalvanizado\b/gi, 'Galv.'],
  [/\bRecubrimiento\b/gi, 'Recub.'],
  [/\bMaquinados?\b/gi, 'Maq.'],
  [/\bAcabado\b/gi, 'Acab.'],
  [/\bEnsamble\b/gi, 'Ensam.'],
  [/\bInstalaci[oó]n\b/gi, 'Inst.'],
  [/\bMantenimiento\b/gi, 'Mant.'],
  [/\bAluminio\b/gi, 'Alum.'],
  [/\bHerramienta\b/gi, 'Herr.'],
  [/\bHerramientas\b/gi, 'Herr.'],
  [/\bAutom[aá]tic[oa]s?\b/gi, 'Auto.'],
  [/\bHidr[aá]ulic[oa]s?\b/gi, 'Hidr.'],
  [/\bNeum[aá]tic[oa]s?\b/gi, 'Neum.'],
  [/\bEl[eé]ctric[oa]s?\b/gi, 'Eléc.'],
  [/\bIndustrial(?:es)?\b/gi, 'Ind.'],
  [/\bProducci[oó]n\b/gi, 'Prod.'],
  [/\bCertificad[oa]s?\b/gi, 'Cert.'],
  [/\bPulid[oa]s?\b/gi, 'Pul.'],
  [/\bTransporte\b/gi, 'Trans.'],
  [/\bDiseño\b/gi, 'Dis.'],
  [/\bSuministro\b/gi, 'Sum.'],
  [/\bReparaci[oó]n\b/gi, 'Rep.'],
  [/\bReemplazo\b/gi, 'Reemp.'],
  [/\bRetrabajo\b/gi, 'Retr.'],
  [/\bModificaci[oó]n\b/gi, 'Mod.'],
  [/\bEstructura\b/gi, 'Estr.'],
  [/\bConector(?:es)?\b/gi, 'Conect.'],
  [/\bTornillos?\b/gi, 'Torn.'],
  [/\bTransportador(?:es)?\b/gi, 'Transp.'],
  [/\bCalibraci[oó]n\b/gi, 'Calib.'],
  [/\bProgramaci[oó]n\b/gi, 'Prog.'],
  [/\bInspecci[oó]n\b/gi, 'Insp.'],
  [/\bMec[aá]nic[oa]s?\b/gi, 'Mec.'],
  [/\bProyecto\b/gi, 'Proy.'],
  [/\bEnsamblaje\b/gi, 'Ens.'],
  [/\bSoldadura\b/gi, 'Sold.'],
  [/\bPintura\b/gi, 'Pint.'],
  [/\bComponentes?\b/gi, 'Comp.'],
];

// Palabras sin información clave que se pueden eliminar en nivel agresivo
export const FILLER_WORDS = /\b(de|del|la|el|las|los|para|con|por|una?|en|al|su|sus|y|o|e)\b/gi;

/**
 * Genera versiones progresivamente más cortas del texto.
 *
 * Nivel 0: Texto completo
 * Nivel 1: Texto con abreviaciones de palabras comunes
 * Nivel 2: Abreviaciones + eliminar fillers
 * Nivel 3: Solo las primeras N palabras significativas (keywords)
 */
export function generateTextLevels(text: string): string[] {
  if (!text) return [''];

  const original = text.trim();

  // Nivel 1 — abreviar palabras conocidas
  let abbreviated = original;
  for (const [pattern, replacement] of ABBREVIATIONS) {
    abbreviated = abbreviated.replace(pattern, replacement);
  }

  // Nivel 2 — abreviar + quitar fillers
  const noFillers = abbreviated
    .replace(FILLER_WORDS, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Nivel 3 — solo keywords (primeras 4 palabras significativas)
  const keywords = noFillers.split(/\s+/).slice(0, 4).join(' ');

  // Deduplicar niveles
  const levels = [original];
  if (abbreviated !== original) levels.push(abbreviated);
  if (noFillers !== levels[levels.length - 1]) levels.push(noFillers);
  if (keywords !== levels[levels.length - 1]) levels.push(keywords);

  return levels;
}

/**
 * Abreviación fija para contextos sin medición de DOM (impresión, notificaciones):
 * diccionario + sin conectores.
 */
export function abbreviate(text: string): string {
  const levels = generateTextLevels(text);
  return levels[Math.min(2, levels.length - 1)];
}

/**
 * Limpia etiquetas HTML y entidades comunes de notas de Odoo.
 */
export function sanitizeOdooHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Math.min(Number(code), 0x10FFFF)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface OrderTextSource {
  main_product?: string;
  lines_count?: number;
  lines?: Array<{ name: string }>;
  note?: string | null;
  salesperson?: string | null;
  engineer?: string | null;
}

/**
 * Genera un resumen contextual conciso de la orden utilizando la lógica de smart text.
 * Aplica abreviaciones de manufactura y agrega indicador de líneas secundarias si aplica.
 */
export function generateOrderSmartSummary(order: OrderTextSource, maxLen = 80): string {
  const rawText = order.main_product?.trim() || order.lines?.[0]?.name?.trim() || 'Sin descripción';
  const abbreviated = abbreviate(rawText);
  const extraLines = (order.lines_count && order.lines_count > 1)
    ? order.lines_count - 1
    : (order.lines && order.lines.length > 1)
      ? order.lines.length - 1
      : 0;

  const extraSuffix = extraLines > 0 ? ` (+${extraLines} líns)` : '';
  const availableLength = Math.max(20, maxLen - extraSuffix.length);

  let result = abbreviated;
  if (result.length > availableLength) {
    result = `${result.slice(0, availableLength - 1).trim()}…`;
  }

  return `${result}${extraSuffix}`;
}

function cleanEngineerName(rawName: string): string {
  let name = rawName.trim().replace(/^[:\s/.-]+/, '').replace(/[:\s/.-]+$/, '').trim();
  // Remover artículos y palabras funcionales al inicio (ej: "a la ingeniera", "la ingeniera", "al ing")
  name = name.replace(/^(?:a\s+la|al|a\s+el|a|el|la)\s+/i, '').trim();
  // Remover títulos de ingeniero al inicio para normalizarlos
  name = name.replace(/^ing(?:eniero|eniera)?\.?\s+/i, '').trim();
  // Remover sufijos de área/puesto si vienen pegados
  name = name.replace(/\s+(?:taller|diseno|diseño|ventas|calidad|produccion|producción)$/i, '').trim();
  if (!name) return '';
  return `Ing. ${name}`;
}

/**
 * Extrae el ingeniero asignado de una orden consultando descripciones de líneas,
 * notas de taller o salesperson con título de ingeniero.
 * Regla de negocio: OT e ingeniero se consultan en las descripciones/notas según la
 * operación del taller; no se equipara automáticamente vendedor con ingeniero a menos
 * que el vendedor sea explícitamente ingeniero.
 */
export function extractAssignedEngineer(order: OrderTextSource): string {
  if (order.engineer && typeof order.engineer === 'string' && order.engineer.trim()) {
    return cleanEngineerName(order.engineer);
  }

  // 1. Buscar en líneas secundarias (típico: "Retrabajo OT-00427 / Ing. José Núñez")
  if (order.lines && order.lines.length > 0) {
    for (const line of order.lines) {
      if (!line.name) continue;
      const match = line.name.match(
        /(?:asignad[oa]\s+(?:al?|a\s+la)\s+(?:ing(?:eniero|eniera)?\.?\s*)?|responsable:\s*(?:ing(?:eniero|eniera)?\.?\s*)?|\b(?:ing(?:eniero|eniera)?\.?)\s+)([A-ZÁÉÍÓÚÑa-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+){1,3})/i
      );
      if (match && match[1]) {
        return cleanEngineerName(match[1]);
      }
    }
  }

  // 2. Buscar en la nota de la orden (típico: "<p>OT 00981: asignada a la ingeniera María López</p>")
  if (order.note) {
    const plain = sanitizeOdooHtml(order.note);
    const match = plain.match(
      /(?:asignad[oa]\s+(?:al?|a\s+la)\s+(?:ing(?:eniero|eniera)?\.?\s*)?|responsable:\s*(?:ing(?:eniero|eniera)?\.?\s*)?|\b(?:ing(?:eniero|eniera)?\.?)\s+)([A-ZÁÉÍÓÚÑa-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+){1,3})/i
    );
    if (match && match[1]) {
      return cleanEngineerName(match[1]);
    }
  }

  // 3. Revisar si salesperson contiene explícitamente título de ingeniero
  if (order.salesperson && typeof order.salesperson === 'string') {
    const trimmed = order.salesperson.trim();
    if (/^ing(?:eniero|eniera)?\.?\s+/i.test(trimmed)) {
      return cleanEngineerName(trimmed);
    }
  }

  return 'Sin asignar';
}
