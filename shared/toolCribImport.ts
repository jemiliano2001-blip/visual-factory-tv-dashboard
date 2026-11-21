/**
 * Deriva número de parte y revisión de la ruta de un PDF de las carpetas TOOL CRIB de
 * Kohler y Fisher (carpeta por parte; en Fisher los códigos son `E###`). Es solo una
 * propuesta para revisar: lo dudoso sale con confianza `media` o `baja`.
 */
export type ImportCustomer = 'KOHLER' | 'FISHER';
export type Confidence = 'alta' | 'media' | 'baja';
export interface DerivedDrawing { partNumber: string; revision: string; confidence: Confidence; note: string }

const GENERIC_DIR = /^(dibujos? (originales?|antiguos?)|dibujo original|pdf( images)?|numeros de parte de kolher.*)$/i;
const ARCHIVE_DIR = /^archivo edgar$/i;
const KOHLER_PART = /^(SMV-\d+|\d{2}[A-Z0-9]{2}-\d{5})$/i;
const FISHER_CODE = /^E\d+[A-Z]?(?:-(?:E\d+[A-Z]?|\d+|LH|RH))?/i;
const compact = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function deriveDrawing(customer: ImportCustomer, relPath: string): DerivedDrawing {
  const parts = relPath.split(/[\\/]+/).filter(Boolean);
  const file = parts[parts.length - 1] ?? '';
  const base = file.replace(/\.pdf$/i, '').trim();
  const archived = parts.slice(0, -1).some(p => ARCHIVE_DIR.test(p));
  const dirs = parts.slice(0, -1).filter(p => !GENERIC_DIR.test(p) && !ARCHIVE_DIR.test(p));
  const top = dirs[0];

  if (!top) return { partNumber: base, revision: 'A', confidence: 'baja', note: 'PDF suelto: sin carpeta de parte' };
  if (archived) return { partNumber: top, revision: 'A', confidence: 'baja', note: 'Viene de carpeta de archivo' };

  if (customer === 'FISHER') {
    const code = FISHER_CODE.exec(top)?.[0];
    if (code) return { partNumber: code.toUpperCase(), revision: 'A', confidence: 'alta', note: '' };
    return { partNumber: top.trim(), revision: 'A', confidence: 'baja', note: 'Carpeta sin código E###' };
  }

  if (!KOHLER_PART.test(top)) return { partNumber: top.trim(), revision: 'A', confidence: 'baja', note: 'Carpeta sin formato de parte Kohler' };
  const partNumber = top.toUpperCase();
  const fileKey = compact(base);
  const partKey = compact(partNumber);
  if (!fileKey.includes(partKey) || /\(\d+\)$/.test(base)) {
    return { partNumber, revision: 'A', confidence: 'media', note: 'Archivo con distinto nombre que la carpeta' };
  }
  const suffix = base.slice(0, partNumber.length).toUpperCase() === partNumber ? /^-([A-Z])$/i.exec(base.slice(partNumber.length))?.[1] : undefined;
  return { partNumber, revision: suffix ? suffix.toUpperCase() : 'A', confidence: 'alta', note: '' };
}
