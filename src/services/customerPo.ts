/**
 * PO (orden de compra) del cliente. La fuente única es Odoo:
 * `sale.order.client_order_ref` → `customer_reference`. El Hub solo lo lee;
 * no existe captura ni edición aquí (decisión Emiliano 9-nov-2026).
 *
 * El PO no se deriva ni se mapea desde ningún otro número.
 */

/** Texto que se muestra cuando la orden no trae PO del cliente. */
export const NO_CUSTOMER_PO = '—';

/** PO limpio (sin espacios sobrantes) o `null` si Odoo no trae uno útil. */
export function getCustomerPo(ref: string | null | undefined): string | null {
  if (typeof ref !== 'string') return null;
  const trimmed = ref.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** PO para pantalla: el número del cliente o «—» si no hay. */
export function formatCustomerPo(ref: string | null | undefined): string {
  return getCustomerPo(ref) ?? NO_CUSTOMER_PO;
}
