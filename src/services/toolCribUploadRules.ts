/** Validación pura de la subida de un plano (límites de storage.rules y de las reglas de toolcribParts). */
export const MAX_PDF_BYTES = 25 * 1024 * 1024;

export function validateUpload(input: { file: { name: string; size: number; type: string }; partNumber: string; revision: string }):
  { ok: true } | { ok: false; error: string } {
  if (input.file.type !== 'application/pdf') return { ok: false, error: 'El plano debe ser un archivo PDF.' };
  if (input.file.size >= MAX_PDF_BYTES) return { ok: false, error: 'El PDF pesa 25 MB o más; el límite es menor a 25 MB.' };
  const part = input.partNumber.trim();
  if (part.length < 1 || part.length > 128) return { ok: false, error: 'El número de parte debe tener de 1 a 128 caracteres.' };
  const rev = input.revision.trim();
  if (rev.length < 1 || rev.length > 32) return { ok: false, error: 'La revisión debe tener de 1 a 32 caracteres.' };
  return { ok: true };
}
