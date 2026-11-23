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
  /**
   * Id de cuenta (`u-<uid>`) → claves de órdenes (`order.name`) a las que esa
   * persona da seguimiento en "Mis órdenes" aunque el ingeniero asignado sea otro.
   */
  followers: Record<string, string[]>;
  updatedAt: string;
}

/** Sin ingenieros fijos: cada persona entra a la lista al asignarse una orden. */
export const DEFAULT_ENGINEERS: EngineerRosterItem[] = [];

export const SUBTAB_ALL = '';
export const SUBTAB_DIRECT = '__direct__';

export interface MyOrdersSubtab {
  id: string;
  label: string;
  count: number;
  isManual?: boolean;
}

const MIN_NAME = 2;
const MAX_NAME = 50;
export const MAX_ASSIGNMENTS_BYTES = 850_000;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const utf8Encoder = new TextEncoder();

export class AssignmentValidationError extends Error {}

export function assertAssignmentsWithinSizeLimit(payload: OrderAssignmentsPayload): void {
  if (utf8Encoder.encode(JSON.stringify(payload)).length > MAX_ASSIGNMENTS_BYTES) {
    throw new Error('El registro de asignaciones alcanzó el tamaño máximo permitido.');
  }
}

export function pruneOrderAssignments(
  payload: OrderAssignmentsPayload,
  activeKeys: Set<string>,
  now = new Date().toISOString(),
): OrderAssignmentsPayload {
  const nextAssignments: Record<string, string> = {};
  const usedIds = new Set<string>();
  for (const [k, engId] of Object.entries(payload.assignments)) {
    if (activeKeys.has(k)) {
      nextAssignments[k] = engId;
      usedIds.add(engId);
    }
  }
  const nextFollowers: Record<string, string[]> = {};
  for (const [engId, keys] of Object.entries(payload.followers)) {
    const kept = keys.filter(k => activeKeys.has(k));
    if (kept.length > 0) {
      nextFollowers[engId] = kept;
      usedIds.add(engId);
    }
  }
  return {
    engineers: payload.engineers.filter(e => usedIds.has(e.id)),
    assignments: nextAssignments,
    followers: nextFollowers,
    updatedAt: now,
  };
}

/** Ingenieros que antes se sembraron por código y nunca entraron con cuenta: se descartan de lo guardado. */
const LEGACY_SEEDED_IDS = new Set(['edgar-castro', 'antonio-vazquez', 'rogelio']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidOrderKey(k: unknown): k is string {
  return typeof k === 'string' && k.trim() !== '' && k.length <= 100 && !FORBIDDEN_KEYS.has(k);
}

export function normalizeEngineerNameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function manualEngineerId(name: string): string {
  const slug = normalizeEngineerNameKey(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `m-${slug || 'ing'}`;
}

export function isManualEngineerId(id: string): boolean {
  return id.startsWith('m-');
}

export function normalizeOrderAssignments(raw: unknown): OrderAssignmentsPayload {
  const source = isRecord(raw) ? raw : {};
  const engineers = [...DEFAULT_ENGINEERS];
  if (Array.isArray(source.engineers)) {
    for (const item of source.engineers) {
      if (!isRecord(item) || typeof item.id !== 'string' || typeof item.name !== 'string') continue;
      const name = item.name.trim();
      if (!item.id || FORBIDDEN_KEYS.has(item.id) || name.length < MIN_NAME || name.length > MAX_NAME) continue;
      if (LEGACY_SEEDED_IDS.has(item.id) || engineers.some(e => e.id === item.id)) continue;
      engineers.push({ id: item.id, name });
    }
  }
  const assignments: Record<string, string> = {};
  if (isRecord(source.assignments)) {
    for (const [key, value] of Object.entries(source.assignments)) {
      if (FORBIDDEN_KEYS.has(key)) continue;
      if (typeof value === 'string' && engineers.some(e => e.id === value)) assignments[key] = value;
    }
  }
  const followers: Record<string, string[]> = {};
  if (isRecord(source.followers)) {
    for (const [followerId, list] of Object.entries(source.followers)) {
      if (!followerId || FORBIDDEN_KEYS.has(followerId) || LEGACY_SEEDED_IDS.has(followerId)) continue;
      if (!Array.isArray(list)) continue;
      const cleanKeys = Array.from(new Set(list.filter(isValidOrderKey)));
      if (cleanKeys.length > 0) followers[followerId] = cleanKeys;
    }
  }
  const updatedAt = typeof source.updatedAt === 'string' ? source.updatedAt : '';
  return { engineers, assignments, followers, updatedAt };
}

export interface AssignmentActor {
  uid: string;
  name: string | null;
  email: string | null;
}

export interface AssignTarget {
  engineerId?: string;
  engineerName?: string;
}

/** Id de la persona en la lista del equipo: sale de su cuenta, nunca del navegador. */
export const actorEngineerId = (uid: string) => `u-${uid}`;

const actorLabel = (a: AssignmentActor) => {
  const label = (a.name || a.email || a.uid).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  return label.length >= MIN_NAME ? label : label.padEnd(MIN_NAME, '.');
};

function upsertActorInRoster(engineers: EngineerRosterItem[], actor: AssignmentActor): {
  id: string;
  engineers: EngineerRosterItem[];
} {
  const id = actorEngineerId(actor.uid);
  const me = { id, name: actorLabel(actor) };
  const next = engineers.some(e => e.id === id)
    ? engineers.map(e => (e.id === id ? me : e))
    : [...engineers, me];
  return { id, engineers: next };
}

/** La persona toma las órdenes para sí; si otra las tenía, pasan a ella. */
export function claimOrders(state: OrderAssignmentsPayload, actor: AssignmentActor, orderKeys: string[]): OrderAssignmentsPayload {
  if (!actor.uid) throw new Error('Se requiere una cuenta de personal SMV.');
  const { id, engineers } = upsertActorInRoster(state.engineers, actor);
  const assignments = { ...state.assignments };
  const followers = { ...(state.followers ?? {}) };
  const myFollowed = new Set(followers[id] ?? []);
  for (const key of orderKeys) {
    if (!FORBIDDEN_KEYS.has(key)) {
      assignments[key] = id;
      myFollowed.delete(key);
    }
  }
  if (myFollowed.size > 0) followers[id] = Array.from(myFollowed);
  else delete followers[id];
  return { engineers, assignments, followers, updatedAt: new Date().toISOString() };
}

/**
 * Asigna órdenes a un ingeniero (existente o escrito por nombre al momento) y,
 * si el ingeniero destino es distinto de quien hace la acción, las conserva en
 * la bandeja "Mis órdenes" de quien las asignó para que aparezcan en su subpestaña.
 */
export function assignOrders(
  state: OrderAssignmentsPayload,
  actor: AssignmentActor,
  orderKeys: string[],
  target: AssignTarget,
): OrderAssignmentsPayload {
  if (!actor.uid) throw new Error('Se requiere una cuenta de personal SMV.');
  const { id: actorId, engineers: baseEngineers } = upsertActorInRoster(state.engineers, actor);
  let engineers = [...baseEngineers];

  let targetEngineer: EngineerRosterItem | undefined;
  const rawId = target.engineerId?.trim() ?? '';
  const rawName = (target.engineerName ?? '').replace(/\s+/g, ' ').trim();

  if (rawId) {
    if (FORBIDDEN_KEYS.has(rawId)) throw new AssignmentValidationError('Ingeniero inválido.');
    targetEngineer = engineers.find(e => e.id === rawId);
    if (!targetEngineer) {
      if (rawName.length >= MIN_NAME && rawName.length <= MAX_NAME) {
        targetEngineer = { id: rawId, name: rawName };
        engineers.push(targetEngineer);
      } else {
        throw new AssignmentValidationError('Ingeniero no encontrado.');
      }
    }
  } else if (rawName) {
    if (rawName.length < MIN_NAME || rawName.length > MAX_NAME) {
      throw new AssignmentValidationError('El nombre del ingeniero debe tener entre 2 y 50 caracteres.');
    }
    const nameKey = normalizeEngineerNameKey(rawName);
    targetEngineer = engineers.find(e => normalizeEngineerNameKey(e.name) === nameKey);
    if (!targetEngineer) {
      const id = manualEngineerId(rawName);
      const byId = engineers.find(e => e.id === id);
      if (byId) {
        targetEngineer = { id, name: rawName };
        engineers = engineers.map(e => (e.id === id ? targetEngineer! : e));
      } else {
        targetEngineer = { id, name: rawName };
        engineers.push(targetEngineer);
      }
    }
  } else {
    throw new AssignmentValidationError('Indica el ingeniero a asignar.');
  }

  const assignments = { ...state.assignments };
  const followers = { ...(state.followers ?? {}) };
  const myFollowed = new Set(followers[actorId] ?? []);

  for (const key of orderKeys) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    assignments[key] = targetEngineer.id;
    if (targetEngineer.id === actorId) {
      myFollowed.delete(key);
    } else {
      myFollowed.add(key);
    }
  }

  if (myFollowed.size > 0) followers[actorId] = Array.from(myFollowed);
  else delete followers[actorId];

  return { engineers, assignments, followers, updatedAt: new Date().toISOString() };
}

/**
 * Agrega órdenes a la bandeja "Mis órdenes" de la persona sin quitarle la
 * asignación al ingeniero que ya la tiene (útil cuando un ingeniero con cuenta
 * se asignó su orden y Lorena también necesita darle seguimiento).
 */
export function followOrders(
  state: OrderAssignmentsPayload,
  actor: AssignmentActor,
  orderKeys: string[],
): OrderAssignmentsPayload {
  if (!actor.uid) throw new Error('Se requiere una cuenta de personal SMV.');
  const { id: actorId, engineers } = upsertActorInRoster(state.engineers, actor);
  const assignments = { ...state.assignments };
  const followers = { ...(state.followers ?? {}) };
  const myFollowed = new Set(followers[actorId] ?? []);

  for (const key of orderKeys) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    const currentOwner = assignments[key];
    if (!currentOwner) {
      assignments[key] = actorId;
      myFollowed.delete(key);
    } else if (currentOwner !== actorId) {
      myFollowed.add(key);
    }
  }

  if (myFollowed.size > 0) followers[actorId] = Array.from(myFollowed);
  else delete followers[actorId];

  return { engineers, assignments, followers, updatedAt: new Date().toISOString() };
}

/**
 * La persona suelta lo que tiene asignado o en seguimiento. Si la orden estaba
 * asignada a un ingeniero sin cuenta (`m-*`) y ella la coordinaba, también
 * limpia la asignación de la orden; si era de otro ingeniero con cuenta (`u-*`),
 * solo la quita de su seguimiento para no arrebatársela.
 */
export function releaseOrders(state: OrderAssignmentsPayload, uid: string, orderKeys: string[]): OrderAssignmentsPayload {
  const id = actorEngineerId(uid);
  const assignments = { ...state.assignments };
  const followers = { ...(state.followers ?? {}) };
  const myFollowed = new Set(followers[id] ?? []);

  for (const key of orderKeys) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    const wasFollowed = myFollowed.delete(key);
    if (assignments[key] === id) {
      delete assignments[key];
    } else if (wasFollowed && assignments[key] && isManualEngineerId(assignments[key])) {
      const stillFollowedByOther = Object.entries(followers).some(
        ([otherId, keys]) => otherId !== id && keys.includes(key),
      );
      if (!stillFollowedByOther) delete assignments[key];
    }
  }

  if (myFollowed.size > 0) followers[id] = Array.from(myFollowed);
  else delete followers[id];

  return { engineers: state.engineers, assignments, followers, updatedAt: new Date().toISOString() };
}

export function getOrderEngineerId(assignments: Record<string, string>, order: { id: number; name: string }): string | null {
  return assignments[order.name] ?? assignments[String(order.id)] ?? null;
}

export function isOrderFollowedBy(
  followers: Record<string, string[]> | undefined,
  engineerId: string | null,
  order: { id: number; name: string },
): boolean {
  if (!followers || !engineerId) return false;
  const list = followers[engineerId];
  if (!list || list.length === 0) return false;
  return list.includes(order.name) || list.includes(String(order.id));
}

export function isOrderInEngineerTray(
  state: Pick<OrderAssignmentsPayload, 'assignments' | 'followers'>,
  engineerId: string | null,
  order: { id: number; name: string },
): boolean {
  if (!engineerId) return false;
  return getOrderEngineerId(state.assignments, order) === engineerId
    || isOrderFollowedBy(state.followers, engineerId, order);
}

/**
 * Construye las subpestañas de "Mis órdenes" para una persona:
 * - "Todas" (directas + seguidas de otros ingenieros)
 * - "Mías directas" (las que tienen su propio id como responsable)
 * - Una subpestaña por cada ingeniero con órdenes en su seguimiento (o dado de alta sin cuenta).
 */
export function buildMyOrdersSubtabs(
  state: Pick<OrderAssignmentsPayload, 'engineers' | 'assignments' | 'followers'>,
  myEngineerId: string | null,
  orders: ReadonlyArray<{ id: number; name: string }>,
): MyOrdersSubtab[] {
  if (!myEngineerId) return [];
  const engineerNames = new Map(state.engineers.map(e => [e.id, e.name]));
  let total = 0;
  let direct = 0;
  const byOther = new Map<string, number>();

  for (const order of orders) {
    if (!isOrderInEngineerTray(state, myEngineerId, order)) continue;
    total += 1;
    const ownerId = getOrderEngineerId(state.assignments, order);
    if (!ownerId || ownerId === myEngineerId) {
      direct += 1;
    } else if (engineerNames.has(ownerId)) {
      byOther.set(ownerId, (byOther.get(ownerId) ?? 0) + 1);
    } else {
      direct += 1;
    }
  }

  const otherSubtabs: MyOrdersSubtab[] = [];
  for (const eng of state.engineers) {
    if (eng.id === myEngineerId) continue;
    const count = byOther.get(eng.id) ?? 0;
    if (count > 0 || isManualEngineerId(eng.id)) {
      otherSubtabs.push({
        id: eng.id,
        label: eng.name,
        count,
        isManual: isManualEngineerId(eng.id),
      });
    }
  }

  return [
    { id: SUBTAB_ALL, label: 'Todas', count: total },
    { id: SUBTAB_DIRECT, label: 'Mías directas', count: direct },
    ...otherSubtabs,
  ];
}

export function matchesMyOrdersSubtab(
  state: Pick<OrderAssignmentsPayload, 'assignments' | 'followers'>,
  myEngineerId: string | null,
  subtab: string,
  order: { id: number; name: string },
): boolean {
  if (!isOrderInEngineerTray(state, myEngineerId, order)) return false;
  if (!subtab || subtab === SUBTAB_ALL) return true;
  const ownerId = getOrderEngineerId(state.assignments, order);
  if (subtab === SUBTAB_DIRECT) return !ownerId || ownerId === myEngineerId;
  return ownerId === subtab;
}

/** Valida el body de claim/release/follow: { orderKeys: string[] } (1 a 2000 claves). */
export function parseOrderKeys(body: unknown): string[] {
  const keys = isRecord(body) ? body.orderKeys : undefined;
  if (
    !Array.isArray(keys) ||
    keys.length === 0 ||
    keys.length > 2000 ||
    !keys.every(isValidOrderKey)
  ) {
    throw new Error('orderKeys inválido.');
  }
  return keys;
}

/** Valida el body de assign: { orderKeys: string[], engineerId?: string, engineerName?: string }. */
export function parseAssignBody(body: unknown): { orderKeys: string[]; target: AssignTarget } {
  const orderKeys = parseOrderKeys(body);
  const rec = body as Record<string, unknown>;
  const engineerId = typeof rec.engineerId === 'string' ? rec.engineerId.trim() : '';
  const engineerName = typeof rec.engineerName === 'string' ? rec.engineerName.replace(/\s+/g, ' ').trim() : '';

  if (engineerId && (engineerId.length > 100 || FORBIDDEN_KEYS.has(engineerId))) {
    throw new AssignmentValidationError('Ingeniero inválido.');
  }
  if (!engineerId && !engineerName) {
    throw new AssignmentValidationError('Indica el ingeniero a asignar.');
  }
  if (!engineerId && (engineerName.length < MIN_NAME || engineerName.length > MAX_NAME)) {
    throw new AssignmentValidationError('El nombre del ingeniero debe tener entre 2 y 50 caracteres.');
  }
  return {
    orderKeys,
    target: {
      ...(engineerId ? { engineerId } : {}),
      ...(engineerName ? { engineerName } : {}),
    },
  };
}
