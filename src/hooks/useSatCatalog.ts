import { useEffect, useState } from 'react';
import type { SatCatalog } from '../../shared/satSearch';

let loading: Promise<SatCatalog | null> | null = null;

/** Catálogo SAT oficial recortado: se descarga solo cuando hace falta (órdenes de OHD) y, si falla, devuelve null. */
function loadSatCatalog(): Promise<SatCatalog | null> {
  loading ??= import('../../shared/satCatalogData').then(m => m.SAT_CATALOG, () => { loading = null; return null; });
  return loading;
}

export function useSatCatalog(enabled: boolean): SatCatalog | null {
  const [catalog, setCatalog] = useState<SatCatalog | null>(null);
  useEffect(() => {
    if (!enabled || catalog) return;
    let alive = true;
    loadSatCatalog().then(c => { if (alive && c) setCatalog(c); });
    return () => { alive = false; };
  }, [enabled, catalog]);
  return catalog;
}
