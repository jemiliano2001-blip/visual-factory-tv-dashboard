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

export interface AssignmentActor {
  uid: string;
  name: string | null;
  email: string | null;
}

/** Id de la persona en la lista del equipo: sale de su cuenta, nunca del navegador. */
export const actorEngineerId = (uid: string) => `u-${uid}`;

const actorLabel = (a: AssignmentActor) => {
  const label = (a.name || a.email || a.uid).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  return label.length >= MIN_NAME ? label : `${label} `.padEnd(MIN_NAME, '.');
};

/** La persona toma las órdenes para sí; si otra las tenía, pasan a ella. */
export function claimOrders(state: OrderAssignmentsPayload, actor: AssignmentActor, orderKeys: string[]): OrderAssignmentsPayload {
  if (!actor.uid) throw new Error('Se requiere una cuenta de personal SMV.');
  const id = actorEngineerId(actor.uid);
  const me = { id, name: actorLabel(actor) };
  const engineers = state.engineers.some(e => e.id === id)
    ? state.engineers.map(e => (e.id === id ? me : e))
    : [...state.engineers, me];
  const assignments = { ...state.assignments };
  for (const key of orderKeys) assignments[key] = id;
  return { engineers, assignments, updatedAt: new Date().toISOString() };
}

/** La persona suelta solo lo que ella tiene asignado. */
export function releaseOrders(state: OrderAssignmentsPayload, uid: string, orderKeys: string[]): OrderAssignmentsPayload {
  const id = actorEngineerId(uid);
  const assignments = { ...state.assignments };
  for (const key of orderKeys) if (assignments[key] === id) delete assignments[key];
  return { engineers: state.engineers, assignments, updatedAt: new Date().toISOString() };
}

export function getOrderEngineerId(assignments: Record<string, string>, order: { id: number; name: string }): string | null {
  return assignments[order.name] ?? assignments[String(order.id)] ?? null;
}

/** Valida el body de claim/release: { orderKeys: string[] } (1 a 2000 claves). */
export function parseOrderKeys(body: unknown): string[] {
  const keys = isRecord(body) ? body.orderKeys : undefined;
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 2000 || !keys.every(k => typeof k === 'string' && k !== '' && k.length <= 100)) {
    throw new Error('orderKeys inválido.');
  }
  return keys as string[];
}
