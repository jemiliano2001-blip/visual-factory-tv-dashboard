/**
 * src/hooks/useOdooOrders.ts
 * Hook compartido (TV, Admin, Stats) para las órdenes por facturar de Odoo.
 * Las tres páginas usan la misma queryKey, así que comparten UNA petición
 * y UNA caché de React Query.
 */
import { useQuery } from '@tanstack/react-query';
import { checkOdooStatus, fetchInvoiceableOrders } from '../services/odoo';

export function useOdooOrders() {
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['odooData'],
    queryFn: async () => {
      const [statusRes, ordersRes] = await Promise.all([
        checkOdooStatus(),
        fetchInvoiceableOrders(),
      ]);
      return { statusRes, ordersRes };
    },
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    status: data?.statusRes ?? null,
    orders: data?.ordersRes.orders ?? [],
    lastUpdated: data?.ordersRes.lastUpdated ?? null,
    error: error ? (error as Error).message : data?.ordersRes.error ?? null,
    isLoading,
    isFetching,
    refetch,
  };
}
