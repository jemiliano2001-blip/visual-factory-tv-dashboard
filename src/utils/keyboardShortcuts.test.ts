import assert from 'node:assert/strict';
import test from 'node:test';
import { isEditableTarget, resolveAdminShortcut, resolveTVShortcut } from './keyboardShortcuts';

test('isEditableTarget detecta campos editables, contentEditable y roles ARIA', () => {
  assert.equal(isEditableTarget(null), false);
  assert.equal(isEditableTarget({ tagName: 'DIV' } as unknown as EventTarget), false);
  assert.equal(isEditableTarget({ tagName: 'input' } as unknown as EventTarget), true);
  assert.equal(isEditableTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget), true);
  assert.equal(isEditableTarget({ tagName: 'SELECT' } as unknown as EventTarget), true);
  assert.equal(isEditableTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget), true);
  assert.equal(
    isEditableTarget({
      tagName: 'SPAN',
      closest: (sel: string) => (sel.includes('[role="combobox"]') ? {} : null),
    } as unknown as EventTarget),
    true,
  );
});

test('resolveTVShortcut resuelve flechas, espacio y Escape solo en contexto valido', () => {
  const base = {
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    editable: false,
    modalOpen: false,
    menuOpen: false,
    isTVMode: true,
    pageCount: 3,
    hasFilters: true,
  };

  assert.equal(resolveTVShortcut({ ...base, key: 'ArrowRight' }), 'next-page');
  assert.equal(resolveTVShortcut({ ...base, key: 'ArrowLeft' }), 'prev-page');
  assert.equal(resolveTVShortcut({ ...base, key: ' ' }), 'toggle-pause');
  assert.equal(resolveTVShortcut({ ...base, key: 'Escape' }), 'clear-filters');

  // Bloqueos esperados
  assert.equal(resolveTVShortcut({ ...base, key: ' ', editable: true }), null);
  assert.equal(resolveTVShortcut({ ...base, key: 'ArrowRight', modalOpen: true }), null);
  assert.equal(resolveTVShortcut({ ...base, key: 'Escape', menuOpen: true }), null);
  assert.equal(resolveTVShortcut({ ...base, key: 'ArrowLeft', ctrlKey: true }), null);
  assert.equal(resolveTVShortcut({ ...base, key: 'ArrowRight', pageCount: 1 }), null);
  assert.equal(resolveTVShortcut({ ...base, key: ' ', isTVMode: false }), null);
  assert.equal(resolveTVShortcut({ ...base, key: 'Escape', hasFilters: false }), null);
  // Escape sigue limpiando filtros en escritorio cuando no hay modal ni menu
  assert.equal(resolveTVShortcut({ ...base, key: 'Escape', isTVMode: false, hasFilters: true }), 'clear-filters');
});

test('resolveAdminShortcut resuelve /, Ctrl/Cmd+K, ? y Escape según contexto', () => {
  const base = {
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    editable: false,
    dialogOpen: false,
    menuOpen: false,
    hasSearchInput: true,
    hasSelection: false,
  };

  assert.equal(resolveAdminShortcut({ ...base, key: '/' }), 'focus-search');
  assert.equal(resolveAdminShortcut({ ...base, key: '/', editable: true }), null);
  assert.equal(resolveAdminShortcut({ ...base, key: '/', dialogOpen: true }), null);
  assert.equal(resolveAdminShortcut({ ...base, key: '/', menuOpen: true }), null);
  assert.equal(resolveAdminShortcut({ ...base, key: '/', hasSearchInput: false }), null);
  assert.equal(resolveAdminShortcut({ ...base, key: '/', ctrlKey: true }), null);
  assert.equal(resolveAdminShortcut({ ...base, key: 'a' }), null);

  assert.equal(resolveAdminShortcut({ ...base, key: 'k', ctrlKey: true }), 'open-command-palette');
  assert.equal(resolveAdminShortcut({ ...base, key: 'K', metaKey: true, editable: true, hasSearchInput: false }), 'open-command-palette');
  assert.equal(resolveAdminShortcut({ ...base, key: 'k', ctrlKey: true, dialogOpen: true }), null);
  assert.equal(resolveAdminShortcut({ ...base, key: 'k', ctrlKey: true, altKey: true }), null);

  assert.equal(resolveAdminShortcut({ ...base, key: '?', hasSearchInput: false }), 'open-shortcuts');
  assert.equal(resolveAdminShortcut({ ...base, key: '?', editable: true }), null);

  assert.equal(resolveAdminShortcut({ ...base, key: 'Escape', hasSelection: true }), 'clear-selection');
  assert.equal(resolveAdminShortcut({ ...base, key: 'Escape', hasSelection: false }), null);
});
