/**
 * Vista combinada de horarios de entrega por cliente para Configuración.
 * Odoo manda sobre el horario manual (misma prioridad que getEffectiveDeliverySchedule);
 * aquí solo se hace visible de dónde sale cada horario. Lógica pura.
 */
import type { CompanyConfig } from '../types';
import { normalizeCompanyName } from './companyConfigGuards';

export type ScheduleSource = 'odoo' | 'manual' | 'none';

export interface ScheduleRow {
  key: string;
  name: string;
  odoo: string | null;
  manual: string | null;
  configId: string | null;
  updatedAt: Date | null;
  source: ScheduleSource;
  /** Hay horario manual pero ningún cliente con órdenes abiertas. */
  orphan: boolean;
}

interface OrderLike { partner_name: string; delivery_times?: string | null }

export const MAX_NAME_LENGTH = 100;
export const MAX_SCHEDULE_LENGTH = 500;

const clean = (v: string | null | undefined): string | null => {
  const t = typeof v === 'string' ? v.trim() : '';
  return t || null;
};

export function buildScheduleRows(orders: readonly OrderLike[], configs: readonly CompanyConfig[]): ScheduleRow[] {
  const rows = new Map<string, ScheduleRow>();
  const blank = (key: string, name: string): ScheduleRow => ({
    key, name, odoo: null, manual: null, configId: null, updatedAt: null, source: 'none', orphan: false,
  });

  for (const order of orders) {
    const name = order.partner_name?.trim();
    if (!name) continue;
    const key = normalizeCompanyName(name);
    const row = rows.get(key) ?? blank(key, name);
    row.odoo ??= clean(order.delivery_times);
    rows.set(key, row);
  }

  for (const config of configs) {
    const name = config.company_name?.trim();
    if (!name) continue;
    const key = normalizeCompanyName(name);
    const existing = rows.get(key);
    const row = existing ?? { ...blank(key, name), orphan: true };
    row.manual = clean(config.delivery_schedule);
    row.configId = config.id ?? null;
    row.updatedAt = config.updatedAt && config.updatedAt.getTime() > 0 ? config.updatedAt : null;
    rows.set(key, row);
  }

  for (const row of rows.values()) {
    row.source = row.odoo ? 'odoo' : row.manual ? 'manual' : 'none';
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'es-MX'));
}

/**
 * La TV busca el horario manual por nombre EXACTO de Odoo (`getEffectiveDeliverySchedule`),
 * así que un nombre escrito a mano que coincide con un cliente de Odoo se guarda con el de Odoo.
 */
export function resolveClientName(input: string, rows: readonly ScheduleRow[]): string {
  const trimmed = input.trim();
  const match = rows.find(r => !r.orphan && r.key === normalizeCompanyName(trimmed));
  return match ? match.name : trimmed;
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es-MX');

export function filterScheduleRows(rows: readonly ScheduleRow[], term: string): ScheduleRow[] {
  const q = fold(term.trim());
  if (!q) return [...rows];
  return rows.filter(r => fold(r.name).includes(q));
}

export type ScheduleValidation = { ok: true } | { ok: false; error: string };

export function validateScheduleInput(name: string, schedule: string): ScheduleValidation {
  const n = name.trim();
  const s = schedule.trim();
  if (!n) return { ok: false, error: 'Escribe el nombre del cliente.' };
  if (n.length > MAX_NAME_LENGTH) return { ok: false, error: `El nombre admite hasta ${MAX_NAME_LENGTH} caracteres.` };
  if (!s) return { ok: false, error: 'Escribe el horario de entrega.' };
  if (s.length > MAX_SCHEDULE_LENGTH) return { ok: false, error: `El horario admite hasta ${MAX_SCHEDULE_LENGTH} caracteres.` };
  return { ok: true };
}
