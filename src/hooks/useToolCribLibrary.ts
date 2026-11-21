import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadAliases, loadLibrary, loadPrintLogs } from '../services/toolCribLibrary';
import { buildPrintedIndex } from '../services/toolCribPrintIndex';

/** Biblioteca de planos, alias y bitácora de impresión de las SO dadas. */
export function useToolCribLibrary(orderRefs: string[]) {
  const refsKey = useMemo(() => [...new Set(orderRefs)].sort().join('|'), [orderRefs]);
  const library = useQuery({ queryKey: ['toolcrib', 'library'], queryFn: loadLibrary, staleTime: 5 * 60_000 });
  const aliases = useQuery({ queryKey: ['toolcrib', 'aliases'], queryFn: loadAliases, staleTime: 5 * 60_000 });
  const logs = useQuery({
    queryKey: ['toolcrib', 'logs', refsKey],
    queryFn: () => loadPrintLogs(refsKey ? refsKey.split('|') : []),
    staleTime: 30_000,
    enabled: refsKey !== '',
  });
  const printed = useMemo(() => buildPrintedIndex(logs.data ?? []), [logs.data]);
  return {
    library: library.data,
    aliases: aliases.data,
    printed,
    /** false mientras la bitácora no llega: sin ella no se sabe si algo ya se imprimió. */
    printedReady: refsKey === '' || logs.isSuccess,
    isLoading: library.isLoading || aliases.isLoading || logs.isLoading,
    error: (library.error ?? aliases.error ?? logs.error) as Error | null,
    refetchPrinted: () => logs.refetch(),
    refetchLibrary: () => Promise.all([library.refetch(), aliases.refetch()]),
  };
}
