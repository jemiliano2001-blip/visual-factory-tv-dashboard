/**
 * src/services/odoo.ts
 * Servicio frontend para consumir el proxy Express de Odoo.
 * Hace polling automático y retorna las órdenes de venta a facturar.
 */

import { getIdTokenOrThrow } from '../firebase';

// Base del proxy Express de Odoo. Vacío = mismo origen: en dev/preview Vite
// reenvía /api al proxy (vite.config.ts), por lo que funciona también desde
// otros dispositivos de la red (la TV). VITE_ODOO_PROXY_URL permite apuntar a
// un proxy desplegado en otro host (sin barra final).
const PROXY_BASE = import.meta.env.VITE_ODOO_PROXY_URL || '';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getIdTokenOrThrow();
  return { Authorization: `Bearer ${token}` };
}

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export interface OdooOrderLine {
  /** Descripción del producto */
  name: string;
  /** Cantidad pedida (product_uom_qty) */
  qty: number;
  /** Cantidad entregada */
  delivered: number;
  // Precios omitidos a propósito: son confidenciales y el proxy no los envía.
}

export interface OdooSaleOrder {
  id: number;
  /** Número de orden de venta, ej. "SO/2024/0042" */
  name: string;
  /** Nombre del cliente */
  partner_name: string;
  /** Descripción del producto principal */
  main_product: string;
  // Montos (amount_total/amount_untaxed) omitidos a propósito: confidenciales,
  // el proxy no los envía al navegador.
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
  /** Nota / términos de la orden (contiene tiempo de entrega) */
  note: string | null;
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
      headers: await getAuthHeaders(),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string; error?: string } | null;
      return {
        connected: false,
        message: body?.message || body?.error || `Error HTTP ${response.status} del proxy de Odoo`,
      };
    }
    return await response.json() as OdooConnectionStatus;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('sesión') || msg.includes('token') || msg.includes('Firebase')) {
      return {
        connected: false,
        message: msg,
      };
    }
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
      headers: await getAuthHeaders(),
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
    if (msg.includes('sesión') || msg.includes('token') || msg.includes('Firebase')) {
      return {
        orders: [],
        total: 0,
        lastUpdated: new Date().toISOString(),
        error: msg,
      };
    }
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

/**
 * True si la orden tiene remisiones y TODAS las no canceladas están en 'done'.
 * Si no tiene remisiones, devuelve false (no podemos confirmar la entrega → no ocultar).
 */
export function isOrderFullyDelivered(order: OdooSaleOrder): boolean {
  const active = (order.deliveries ?? []).filter(d => d.state !== 'cancel');
  return active.length > 0 && active.every(d => d.state === 'done');
}

// ─── Antigüedad de la orden ────────────────────────────────────────────────────

/** Umbral de antigüedad: una orden con más de 1 mes (>30 días) se marca como "antigua". */
export const STALE_AGE_DAYS = 30;

/** Antigüedad en días desde la fecha de creación (date_order). null si no es parseable. */
export function getOrderAgeDays(order: OdooSaleOrder): number | null {
  const created = parseOdooDate(order.date_order);
  if (!created) return null;
  return Math.floor((Date.now() - created.getTime()) / 86_400_000);
}

/** Formatea la antigüedad de forma compacta para la TV: "12 d", "1 mes", "3 meses". */
export function formatOrderAge(days: number): string {
  if (days < 30) return `${days} d`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 mes' : `${months} meses`;
}

// ─── Tiempo de entrega desde notas ─────────────────────────────────────────────

export interface DeliveryDaysRange {
  min: number;
  max: number;
}

export interface DeliveryTimeInfo {
  /** Rango de días hábiles parseado de la nota, ej. {min: 8, max: 12} */
  daysRange: DeliveryDaysRange | null;
  /** Fecha en que inicia la zona de advertencia (día hábil min desde date_order) */
  warningDate: Date | null;
  /** Fecha límite absoluta (día hábil max desde date_order) */
  deadlineDate: Date | null;
  /** Días hábiles restantes hasta deadline (negativo = vencida) */
  businessDaysRemaining: number | null;
  /** Estado calculado */
  status: 'on-time' | 'warning' | 'overdue' | 'unknown';
}

/**
 * Parsea el rango de días hábiles desde el texto de la nota de una orden.
 * Soporta formatos como:
 *   - "Tiempo de entrega de 8 a 12 días hábiles"
 *   - "8 a 12 dias habiles"
 *   - "8-12 días hábiles"
 *   - "10 días hábiles" (un solo número → min = max)
 *   - "4 semanas"
 *   - "1 a 2 meses"
 */
export function parseDeliveryDaysFromNote(note: string | null | undefined): DeliveryDaysRange | null {
  if (!note) return null;
  const normalized = note.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Validar explícitamente que la nota habla de tiempo o entrega para evitar falsos positivos
  // con otros números. (Aunque el regex ya exige la unidad, esto añade robustez).
  if (!normalized.includes('entrega') && !normalized.includes('tiempo')) {
    return null;
  }

  const getMultiplier = (text: string) => {
    if (!text) return 1;
    if (text.includes('semana')) return 5;
    if (text.includes('mes')) return 20;
    return 1; // dias
  };

  // Patrón: "N a M" o "N-M" seguido OBLIGATORIAMENTE de la unidad
  const rangeMatch = normalized.match(/(\d+)\s*(?:a|-|al?)\s*(\d+)\s*(dias?\s*habiles?|dias?|semanas?|mes(?:es)?)/i);
  if (rangeMatch) {
    const multiplier = getMultiplier(rangeMatch[3] || '');
    const a = parseInt(rangeMatch[1], 10) * multiplier;
    const b = parseInt(rangeMatch[2], 10) * multiplier;
    if (a > 0 && b > 0) {
      return { min: Math.min(a, b), max: Math.max(a, b) };
    }
  }

  // Patrón: "N unidades" (número suelto). Exigimos la unidad.
  const singleMatch = normalized.match(/(\d+)\s*(dias?\s*habiles?|dias?|semanas?|mes(?:es)?)/i);
  if (singleMatch) {
    const multiplier = getMultiplier(singleMatch[2] || '');
    const n = parseInt(singleMatch[1], 10) * multiplier;
    if (n > 0) return { min: n, max: n };
  }

  return null;
}

/** Inicio del día calendario (medianoche local) para comparaciones justas. */
function startOfCalendarDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Suma N días hábiles (lun-vie) a una fecha. */
export function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++; // skip sáb/dom
  }
  return result;
}

/** Cuenta días hábiles (lun-vie) entre dos fechas (excluye `from`, incluye `to`). Negativo si to < from. */
export function getBusinessDaysBetween(from: Date, to: Date): number {
  const forward = to >= from;
  const start = forward ? new Date(from) : new Date(to);
  const end = forward ? new Date(to) : new Date(from);
  let count = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return forward ? count : -count;
}

/** Calcula el estado de tiempo de entrega de una orden basándose en su nota. */
export function getDeliveryTimeStatus(order: OdooSaleOrder): DeliveryTimeInfo {
  const unknown: DeliveryTimeInfo = {
    daysRange: null,
    warningDate: null,
    deadlineDate: null,
    businessDaysRemaining: null,
    status: 'unknown',
  };

  const daysRange = parseDeliveryDaysFromNote(order.note);
  if (!daysRange) return unknown;

  const orderDate = parseOdooDate(order.date_order);
  if (!orderDate) return { ...unknown, daysRange };

  const warningDate = addBusinessDays(orderDate, daysRange.min);
  const deadlineDate = addBusinessDays(orderDate, daysRange.max);

  const now = new Date();
  const today = startOfCalendarDay(now);
  const warningDay = startOfCalendarDay(warningDate);
  const deadlineDay = startOfCalendarDay(deadlineDate);
  const businessDaysRemaining = getBusinessDaysBetween(today, deadlineDay);

  let status: DeliveryTimeInfo['status'];
  if (today > deadlineDay) {
    status = 'overdue';
  } else if (today >= warningDay) {
    status = 'warning';
  } else {
    status = 'on-time';
  }

  return { daysRange, warningDate, deadlineDate, businessDaysRemaining, status };
}

// ─── Estado de urgencia unificado (fuente de verdad del color) ──────────────────

/**
 * Nivel de urgencia dominante de una orden. Es el ÚNICO sistema de color del
 * Dashboard: el color responde "¿qué está en riesgo de llegar tarde?". El avance
 * de producción se comunica aparte (barra + %), no con color.
 */
export type OrderStatusLevel = 'overdue' | 'warning' | 'on-time' | 'none';

export interface OrderStatus {
  level: OrderStatusLevel;
  /** Etiqueta en español para mostrar en la tarjeta */
  label: string;
}

/**
 * Calcula el estado de urgencia de una orden por precedencia (gana la primera
 * regla que se cumpla), tomando la señal MÁS urgente entre la fecha compromiso
 * (commitment_date) y el tiempo de entrega parseado de la nota.
 *
 *   1. overdue  → vencida por fecha compromiso O por deadline de la nota
 *   2. warning  → vence en ≤2 días (prioridad 'high') O zona de advertencia de la nota
 *   3. on-time  → tiene fecha/nota y no cae en lo anterior
 *   4. none     → sin commitment_date NI nota parseable (no fingir 'en tiempo')
 */
export function getOrderStatus(order: OdooSaleOrder): OrderStatus {
  const deliveryTime = getDeliveryTimeStatus(order);
  const hasDate = parseOdooDate(order.commitment_date) !== null || deliveryTime.status !== 'unknown';

  if (isOrderOverdue(order) || deliveryTime.status === 'overdue') {
    return { level: 'overdue', label: 'Atrasada' };
  }
  if (getOrderPriority(order) === 'high' || deliveryTime.status === 'warning') {
    return { level: 'warning', label: 'Por vencer' };
  }
  if (hasDate) {
    return { level: 'on-time', label: 'En tiempo' };
  }
  return { level: 'none', label: 'Sin fecha' };
}
