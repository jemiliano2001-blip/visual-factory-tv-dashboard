/** Metadatos de presentación para el estado de una remisión (stock.picking). */
import type { BadgeProps } from '../ui/badge';

type BadgeVariant = BadgeProps['variant'];

export const DELIVERY_STATE_VARIANT: Record<string, BadgeVariant> = {
  done: 'success',
  assigned: 'info',
  waiting: 'warning',
  confirmed: 'warning',
  draft: 'muted',
  cancel: 'muted',
};

export const DELIVERY_STATE_LABEL: Record<string, string> = {
  done: 'Hecho',
  assigned: 'Listo',
  waiting: 'En espera',
  confirmed: 'Confirmado',
  draft: 'Borrador',
  cancel: 'Cancelado',
};
