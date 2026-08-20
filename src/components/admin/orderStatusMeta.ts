/** Metadatos de presentación para OrderStatusLevel (src/services/odoo.ts). */
import type { BadgeProps } from '../ui/badge';
import type { OrderStatusLevel } from '../../services/odoo';

type BadgeVariant = BadgeProps['variant'];

export const STATUS_VARIANT: Record<OrderStatusLevel, BadgeVariant> = {
  overdue: 'danger',
  warning: 'warning',
  'on-time': 'success',
  none: 'muted',
};

/** Valor del filtro de estado en la barra de filtros del admin ('all' + niveles de OrderStatus). */
export type OrderStatusFilter = 'all' | OrderStatusLevel;

