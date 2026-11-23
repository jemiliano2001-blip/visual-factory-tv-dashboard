import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cacheAssignments, fetchOrderAssignments, loadCachedAssignments } from '../services/orderAssignments';
import type { OrderAssignmentsPayload } from '../../shared/orderAssignments';

export const ORDER_ASSIGNMENTS_KEY = ['orderAssignments'] as const;

/**
 * Caché compartida de asignaciones de órdenes entre Admin y Stats.
 * Pinta al instante desde localStorage y revalida cada 60 s sin duplicar timers.
 */
export function useOrderAssignments() {
  const queryClient = useQueryClient();
  const { data, error } = useQuery({
    queryKey: ORDER_ASSIGNMENTS_KEY,
    queryFn: fetchOrderAssignments,
    initialData: loadCachedAssignments,
    initialDataUpdatedAt: 0,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const setTeamData = useCallback((next: OrderAssignmentsPayload) => {
    queryClient.setQueryData(ORDER_ASSIGNMENTS_KEY, next);
    cacheAssignments(next);
  }, [queryClient]);

  return {
    team: data,
    fetchError: error ? (error instanceof Error ? error.message : String(error)) : null,
    setTeamData,
  };
}
