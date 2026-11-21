import { useEffect, useMemo, useState } from 'react';
import { getActiveHoliday, parseHolidayOverride, type HolidayTheme } from '../services/holidayTheme';
import {
  BIRTHDAY_BASE_URL, buildBirthdayTheme, isBirthdayToday, parseBirthdayConfig, parseBirthdayForced,
  type BirthdayConfig,
} from '../services/birthdayTheme';

const REFRESH_MS = 10 * 60 * 1000;

/** Festivo vigente; la fecha se revisa cada 10 min para que cambie sola a medianoche. `?festivo=<id>` fuerza uno (vista previa).
 *  El cumpleaños sale de `config.json` (si no existe o no es válido, no hay tema); `ready` indica que ya se intentó cargar. */
export function useActiveHoliday(): { holiday: HolidayTheme | null; now: Date; forced: boolean; ready: boolean } {
  const [now, setNow] = useState(() => new Date());
  const [birthday, setBirthday] = useState<BirthdayConfig | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(`${BIRTHDAY_BASE_URL}/config.json`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(raw => alive && setBirthday(parseBirthdayConfig(raw)))
      .catch(() => undefined) // sin config (o hosting devolvió el index.html): no hay cumpleaños
      .finally(() => alive && setReady(true));
    return () => { alive = false; };
  }, []);

  const search = typeof window === 'undefined' ? '' : window.location.search;
  const birthdayTheme = useMemo(() => (birthday ? buildBirthdayTheme(birthday) : null), [birthday]);
  const birthdayForced = birthdayTheme !== null && parseBirthdayForced(search);
  const override = parseHolidayOverride(search);

  let holiday: HolidayTheme | null;
  if (birthdayForced) holiday = birthdayTheme;
  else if (override) holiday = override;
  else if (birthday && birthdayTheme && isBirthdayToday(birthday, now)) holiday = birthdayTheme; // el cumpleaños manda sobre el festivo del día
  else holiday = getActiveHoliday(now);

  return { holiday, now, forced: birthdayForced || override !== null, ready };
}
