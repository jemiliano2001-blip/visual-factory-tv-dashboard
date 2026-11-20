import { useEffect, useState } from 'react';
import { getActiveHoliday, parseHolidayOverride, type HolidayTheme } from '../services/holidayTheme';

const REFRESH_MS = 10 * 60 * 1000;

/** Festivo vigente; la fecha se revisa cada 10 min para que cambie sola a medianoche. `?festivo=<id>` fuerza uno (vista previa). */
export function useActiveHoliday(): { holiday: HolidayTheme | null; now: Date; forced: boolean } {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  const override = typeof window === 'undefined' ? null : parseHolidayOverride(window.location.search);
  return { holiday: override ?? getActiveHoliday(now), now, forced: override !== null };
}
