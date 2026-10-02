/**
 * src/hooks/useOdooOrders.ts
 * Hook compartido (TV, Admin, Stats) para las órdenes por facturar de Odoo.
 * Las tres páginas usan la misma queryKey, así que comparten UNA petición
 * y UNA caché de React Query.
 */
import { useQuery } from '@tanstack/react-query';
import { fetchInvoiceableOrders, type OdooConnectionStatus } from '../services/odoo';

export function useOdooOrders() {
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['odooData'],
    queryFn: fetchInvoiceableOrders,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const errorMessage = error ? (error as Error).message : null;
  // La conexión se deduce de la propia consulta de órdenes. Si un refresco falla,
  // `data` conserva las órdenes anteriores (y `lastUpdated` marca su antigüedad).
  const status: OdooConnectionStatus | null = errorMessage
    ? { connected: false, message: errorMessage }
    : data ? { connected: true, message: 'Conectado a Odoo' } : null;

  return {
    status,
    orders: data?.orders ?? [],
    lastUpdated: data?.lastUpdated ?? null,
    truncated: data?.truncated === true,
    error: errorMessage,
    isLoading,
    isFetching,
    refetch,
  };
}
