/**
 * Agenda de entregas: agrupa las órdenes con piezas pendientes por su fecha
 * compromiso (atrasadas, hoy, mañana, cada día de las próximas dos semanas,
 * más adelante y sin fecha) para planear la semana.
 */
import { addDays, format, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { OdooSaleOrder, parseOdooDate } from './odoo';
import { getOrderMissingQty } from './pendingItems';

/** Cuántos días hacia adelante (contando hoy) se muestran uno por uno. */
export const AGENDA_HORIZON_DAYS = 15;

export interface AgendaGroup {
  key: string;
  label: string;
  kind: 'overdue' | 'day' | 'later' | 'none';
  orders: OdooSaleOrder[];
}

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');

export function buildAgenda(orders: OdooSaleOrder[], now: Date = new Date()): AgendaGroup[] {
  const today = startOfDay(now);
  const horizonEnd = addDays(today, AGENDA_HORIZON_DAYS); // exclusivo
  const tomorrowKey = dayKey(addDays(today, 1));
  const todayKey = dayKey(today);

  const overdue: OdooSaleOrder[] = [];
  const later: OdooSaleOrder[] = [];
  const none: OdooSaleOrder[] = [];
  const byDay = new Map<string, OdooSaleOrder[]>();

  for (const order of orders) {
    if (getOrderMissingQty(order) === 0) continue;
    const due = parseOdooDate(order.commitment_date);
    if (!due) { none.push(order); continue; }
    const day = startOfDay(due);
    if (day < today) overdue.push(order);
    else if (day >= horizonEnd) later.push(order);
    else {
      const key = dayKey(day);
      byDay.set(key, [...(byDay.get(key) ?? []), order]);
    }
  }

  const byDueThenName = (a: OdooSaleOrder, b: OdooSaleOrder) =>
    (parseOdooDate(a.commitment_date)?.getTime() ?? 0) - (parseOdooDate(b.commitment_date)?.getTime() ?? 0)
    || a.name.localeCompare(b.name, 'es');

  const groups: AgendaGroup[] = [];
  if (overdue.length) groups.push({ key: 'overdue', label: 'Atrasadas', kind: 'overdue', orders: overdue.sort(byDueThenName) });

  for (const key of [...byDay.keys()].sort()) {
    const label = key === todayKey ? 'Hoy'
      : key === tomorrowKey ? 'Mañana'
      : format(new Date(`${key}T12:00:00`), "EEEE d 'de' MMM", { locale: es });
    const groupKey = key === todayKey ? 'today' : key === tomorrowKey ? 'tomorrow' : `day:${key}`;
    groups.push({ key: groupKey, label, kind: 'day', orders: byDay.get(key)!.sort(byDueThenName) });
  }

  if (later.length) groups.push({ key: 'later', label: 'Más adelante', kind: 'later', orders: later.sort(byDueThenName) });
  if (none.length) groups.push({ key: 'none', label: 'Sin fecha', kind: 'none', orders: none.sort(byDueThenName) });
  return groups;
}
