import { useEffect, useRef, useState } from 'react';

/**
 * Devuelve `[ref, cerca]`. `cerca = true` solo cuando el cursor está dentro de
 * `radius` px del rectángulo del elemento referenciado (0 si está encima). Así
 * la barra de control aparece únicamente cuando el mouse se acerca y se oculta
 * apenas se aleja — no con cualquier movimiento de pantalla.
 *
 * En una pantalla sin mouse (la tele de pared) nunca llegan eventos `mousemove`
 * → permanece `false` (oculta). El `lingerMs` corto evita el parpadeo al rozar
 * el borde de la zona.
 *
 * Incluye temporizador de inactividad: si el cursor se queda quieto dentro de la zona
 * sin moverse por más de `inactivityTimeoutMs`, la barra se auto-oculta para no
 * obstruir la visualización en pantallas TV.
 */
export function useProximityVisible<T extends HTMLElement>(
  radius = 120,
  lingerMs = 250,
  inactivityTimeoutMs = 4000,
) {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
    let rafId: number | null = null;

    const resetInactivity = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        setNear(false);
      }, inactivityTimeoutMs);
    };

    const onMove = (e: MouseEvent) => {
      if (rafId !== null) return;

      rafId = requestAnimationFrame(() => {
        rafId = null;
        const el = ref.current;
        if (!el) return;

        const r = el.getBoundingClientRect();
        // Distancia del cursor al rectángulo (0 si está dentro de él).
        const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
        const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
        const dist = Math.hypot(dx, dy);

        if (dist <= radius) {
          if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
          }
          setNear(true);
          resetInactivity();
        } else if (!hideTimer) {
          hideTimer = setTimeout(() => {
            setNear(false);
            hideTimer = null;
          }, lingerMs);
        }
      });
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (hideTimer) clearTimeout(hideTimer);
      if (inactivityTimer) clearTimeout(inactivityTimer);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [radius, lingerMs, inactivityTimeoutMs]);

  return [ref, near] as const;
}
