/** Temas festivos de la TV: cambian solo el fondo aurora y un saludo en el header.
 *  Nunca tocan el color de las tarjetas (significa urgencia, ver DESIGN.md). */
export type HolidayId = 'navidad' | 'anio-nuevo' | 'reyes' | 'san-valentin' | 'madres';
export type HolidayParticle = 'nieve' | 'destellos' | 'confeti' | 'corazones' | 'petalos';
export type HolidayIcon = 'TreePine' | 'Sparkles' | 'Crown' | 'Heart' | 'Flower2';
export type GarlandKind = 'luces' | 'serpentinas' | 'banderines' | 'corazones' | 'flores';
export type SceneKind = 'navidad' | 'ciudad' | 'coronas' | 'globos' | 'macetas';

export interface HolidayTheme {
  id: HolidayId;
  /** Ventana inclusiva como mes*100+día. Si start > end cruza fin de año. */
  start: number;
  end: number;
  greeting: string;
  icon: HolidayIcon;
  particle: HolidayParticle;
  garland: GarlandKind;
  scene: SceneKind;
  /** Acento del chip del header (rgb) y colores de la aurora. Sin rojos saturados: el rojo es "vencida". */
  accent: string;
  palette: { top: string[]; wave1: string[]; wave2: string[] };
}

export const HOLIDAYS: HolidayTheme[] = [
  {
    id: 'navidad', start: 1201, end: 1226, greeting: '¡Feliz Navidad!', icon: 'TreePine', particle: 'nieve',
    garland: 'luces', scene: 'navidad',
    accent: '110, 231, 183',
    palette: {
      top: ['rgba(16,185,129,0.65)', 'rgba(250,204,21,0.55)', 'rgba(226,232,240,0.45)', 'rgba(5,150,105,0.65)'],
      wave1: ['rgba(5,150,105,0.50)', 'rgba(250,204,21,0.40)', 'rgba(203,213,225,0.35)'],
      wave2: ['rgba(21,128,61,0.48)', 'rgba(234,179,8,0.38)', 'rgba(148,163,184,0.35)'],
    },
  },
  {
    id: 'anio-nuevo', start: 1227, end: 102, greeting: '', icon: 'Sparkles', particle: 'confeti',
    garland: 'serpentinas', scene: 'ciudad',
    accent: '252, 211, 77',
    palette: {
      top: ['rgba(250,204,21,0.65)', 'rgba(203,213,225,0.50)', 'rgba(99,102,241,0.65)', 'rgba(245,158,11,0.60)'],
      wave1: ['rgba(234,179,8,0.45)', 'rgba(148,163,184,0.40)', 'rgba(99,102,241,0.50)'],
      wave2: ['rgba(79,70,229,0.48)', 'rgba(250,204,21,0.38)', 'rgba(203,213,225,0.35)'],
    },
  },
  {
    id: 'reyes', start: 103, end: 106, greeting: '¡Feliz Día de Reyes!', icon: 'Crown', particle: 'destellos',
    garland: 'banderines', scene: 'coronas',
    accent: '216, 180, 254',
    palette: {
      top: ['rgba(250,204,21,0.60)', 'rgba(147,51,234,0.65)', 'rgba(30,64,175,0.65)', 'rgba(168,85,247,0.60)'],
      wave1: ['rgba(126,34,206,0.50)', 'rgba(234,179,8,0.38)', 'rgba(30,58,138,0.50)'],
      wave2: ['rgba(88,28,135,0.48)', 'rgba(250,204,21,0.36)', 'rgba(37,99,235,0.42)'],
    },
  },
  {
    id: 'san-valentin', start: 210, end: 214, greeting: '¡Feliz Día del Amor y la Amistad!', icon: 'Heart', particle: 'corazones',
    garland: 'corazones', scene: 'globos',
    accent: '249, 168, 212',
    palette: {
      top: ['rgba(244,114,182,0.62)', 'rgba(217,70,239,0.58)', 'rgba(192,132,252,0.60)', 'rgba(251,207,232,0.45)'],
      wave1: ['rgba(236,72,153,0.45)', 'rgba(168,85,247,0.45)', 'rgba(244,114,182,0.40)'],
      wave2: ['rgba(192,38,211,0.45)', 'rgba(249,168,212,0.38)', 'rgba(167,139,250,0.42)'],
    },
  },
  {
    id: 'madres', start: 506, end: 510, greeting: '¡Feliz Día de las Madres!', icon: 'Flower2', particle: 'petalos',
    garland: 'flores', scene: 'macetas',
    accent: '251, 207, 232',
    palette: {
      top: ['rgba(251,207,232,0.55)', 'rgba(196,181,253,0.58)', 'rgba(244,114,182,0.50)', 'rgba(255,255,255,0.35)'],
      wave1: ['rgba(244,114,182,0.40)', 'rgba(196,181,253,0.45)', 'rgba(255,255,255,0.28)'],
      wave2: ['rgba(167,139,250,0.45)', 'rgba(251,207,232,0.38)', 'rgba(255,255,255,0.28)'],
    },
  },
];

const inWindow = (h: HolidayTheme, md: number) =>
  h.start <= h.end ? md >= h.start && md <= h.end : md >= h.start || md <= h.end;

/** Festivo vigente en la fecha local de la TV, o null (la TV queda como siempre). */
export function getActiveHoliday(date: Date): HolidayTheme | null {
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  return HOLIDAYS.find(h => inWindow(h, md)) ?? null;
}

export function holidayGreeting(theme: HolidayTheme, date: Date): string {
  if (theme.id !== 'anio-nuevo') return theme.greeting;
  const year = date.getMonth() === 11 ? date.getFullYear() + 1 : date.getFullYear();
  return `¡Feliz Año ${year}!`;
}

/** Vista previa: `?festivo=navidad` fuerza ese tema. Un id desconocido se ignora. */
export function parseHolidayOverride(search: string): HolidayTheme | null {
  const id = new URLSearchParams(search).get('festivo');
  return HOLIDAYS.find(h => h.id === id) ?? null;
}
