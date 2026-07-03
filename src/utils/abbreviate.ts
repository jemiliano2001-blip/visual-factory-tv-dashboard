// ─── Diccionario de abreviaciones comunes en español (manufactura) ──────────
// Extraído de SmartText para reutilizarlo en contextos sin medición de DOM
// (p. ej. el reporte imprimible del admin).
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
  [/\bAutom[aá]tico\b/gi, 'Auto.'],
  [/\bHidr[aá]ulico\b/gi, 'Hidr.'],
  [/\bNeum[aá]tico\b/gi, 'Neum.'],
  [/\bEl[eé]ctrico\b/gi, 'Eléc.'],
  [/\bIndustrial\b/gi, 'Ind.'],
  [/\bProducci[oó]n\b/gi, 'Prod.'],
  [/\bCertificado\b/gi, 'Cert.'],
  [/\bPulido\b/gi, 'Pul.'],
  [/\bTransporte\b/gi, 'Trans.'],
  [/\bDiseño\b/gi, 'Dis.'],
  [/\bSuministro\b/gi, 'Sum.'],
  [/\bReparaci[oó]n\b/gi, 'Rep.'],
  [/\bReemplazo\b/gi, 'Reemp.'],
  [/\bRetrabajo\b/gi, 'Retr.'],
  [/\bModificaci[oó]n\b/gi, 'Mod.'],
  [/\bEstructura\b/gi, 'Estr.'],
  [/\bConector\b/gi, 'Conect.'],
  [/\bTornillos?\b/gi, 'Torn.'],
  [/\bTransportador\b/gi, 'Transp.'],
  [/\bCalibraci[oó]n\b/gi, 'Calib.'],
  [/\bProgramaci[oó]n\b/gi, 'Prog.'],
  [/\bInspecci[oó]n\b/gi, 'Insp.'],
  [/\bMec[aá]nico\b/gi, 'Mec.'],
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
 * Abreviación fija para contextos sin medición de DOM (impresión):
 * diccionario + sin conectores. Nunca cae al nivel "keywords" —
 * el texto debe seguir siendo legible, no telegráfico.
 */
export function abbreviate(text: string): string {
  const levels = generateTextLevels(text);
  return levels[Math.min(2, levels.length - 1)];
}
