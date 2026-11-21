/** Configuración por cuenta (`user_settings/{uid}`). Lógica pura: validar, sembrar y decidir el arranque del Admin. */
import { ADMIN_SECTIONS, filtersForSection, type AdminSectionId } from './adminSections';
import type { AdminFilters } from './adminFilters';
import { normalizeCompanyName } from './companyConfigGuards';

export const MAX_FOLLOWED_CLIENTS = 10;
export const MAX_CLIENT_NAME = 100;
export const MIN_COPIES = 1;
export const MAX_COPIES = 5;

export interface UserSettings {
  startView: AdminSectionId;
  /** Nombres normalizados con `normalizeCompanyName`. Vacío = todos. */
  followedClients: string[];
  print: { copies: number; boardTicket: boolean };
  appearance: { theme: 'dark' | 'light'; density: 'comfortable' | 'compact' };
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  startView: 'company',
  followedClients: [],
  print: { copies: 2, boardTicket: true },
  appearance: { theme: 'dark', density: 'comfortable' },
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/** Cualquier valor leído de Firestore → configuración válida; lo inválido cae al default. */
export function sanitizeUserSettings(raw: unknown): UserSettings {
  const r = obj(raw);
  const d = DEFAULT_USER_SETTINGS;
  const print = obj(r.print);
  const appearance = obj(r.appearance);
  const clients = Array.isArray(r.followedClients) ? r.followedClients : [];
  const followed = [...new Set(
    clients
      .filter((c): c is string => typeof c === 'string')
      .map(normalizeCompanyName)
      .filter(c => c.length > 0 && c.length <= MAX_CLIENT_NAME),
  )].slice(0, MAX_FOLLOWED_CLIENTS);
  const copies = print.copies;
  return {
    startView: ADMIN_SECTIONS.find(s => s.id === r.startView)?.id ?? d.startView,
    followedClients: followed,
    print: {
      copies: typeof copies === 'number' && Number.isInteger(copies) && copies >= MIN_COPIES
        ? Math.min(copies, MAX_COPIES)
        : d.print.copies,
      boardTicket: typeof print.boardTicket === 'boolean' ? print.boardTicket : d.print.boardTicket,
    },
    appearance: {
      theme: appearance.theme === 'light' ? 'light' : 'dark',
      density: appearance.density === 'compact' ? 'compact' : 'comfortable',
    },
  };
}

/** Cuenta sin documento: se conserva la apariencia que ya tenía este navegador. */
export function seedUserSettings(local: { theme?: unknown; density?: unknown }): UserSettings {
  return sanitizeUserSettings({ appearance: { theme: local.theme, density: local.density } });
}

/**
 * Filtros con los que arranca /admin. `null` = no cambiar nada: el link con parámetros manda,
 * y no hay nada que aplicar si la vista de inicio y el cliente ya coinciden con lo actual.
 * El filtro de cliente es de un solo valor: solo se aplica si se sigue exactamente uno.
 */
export function startFiltersFor(
  settings: UserSettings,
  current: AdminFilters,
  hasUrlParams: boolean,
  clientNames: readonly string[],
): AdminFilters | null {
  if (hasUrlParams) return null;
  let next = filtersForSection(settings.startView, current);
  if (settings.followedClients.length === 1) {
    const match = clientNames.find(n => normalizeCompanyName(n) === settings.followedClients[0]);
    if (match) next = { ...next, client: match };
  }
  const same = (Object.keys(next) as (keyof AdminFilters)[]).every(k => next[k] === current[k]);
  return same ? null : next;
}
