import { useEffect, useRef, useState } from 'react';
import { introStorageKey, shouldShowIntro } from '../services/holidayIntro';
import type { HolidayTheme } from '../services/holidayTheme';

/** Decide una vez por clave de saludo (festivo y día; el cumpleaños, también hora) (al estar `enabled`) si se muestra el saludo a pantalla completa del festivo. */
export function useHolidayIntro(
  holiday: HolidayTheme | null,
  now: Date,
  forced: boolean,
  enabled: boolean
): { show: boolean; dismiss: () => void } {
  const [show, setShow] = useState(false);
  const decided = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !holiday || typeof window === 'undefined') return;
    const key = introStorageKey(holiday.id, now);
    if (decided.current === key) return;
    decided.current = key;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(key);
    } catch {
      stored = null;
    }
    let reducedMotion = false;
    try {
      reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      reducedMotion = false;
    }
    if (!shouldShowIntro({ stored, forced, reducedMotion })) return;
    try {
      window.localStorage.setItem(key, '1');
    } catch {
      // Ignorar si localStorage falla (p. ej. modo privado)
    }
    setShow(true);
  }, [enabled, holiday, now, forced]);

  return { show, dismiss: () => setShow(false) };
}
