import { useState } from 'react';
import { introStorageKey, shouldShowIntro } from '../services/holidayIntro';
import type { HolidayTheme } from '../services/holidayTheme';

/** Decide una sola vez al montar si se muestra el saludo a pantalla completa del festivo. */
export function useHolidayIntro(
  holiday: HolidayTheme | null,
  now: Date,
  forced: boolean,
  enabled: boolean
): { show: boolean; dismiss: () => void } {
  const [show, setShow] = useState(() => {
    if (!enabled || !holiday || typeof window === 'undefined') return false;
    const key = introStorageKey(holiday.id, now);
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
    const visible = shouldShowIntro({ stored, forced, reducedMotion });
    if (visible) {
      try {
        window.localStorage.setItem(key, '1');
      } catch {
        // Ignorar si localStorage falla (p. ej. modo privado)
      }
    }
    return visible;
  });

  return { show, dismiss: () => setShow(false) };
}
