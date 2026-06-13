/**
 * src/services/odoo.ts
 * Servicio frontend para consumir el proxy Express de Odoo.
 * Hace polling automático y retorna las órdenes de venta a facturar.
 */

// Base del proxy Express de Odoo. Vacío = mismo origen: en dev/preview Vite
// reenvía /api al proxy (vite.config.ts), por lo que funciona también desde
// otros dispositivos de la red (la TV). VITE_ODOO_PROXY_URL permite apuntar a
// un proxy desplegado en otro host (sin barra final).
const PROXY_BASE = import.meta.env.VITE_ODOO_PROXY_URL || '';

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export interface OdooOrderLine {
  /** Descripción del producto */
  name: string;
  /** Cantidad pedida (product_uom_qty) */
  qty: number;
  /** Cantidad entregada */
  delivered: number;
  /** Precio unitario */
  price_unit: number;
  /** Subtotal de la línea (sin impuestos) */
  subtotal: number;
}

export interface OdooSaleOrder {
  id: number;
  /** Número de orden de venta, ej. "SO/2024/0042" */
  name: string;
  /** Nombre del cliente */
  partner_name: string;
  /** Descripción del producto principal */
  main_product: string;
  /** Monto total con impuestos */
  amount_total: number;
  /** Monto sin impuestos */
  amount_untaxed: number;
  /** Fecha de creación de la orden (ISO string) */
  date_order: string;
  /** Fecha compromiso de entrega (null si no tiene) */
  commitment_date: string | null;
  /** Estado de facturación — siempre 'to invoice' */
  invoice_status: string;
  /** Moneda, ej. "MXN" */
  currency: string;
  /** Cantidad total de productos en todas las líneas */
  qty_total: number;
  /** Cantidad ya entregada */
  qty_delivered: number;
  /** Estado de la orden en Odoo ('sale' | 'done') */
  state: string;
  /** Vendedor asignado */
  salesperson: string | null;
  /** Número de líneas de producto */
  lines_count: number;
  /** Detalle de líneas de producto (para la consola admin) */
  lines: OdooOrderLine[];
  /** Remisiones (traslados de salida) asociadas a esta orden */
  deliveries: OdooDelivery[];
}

export interface OdooDelivery {
  /** Nombre de la remisión, ej. "WH/OUT/00042" */
  name: string;
  /** Estado: 'draft' | 'waiting' | 'confirmed' | 'assigned' | 'done' | 'cancel' */
  state: string;
  /** Fecha de entrega (solo si state === 'done'), formato Odoo o null */
  date_done: string | null;
}

export interface OdooConnectionStatus {
  connected: boolean;
  message: string;
  url?: string;
}

export interface OdooOrdersResponse {
  orders: OdooSaleOrder[];
  total: number;
  lastUpdated: string;
  error?: string;
}

// ─── Utilidad: parsear fechas de Odoo ──────────────────────────────────────────
/**
 * Odoo devuelve datetimes como "YYYY-MM-DD HH:MM:SS" en UTC, sin zona ni "T".
 * Ese formato no es ISO: Chrome lo interpreta como hora LOCAL (corrimiento de
 * zona) y Safari/WebKit lo rechaza con Invalid Date. Normaliza a ISO-UTC.
 * Devuelve null si el valor falta o no es parseable.
 */
export function parseOdooDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = value.includes('T')
    ? value                                  // ya es ISO (p. ej. lastUpdated del proxy)
    : value.includes(' ')
    ? value.replace(' ', 'T') + 'Z'          // datetime de Odoo → UTC explícito
    : `${value}T00:00:00Z`;                  // date sin hora
  const date = new Date(normalized);
  return isNaN(date.getTime()) ? null : date;
}

// ─── Función: obtener estado de conexión ───────────────────────────────────────
export async function checkOdooStatus(): Promise<OdooConnectionStatus> {
  try {
    const response = await fetch(`${PROXY_BASE}/api/odoo/status`, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_API_SECRET || ''}`
      }
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string; error?: string } | null;
      return {
        connected: false,
        message: body?.message || body?.error || `Error HTTP ${response.status} del proxy de Odoo`,
      };
    }
    return await response.json() as OdooConnectionStatus;
  } catch {
    return {
      connected: false,
      message: 'No se pudo conectar al proxy de Odoo. ¿Está corriendo el servidor?',
    };
  }
}

// ─── Función: obtener órdenes a facturar ───────────────────────────────────────
export async function fetchInvoiceableOrders(): Promise<OdooOrdersResponse> {
  try {
    const response = await fetch(`${PROXY_BASE}/api/odoo/invoiceable-orders`, {
      // El proxy encadena varias llamadas RPC contra Odoo (auth + search + read
      // + líneas en lotes); su techo combinado supera los 20s con Odoo lento.
      signal: AbortSignal.timeout(45000),
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_API_SECRET || ''}`
      }
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
      return {
        orders: [],
        total: 0,
        lastUpdated: new Date().toISOString(),
        error: errorBody.error || `Error HTTP ${response.status}`,
      };
    }

    return await response.json() as OdooOrdersResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      orders: [],
      total: 0,
      lastUpdated: new Date().toISOString(),
      error: `Sin conexión al proxy de Odoo: ${msg}`,
    };
  }
}

// ─── Utilidades de display ─────────────────────────────────────────────────────

/** Formatea monto con símbolo de moneda */
export function formatCurrency(amount: number, currency: string): string {
  try {
    const locale = currency === 'MXN' ? 'es-MX' : currency === 'USD' ? 'en-US' : 'es-MX';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.length === 3 ? currency : 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${amount.toLocaleString('es-MX')}`;
  }
}

/** Calcula prioridad basada en fecha de compromiso */
export function getOrderPriority(order: OdooSaleOrder): 'low' | 'normal' | 'high' | 'critical' {
  const commitment = parseOdooDate(order.commitment_date);
  if (!commitment) return 'normal';

  const diffMs = commitment.getTime() - Date.now();
  // Comparar en ms, no en días redondeados: con Math.ceil una orden vencida
  // hace <24h daba -0 y nunca llegaba a 'critical' pese a mostrarse "Vencida".
  if (diffMs < 0) return 'critical';      // Ya venció
  const diffDays = diffMs / 86_400_000;
  if (diffDays <= 2) return 'high';       // Vence en 2 días o menos
  if (diffDays <= 7) return 'normal';     // Vence esta semana
  return 'low';                           // Más de una semana
}

/** Indica si la orden ya pasó su fecha compromiso */
export function isOrderOverdue(order: OdooSaleOrder): boolean {
  const commitment = parseOdooDate(order.commitment_date);
  return commitment ? commitment.getTime() < Date.now() : false;
}

/** Calcula progreso de entrega (0–100) */
export function getDeliveryProgress(order: OdooSaleOrder): number {
  if (!order.qty_total || order.qty_total === 0) return 0;
  return Math.min(100, Math.round((order.qty_delivered / order.qty_total) * 100));
}
