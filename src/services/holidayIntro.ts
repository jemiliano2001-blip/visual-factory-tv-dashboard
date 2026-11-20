import type { HolidayId } from './holidayTheme';

const pad = (n: number) => String(n).padStart(2, '0');

/** Clave de fecha local 'YYYY-MM-DD' para registrar un saludo visto por día. */
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function introStorageKey(id: HolidayId, date: Date): string {
  return `vftv:festivo:visto:${id}:${localDateKey(date)}`;
}

export function shouldShowIntro(input: {
  stored: string | null;
  forced: boolean;
  reducedMotion: boolean;
}): boolean {
  if (input.reducedMotion) return false;
  if (input.forced) return true;
  return input.stored === null;
}
