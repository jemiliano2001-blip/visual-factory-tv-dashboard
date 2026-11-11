/**
 * Secciones de la consola Admin. Cada sección es una combinación de `tab` + `vista`
 * del link (ver adminFilters.ts); aquí solo se traduce entre ambas, sin tocar
 * el contrato de la URL.
 */
import {
  DEFAULT_ADMIN_FILTERS, UNASSIGNED_ENGINEER, serializeAdminFilters,
  type AdminFilters,
} from './adminFilters';
import type { OrderStatusFilter } from '../components/admin/orderStatusMeta';

export type AdminSectionId = 'company' | 'pending' | 'agenda' | 'deliveries' | 'requests' | 'config';

export interface AdminSection {
  id: AdminSectionId;
  label: string;
  shortLabel: string;
  group: 'orders' | 'settings';
  hasToolbar: boolean;
}

export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { id: 'company', label: 'Por compañía', shortLabel: 'Compañía', group: 'orders', hasToolbar: true },
  { id: 'pending', label: 'Pendientes', shortLabel: 'Pendientes', group: 'orders', hasToolbar: true },
  { id: 'agenda', label: 'Agenda', shortLabel: 'Agenda', group: 'orders', hasToolbar: true },
  { id: 'deliveries', label: 'Entregas', shortLabel: 'Entregas', group: 'orders', hasToolbar: true },
  { id: 'requests', label: 'Solicitudes', shortLabel: 'Solicitudes', group: 'orders', hasToolbar: false },
  { id: 'config', label: 'Configuración', shortLabel: 'Configuración', group: 'settings', hasToolbar: false },
];

export const MOBILE_PRIMARY_SECTIONS: readonly AdminSectionId[] = ['company', 'pending', 'agenda', 'deliveries'];

export function getSection(id: AdminSectionId): AdminSection {
  return ADMIN_SECTIONS.find(s => s.id === id) ?? ADMIN_SECTIONS[0];
}

export function isInMoreMenu(id: AdminSectionId): boolean {
  return !MOBILE_PRIMARY_SECTIONS.includes(id);
}

export function sectionFromFilters(f: AdminFilters): AdminSectionId {
  if (f.tab === 'deliveries' || f.tab === 'requests' || f.tab === 'config') return f.tab;
  return f.view;
}

export function filtersForSection(id: AdminSectionId, f: AdminFilters): AdminFilters {
  if (id === 'deliveries' || id === 'requests' || id === 'config') return { ...f, tab: id };
  return { ...f, tab: 'orders', view: id };
}

/** `current === null`: se navega desde fuera de /admin (p. ej. /stats). */
export function adminSectionHref(id: AdminSectionId, current: AdminFilters | null): string {
  // Por compañía sin filtros previos: link limpio, así se restauran los filtros guardados.
  const query = serializeAdminFilters(filtersForSection(id, current ?? DEFAULT_ADMIN_FILTERS)).toString();
  return query ? `/admin?${query}` : '/admin';
}

export function hasActiveFilters(f: AdminFilters): boolean {
  return Boolean(f.search.trim() || f.client || f.engineer || f.status !== DEFAULT_ADMIN_FILTERS.status);
}

export type FilterChipKey = 'search' | 'client' | 'engineer' | 'status';
export interface FilterChip { key: FilterChipKey; label: string }

export function activeFilterChips(
  f: AdminFilters,
  resolve: { engineerName: (id: string) => string | null; statusLabel: (s: OrderStatusFilter) => string },
): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.search.trim()) chips.push({ key: 'search', label: `Búsqueda: ${f.search.trim()}` });
  if (f.client) chips.push({ key: 'client', label: `Cliente: ${f.client}` });
  if (f.engineer) {
    const name = f.engineer === UNASSIGNED_ENGINEER ? 'sin asignar' : resolve.engineerName(f.engineer) ?? 'desconocido';
    chips.push({ key: 'engineer', label: `Ingeniero: ${name}` });
  }
  if (f.status !== DEFAULT_ADMIN_FILTERS.status) chips.push({ key: 'status', label: `Estado: ${resolve.statusLabel(f.status)}` });
  return chips;
}

export function clearFilter(f: AdminFilters, key: FilterChipKey): AdminFilters {
  switch (key) {
    case 'search': return { ...f, search: '' };
    case 'client': return { ...f, client: '' };
    case 'engineer': return { ...f, engineer: '' };
    case 'status': return { ...f, status: DEFAULT_ADMIN_FILTERS.status };
  }
}

/**
 * Filtros guardados que se aplican al entrar a /admin sin filtros en el link.
 * La sección (tab + vista) siempre la manda el link; `null` = no hay nada que restaurar.
 */
export function restoreSavedFilters(current: AdminFilters, saved: AdminFilters | null): AdminFilters | null {
  if (!saved || hasActiveFilters(current) || !hasActiveFilters(saved)) return null;
  return { ...saved, tab: current.tab, view: current.view };
}
