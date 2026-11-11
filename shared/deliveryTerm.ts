/**
 * Tiempo de entrega escrito en la nota de la orden. Es la base del compromiso:
 * fecha de la orden + el plazo más largo, en días hábiles. Lógica pura, sin imports.
 */

export interface DeliveryDaysRange {
  min: number;
  max: number;
}

/**
 * Parsea el rango de días hábiles desde el texto de la nota de una orden.
 * Soporta formatos como:
 *   - "Tiempo de entrega de 8 a 12 días hábiles"
 *   - "8 a 12 dias habiles"
 *   - "8-12 días hábiles"
 *   - "10 días hábiles" (un solo número → min = max)
 *   - "4 semanas"
 *   - "1 a 2 meses"
 */
export function parseDeliveryDaysFromNote(note: string | null | undefined): DeliveryDaysRange | null {
  if (!note) return null;
  const normalized = note.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Validar explícitamente que la nota habla de tiempo o entrega para evitar falsos positivos
  // con otros números. (Aunque el regex ya exige la unidad, esto añade robustez).
  if (!normalized.includes('entrega') && !normalized.includes('tiempo')) {
    return null;
  }

  const getMultiplier = (text: string) => {
    if (!text) return 1;
    if (text.includes('semana')) return 5;
    if (text.includes('mes')) return 20;
    return 1; // dias
  };

  // Patrón: "N a M" o "N-M" seguido OBLIGATORIAMENTE de la unidad
  const rangeMatch = normalized.match(/(\d+)\s*(?:a|-|al?)\s*(\d+)\s*(dias?\s*habiles?|dias?|semanas?|mes(?:es)?)/i);
  if (rangeMatch) {
    const multiplier = getMultiplier(rangeMatch[3] || '');
    const a = parseInt(rangeMatch[1], 10) * multiplier;
    const b = parseInt(rangeMatch[2], 10) * multiplier;
    if (a > 0 && b > 0) {
      return { min: Math.min(a, b), max: Math.max(a, b) };
    }
  }

  // Patrón: "N unidades" (número suelto). Exigimos la unidad.
  const singleMatch = normalized.match(/(\d+)\s*(dias?\s*habiles?|dias?|semanas?|mes(?:es)?)/i);
  if (singleMatch) {
    const multiplier = getMultiplier(singleMatch[2] || '');
    const n = parseInt(singleMatch[1], 10) * multiplier;
    if (n > 0) return { min: n, max: n };
  }

  return null;
}

/** Suma N días hábiles (lun-vie, en UTC) a una fecha. */
export function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setUTCDate(result.getUTCDate() + 1);
    const dow = result.getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Compromiso según la nota, en el formato de fecha de Odoo ("YYYY-MM-DD HH:MM:SS", UTC);
 * null si la nota no trae plazo o la fecha de la orden no es válida.
 */
export function commitmentFromNote(note: string | null | undefined, dateOrder: string | null | undefined): string | null {
  const range = parseDeliveryDaysFromNote(note);
  const m = typeof dateOrder === 'string' ? dateOrder.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/) : null;
  if (!range || !m) return null;
  const start = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
  if (Number.isNaN(start.getTime())) return null;
  const d = addBusinessDays(start, range.max);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
