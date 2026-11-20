import { useSyncExternalStore } from 'react';

export type AdminTheme = 'dark' | 'light';
const KEY = 'adminTheme';
const listeners = new Set<() => void>();

function read(): AdminTheme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Tema del Admin (por defecto oscuro). Solo /admin lo aplica al <html>. */
export function useAdminTheme(): [AdminTheme, () => void] {
  const theme = useSyncExternalStore(subscribe, read, () => 'dark' as AdminTheme);
  const toggle = () => {
    try {
      localStorage.setItem(KEY, read() === 'light' ? 'dark' : 'light');
    } catch { /* sin almacenamiento: no se recuerda */ }
    listeners.forEach(l => l());
  };
  return [theme, toggle];
}
