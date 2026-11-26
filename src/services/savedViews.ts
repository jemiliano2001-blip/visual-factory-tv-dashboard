/**
 * Vistas guardadas de filtros de /admin en localStorage.
 * Reutiliza parseAdminFilters / serializeAdminFilters para validar links y filtros.
 */
import { parseAdminFilters, serializeAdminFilters, type AdminFilters } from './adminFilters';

export interface SavedAdminView {
  id: string;
  name: string;
  query: string;
}

export const MAX_SAVED_VIEWS = 12;
export const MAX_SAVED_VIEW_NAME = 40;

function normalizeName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

export function normalizeSavedViews(raw: unknown): SavedAdminView[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SavedAdminView[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as { id?: unknown; name?: unknown; query?: unknown };
    if (typeof obj.id !== 'string' || typeof obj.name !== 'string' || typeof obj.query !== 'string') continue;
    const name = normalizeName(obj.name).slice(0, MAX_SAVED_VIEW_NAME);
    const id = obj.id.trim();
    if (!id || !name) continue;
    const key = name.toLocaleLowerCase('es-MX');
    if (seen.has(key)) continue;
    seen.add(key);
    const cleanQuery = serializeAdminFilters(parseAdminFilters(new URLSearchParams(obj.query))).toString();
    out.push({ id, name, query: cleanQuery });
    if (out.length >= MAX_SAVED_VIEWS) break;
  }
  return out;
}

export function addSavedView(
  list: readonly SavedAdminView[],
  name: string,
  filters: AdminFilters,
): SavedAdminView[] {
  const cleanName = normalizeName(name).slice(0, MAX_SAVED_VIEW_NAME);
  if (!cleanName) return [...list];
  const query = serializeAdminFilters(filters).toString();
  const key = cleanName.toLocaleLowerCase('es-MX');
  const existingIdx = list.findIndex(v => v.name.toLocaleLowerCase('es-MX') === key);

  if (existingIdx >= 0) {
    return list.map((v, i) => (i === existingIdx ? { ...v, name: cleanName, query } : v));
  }

  const id = `view_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const next = [{ id, name: cleanName, query }, ...list];
  return next.slice(0, MAX_SAVED_VIEWS);
}

export function removeSavedView(list: readonly SavedAdminView[], id: string): SavedAdminView[] {
  return list.filter(v => v.id !== id);
}

export function savedViewToFilters(view: SavedAdminView): AdminFilters {
  return parseAdminFilters(new URLSearchParams(view.query));
}
