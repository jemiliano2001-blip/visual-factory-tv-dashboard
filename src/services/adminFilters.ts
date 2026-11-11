/**
 * Estado de la consola Admin que viaja en el link (?tab=…&vista=…&ing=…&q=…&cliente=…&estado=…),
 * para compartir una vista exacta. Todo valor del link se valida: un link
 * manipulado cae a los valores por defecto en vez de romper la pantalla.
 */
import type { OrderStatusFilter } from '../components/admin/orderStatusMeta';

export const ADMIN_TABS = ['orders', 'requests', 'config'] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

export const ORDER_VIEWS = ['company', 'pending'] as const;
export type OrderView = (typeof ORDER_VIEWS)[number];

/** Valor de `engineer` para las órdenes sin ingeniero asignado. */
export const UNASSIGNED_ENGINEER = '__unassigned__';

const STATUSES: readonly OrderStatusFilter[] = ['all', 'overdue', 'warning', 'on-time', 'none'];

export interface AdminFilters {
  tab: AdminTab;
  view: OrderView;
  engineer: string;
  search: string;
  client: string;
  status: OrderStatusFilter;
}

export const DEFAULT_ADMIN_FILTERS: AdminFilters = {
  tab: 'orders', view: 'company', engineer: '', search: '', client: '', status: 'all',
};

export function parseAdminFilters(params: URLSearchParams): AdminFilters {
  const tab = params.get('tab');
  const status = params.get('estado');
  // Links anteriores: pending/report eran pestañas y agenda se fundió con Pendientes (Entregas cae en Por compañía).
  const legacyView = tab === 'pending' || tab === 'agenda' ? 'pending' : tab === 'report' ? 'company' : null;
  const view = params.get('vista');
  return {
    tab: ADMIN_TABS.find(t => t === tab) ?? (legacyView ? 'orders' : DEFAULT_ADMIN_FILTERS.tab),
    view: ORDER_VIEWS.find(v => v === view) ?? (view === 'agenda' ? 'pending' : null) ?? legacyView ?? DEFAULT_ADMIN_FILTERS.view,
    engineer: params.get('ing') ?? '',
    search: params.get('q') ?? '',
    client: params.get('cliente') ?? '',
    status: STATUSES.find(s => s === status) ?? DEFAULT_ADMIN_FILTERS.status,
  };
}

export function serializeAdminFilters(filters: AdminFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.tab !== DEFAULT_ADMIN_FILTERS.tab) params.set('tab', filters.tab);
  if (filters.view !== DEFAULT_ADMIN_FILTERS.view) params.set('vista', filters.view);
  if (filters.engineer) params.set('ing', filters.engineer);
  if (filters.search) params.set('q', filters.search);
  if (filters.client) params.set('cliente', filters.client);
  if (filters.status !== DEFAULT_ADMIN_FILTERS.status) params.set('estado', filters.status);
  return params;
}
