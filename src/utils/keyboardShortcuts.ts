/**
 * Reglas puras para decidir cuándo disparar atajos de teclado en / y /admin,
 * evitando interceptar escritura en inputs, modificadores del sistema o modales abiertos.
 */

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as TargetLike;
  if (el.isContentEditable === true) return true;
  if (typeof el.tagName === 'string' && EDITABLE_TAGS.has(el.tagName.toUpperCase())) return true;
  if (typeof el.closest === 'function') {
    if (el.closest('[contenteditable="true"], [role="textbox"], [role="combobox"]')) {
      return true;
    }
  }
  return false;
}

export type TVShortcutAction = 'prev-page' | 'next-page' | 'toggle-pause' | 'clear-filters';

export interface TVShortcutInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  editable: boolean;
  modalOpen: boolean;
  menuOpen: boolean;
  isTVMode: boolean;
  pageCount: number;
  hasFilters: boolean;
}

export function resolveTVShortcut(input: TVShortcutInput): TVShortcutAction | null {
  if (input.ctrlKey || input.metaKey || input.altKey) return null;
  if (input.editable || input.modalOpen || input.menuOpen) return null;

  if (input.key === 'ArrowRight' && input.isTVMode && input.pageCount > 1) return 'next-page';
  if (input.key === 'ArrowLeft' && input.isTVMode && input.pageCount > 1) return 'prev-page';
  if (input.key === ' ' && input.isTVMode) return 'toggle-pause';
  if (input.key === 'Escape' && input.hasFilters) return 'clear-filters';
  return null;
}

export type AdminShortcutAction =
  | 'focus-search'
  | 'open-command-palette'
  | 'open-shortcuts'
  | 'clear-selection';

export interface AdminShortcutInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  editable: boolean;
  dialogOpen: boolean;
  menuOpen: boolean;
  hasSearchInput: boolean;
  hasSelection?: boolean;
}

export function resolveAdminShortcut(input: AdminShortcutInput): AdminShortcutAction | null {
  if ((input.ctrlKey || input.metaKey) && !input.altKey && input.key.toLowerCase() === 'k') {
    if (input.dialogOpen || input.menuOpen) return null;
    return 'open-command-palette';
  }
  if (input.ctrlKey || input.metaKey || input.altKey) return null;
  if (input.editable || input.dialogOpen || input.menuOpen) return null;
  if (input.key === '/' && input.hasSearchInput) return 'focus-search';
  if (input.key === '?') return 'open-shortcuts';
  if (input.key === 'Escape' && input.hasSelection) return 'clear-selection';
  return null;
}
