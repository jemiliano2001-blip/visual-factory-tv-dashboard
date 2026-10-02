/**
 * Estado de la consola Admin que viaja en el link (?tab=…&q=…&cliente=…&estado=…),
 * para compartir una vista exacta. Todo valor del link se valida: un link
 * manipulado cae a los valores por defecto en vez de romper la pantalla.
 */
import type { OrderStatusFilter } from '../components/admin/orderStatusMeta';

export const ADMIN_TABS = ['pending', 'agenda', 'orders', 'deliveries', 'report', 'config'] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

const STATUSES: readonly OrderStatusFilter[] = ['all', 'overdue', 'warning', 'on-time', 'none'];

export interface AdminFilters {
  tab: AdminTab;
  search: string;
  client: string;
  status: OrderStatusFilter;
}

export const DEFAULT_ADMIN_FILTERS: AdminFilters = { tab: 'pending', search: '', client: '', status: 'all' };

export function parseAdminFilters(params: URLSearchParams): AdminFilters {
  const tab = params.get('tab');
  const status = params.get('estado');
  return {
    tab: ADMIN_TABS.find(t => t === tab) ?? DEFAULT_ADMIN_FILTERS.tab,
    search: params.get('q') ?? '',
    client: params.get('cliente') ?? '',
    status: STATUSES.find(s => s === status) ?? DEFAULT_ADMIN_FILTERS.status,
  };
}

export function serializeAdminFilters(filters: AdminFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.tab !== DEFAULT_ADMIN_FILTERS.tab) params.set('tab', filters.tab);
  if (filters.search) params.set('q', filters.search);
  if (filters.client) params.set('cliente', filters.client);
  if (filters.status !== DEFAULT_ADMIN_FILTERS.status) params.set('estado', filters.status);
  return params;
}
