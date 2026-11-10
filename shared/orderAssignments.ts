/**
 * Asignación de órdenes (SO) a diseñadores/ingenieros de SMV. Lógica pura,
 * compartida por el frontend, server.ts y las Functions.
 */

export interface EngineerRosterItem {
  id: string;
  name: string;
}

export interface OrderAssignmentsPayload {
  engineers: EngineerRosterItem[];
  /** order.name → id de ingeniero */
  assignments: Record<string, string>;
  updatedAt: string;
}

export const DEFAULT_ENGINEERS: EngineerRosterItem[] = [
  { id: 'edgar-castro', name: 'Edgar Castro' },
  { id: 'antonio-vazquez', name: 'Antonio Vázquez' },
  { id: 'rogelio', name: 'Rogelio' },
];

const MIN_NAME = 2;
const MAX_NAME = 50;

export function slugifyEngineerId(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeOrderAssignments(raw: unknown): OrderAssignmentsPayload {
  const source = isRecord(raw) ? raw : {};
  const engineers = [...DEFAULT_ENGINEERS];
  if (Array.isArray(source.engineers)) {
    for (const item of source.engineers) {
      if (!isRecord(item) || typeof item.id !== 'string' || typeof item.name !== 'string') continue;
      const name = item.name.trim();
      if (!item.id || name.length < MIN_NAME || name.length > MAX_NAME) continue;
      if (engineers.some(e => e.id === item.id)) continue;
      engineers.push({ id: item.id, name });
    }
  }
  const assignments: Record<string, string> = {};
  if (isRecord(source.assignments)) {
    for (const [key, value] of Object.entries(source.assignments)) {
      if (typeof value === 'string' && engineers.some(e => e.id === value)) assignments[key] = value;
    }
  }
  const updatedAt = typeof source.updatedAt === 'string' ? source.updatedAt : '';
  return { engineers, assignments, updatedAt };
}

export function applyOrderAssignmentsMutation(
  state: OrderAssignmentsPayload,
  patch: { orderKeys?: string[]; engineerId?: string | null; addEngineerName?: string; removeEngineerId?: string },
): OrderAssignmentsPayload {
  let engineers = state.engineers;
  let assignments = { ...state.assignments };

  if (patch.addEngineerName !== undefined) {
    const name = patch.addEngineerName.trim();
    const id = slugifyEngineerId(name);
    const duplicated = engineers.some(e => e.id === id || e.name.toLowerCase() === name.toLowerCase());
    if (name.length < MIN_NAME || name.length > MAX_NAME || !id || duplicated) {
      throw new Error('Nombre de ingeniero inválido o repetido (2 a 50 caracteres).');
    }
    engineers = [...engineers, { id, name }];
  }

  if (patch.removeEngineerId !== undefined) {
    engineers = engineers.filter(e => e.id !== patch.removeEngineerId);
    assignments = Object.fromEntries(Object.entries(assignments).filter(([, id]) => id !== patch.removeEngineerId));
  }

  if (patch.orderKeys && patch.engineerId !== undefined) {
    const engineerId = patch.engineerId;
    if (engineerId !== null && !engineers.some(e => e.id === engineerId)) {
      throw new Error('Ingeniero inexistente.');
    }
    for (const key of patch.orderKeys) {
      if (engineerId === null) delete assignments[key];
      else assignments[key] = engineerId;
    }
  }

  return { engineers, assignments, updatedAt: new Date().toISOString() };
}

export function getOrderEngineerId(assignments: Record<string, string>, order: { id: number; name: string }): string | null {
  return assignments[order.name] ?? assignments[String(order.id)] ?? null;
}

export type OrderAssignmentsPatch = Parameters<typeof applyOrderAssignmentsMutation>[1];

/** Valida el body de POST /api/order-assignments; lanza Error si no cumple el contrato. */
export function parseOrderAssignmentsPatch(body: unknown): OrderAssignmentsPatch {
  if (!isRecord(body)) throw new Error('Cuerpo inválido.');
  const patch: OrderAssignmentsPatch = {};
  if (body.orderKeys !== undefined) {
    if (!Array.isArray(body.orderKeys) || body.orderKeys.length > 2000 || !body.orderKeys.every(k => typeof k === 'string' && k !== '' && k.length <= 100)) {
      throw new Error('orderKeys inválido.');
    }
    patch.orderKeys = body.orderKeys as string[];
  }
  if (body.engineerId !== undefined) {
    if (body.engineerId !== null && typeof body.engineerId !== 'string') throw new Error('engineerId inválido.');
    patch.engineerId = body.engineerId;
  }
  if (body.addEngineerName !== undefined) {
    if (typeof body.addEngineerName !== 'string') throw new Error('addEngineerName inválido.');
    patch.addEngineerName = body.addEngineerName;
  }
  if (body.removeEngineerId !== undefined) {
    if (typeof body.removeEngineerId !== 'string') throw new Error('removeEngineerId inválido.');
    patch.removeEngineerId = body.removeEngineerId;
  }
  return patch;
}
