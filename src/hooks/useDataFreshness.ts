import { useEffect, useMemo, useState } from 'react';
import { formatDataFreshness, type DataFreshness } from '../services/dataFreshness';

const TICK_INTERVAL_MS = 30_000;

/**
 * Mantiene actualizada la edad relativa de `lastUpdated` cada 30 s sin fugas de temporizador.
 */
export function useDataFreshness(lastUpdated: string | null | undefined): DataFreshness | null {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setNowMs(Date.now());
    if (!lastUpdated) return;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, TICK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [lastUpdated]);

  return useMemo(() => formatDataFreshness(lastUpdated, nowMs), [lastUpdated, nowMs]);
}
