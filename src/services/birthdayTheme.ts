import type { HolidayTheme } from './holidayTheme';

/** Cumpleaños sorpresa: el nombre y la fecha viven en `public/festivos/cumple/config.json`,
 *  no en el código, para que no salgan en el repo ni en el bundle antes de tiempo. */
export interface BirthdayConfig {
  name: string;
  month: number;
  day: number;
}

export const BIRTHDAY_BASE_URL = '/festivos/cumple';

const MAX_NAME = 40;

export function parseBirthdayConfig(raw: unknown): BirthdayConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const { nombre, mes, dia } = raw as Record<string, unknown>;
  if (typeof nombre !== 'string' || typeof mes !== 'number' || typeof dia !== 'number') return null;
  const name = nombre.trim().slice(0, MAX_NAME);
  if (!name || !Number.isInteger(mes) || !Number.isInteger(dia)) return null;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return { name, month: mes, day: dia };
}

export const isBirthdayToday = (cfg: BirthdayConfig, date: Date): boolean =>
  date.getMonth() + 1 === cfg.month && date.getDate() === cfg.day;

export const parseBirthdayForced = (search: string): boolean =>
  new URLSearchParams(search).get('festivo') === 'cumple';

export function buildBirthdayTheme(cfg: BirthdayConfig): HolidayTheme {
  return {
    id: 'cumple', start: 0, end: 0,
    greeting: `¡Feliz cumpleaños, ${cfg.name}!`,
    icon: 'PartyPopper', particle: 'confeti', garland: 'banderines', scene: 'cumple',
    accent: '125, 211, 252',
    palette: {
      top: ['rgba(56,189,248,0.60)', 'rgba(244,114,182,0.55)', 'rgba(250,204,21,0.50)', 'rgba(167,139,250,0.58)'],
      wave1: ['rgba(14,165,233,0.45)', 'rgba(244,114,182,0.40)', 'rgba(250,204,21,0.35)'],
      wave2: ['rgba(124,58,237,0.45)', 'rgba(56,189,248,0.38)', 'rgba(251,191,36,0.35)'],
    },
  };
}
