import { useEffect, useState } from 'react';

/**
 * Estado persistido en localStorage por navegador. Lee el valor guardado en el
 * inicializador de useState y lo reescribe cuando cambia. Tolerante a JSON
 * inválido o a entornos sin localStorage (cae al valor inicial).
 *
 * Misma firma que useState para que sea un reemplazo directo.
 */
export function usePersistedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw != null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* almacenamiento no disponible o lleno — se ignora */
    }
  }, [key, value]);

  return [value, setValue] as const;
}
