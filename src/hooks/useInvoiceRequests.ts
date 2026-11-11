/**
 * src/hooks/useInvoiceRequests.ts
 * Estado compartido de las solicitudes de factura/remisión (React Query).
 * Las mutaciones escriben el estado devuelto por el servidor en la caché.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchInvoiceRequests, markInvoiceRequestDoneRemote, submitInvoiceRequests, type InvoiceRequestsView,
} from '../services/invoiceRequests';
import type { InvoiceRequestsState } from '../../shared/invoiceRequests';

export const INVOICE_REQUESTS_KEY = ['invoiceRequests'] as const;

/** Las mutaciones devuelven el estado sin avance: se conserva el último hasta el siguiente GET. */
const keepProgress = (state: InvoiceRequestsState) => (old: InvoiceRequestsView | undefined): InvoiceRequestsView =>
  ({ ...state, progress: old?.progress });

export function useInvoiceRequests(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: INVOICE_REQUESTS_KEY,
    queryFn: fetchInvoiceRequests,
    refetchInterval: 60_000,
    enabled: options.enabled ?? true,
    retry: 1,
  });
}

export function useSubmitInvoiceRequests() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: submitInvoiceRequests,
    onSuccess: result => queryClient.setQueryData(INVOICE_REQUESTS_KEY, keepProgress(result.state)),
  });
}

export function useMarkInvoiceRequestDone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markInvoiceRequestDoneRemote,
    onSuccess: state => queryClient.setQueryData(INVOICE_REQUESTS_KEY, keepProgress(state)),
  });
}
