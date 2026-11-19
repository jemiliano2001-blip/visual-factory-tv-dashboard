export interface NotificationState {
  sentAlerts: Record<string, number>;
  knownOrderIds: number[];
  eventsInitialized?: boolean;
  deliveredOrderIds: number[];
  deliveryTimestamps: Record<string, { detectedAt: number; ageAtDelivery: number }>;
  clientAlertDates: Record<string, string>;
  clientAlertSignatures?: Record<string, string>;
  lastMonthlyReportMonth: string;
  partialDeliveryAlerts: Record<string, number>;
  lastDeliveryStates: Record<string, { sig: string; changedAt: number }>;
  stalledAlerts: Record<string, number>;
  clientMonthlyStats: Record<string, Record<string, string[]>>;
  recoveryNotifications: string[];
  weeklyBaselineOverdue: Record<string, number>;
}

export const EMPTY_STATE: NotificationState = {
  sentAlerts: {},
  knownOrderIds: [],
  eventsInitialized: false,
  deliveredOrderIds: [],
  deliveryTimestamps: {},
  clientAlertDates: {},
  clientAlertSignatures: {},
  lastMonthlyReportMonth: '',
  partialDeliveryAlerts: {},
  lastDeliveryStates: {},
  stalledAlerts: {},
  clientMonthlyStats: {},
  recoveryNotifications: [],
  weeklyBaselineOverdue: {},
};

const DELIVERY_HISTORY_RETENTION_MS = 90 * 86_400_000;
const MAX_DELIVERY_HISTORY_ENTRIES = 1500;
const MAX_WEEKLY_BASELINE_WEEKS = 12;
const MAX_CLIENT_MONTHLY_MONTHS = 6;
const MAX_CLIENT_ALERTS = 200;

function pruneTimestampMap(
  map: Record<string, number> | undefined,
  activeIds: Set<number>,
): Record<string, number> {
  const entries = Object.entries(map ?? {});
  const kept: Array<[string, number]> = [];
  const orphans: Array<[string, number]> = [];
  for (const [key, ts] of entries) {
    if (typeof ts !== 'number' || !Number.isFinite(ts)) continue;
    const numId = Number(key.split('_')[0]);
    if (Number.isFinite(numId) && activeIds.has(numId)) kept.push([key, ts]);
    else orphans.push([key, ts]);
  }
  const extraBudget = Math.max(0, MAX_DELIVERY_HISTORY_ENTRIES - kept.length);
  orphans.sort((a, b) => b[1] - a[1]);
  const out: Record<string, number> = {};
  for (const [k, v] of [...kept, ...orphans.slice(0, extraBudget)]) out[k] = v;
  return out;
}

function pruneDeliveryHistory(state: NotificationState): NotificationState {
  const now = Date.now();
  const cutoff = now - DELIVERY_HISTORY_RETENTION_MS;
  const prunedEntries = Object.entries(state.deliveryTimestamps ?? {})
    .filter(([, value]) => value.detectedAt >= cutoff)
    .sort((a, b) => b[1].detectedAt - a[1].detectedAt)
    .slice(0, MAX_DELIVERY_HISTORY_ENTRIES);

  const deliveryTimestamps: NotificationState['deliveryTimestamps'] = {};
  for (const [key, value] of prunedEntries) deliveryTimestamps[key] = value;

  const validIds = new Set(Object.keys(deliveryTimestamps).map(id => Number(id)));
  const knownIds = new Set(state.knownOrderIds);
  const deliveredOrderIds = (state.deliveredOrderIds ?? []).filter(id => validIds.has(id) || knownIds.has(id));
  const activeIds = new Set<number>([...knownIds, ...deliveredOrderIds]);

  const baselineEntries = Object.entries(state.weeklyBaselineOverdue ?? {})
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, MAX_WEEKLY_BASELINE_WEEKS);
  const weeklyBaselineOverdue: NotificationState['weeklyBaselineOverdue'] = {};
  for (const [key, value] of baselineEntries) weeklyBaselineOverdue[key] = value;

  const sentAlerts = pruneTimestampMap(state.sentAlerts, activeIds);
  const partialDeliveryAlerts = pruneTimestampMap(state.partialDeliveryAlerts, activeIds);
  const stalledAlerts = pruneTimestampMap(state.stalledAlerts, activeIds);

  const stateEntries = Object.entries(state.lastDeliveryStates ?? {});
  const activeStateEntries = stateEntries.filter(([k]) => activeIds.has(Number(k)));
  const orphanStateEntries = stateEntries
    .filter(([k]) => !activeIds.has(Number(k)))
    .sort((a, b) => b[1].changedAt - a[1].changedAt)
    .slice(0, Math.max(0, MAX_DELIVERY_HISTORY_ENTRIES - activeStateEntries.length));
  const lastDeliveryStates: NotificationState['lastDeliveryStates'] = {};
  for (const [k, v] of [...activeStateEntries, ...orphanStateEntries]) lastDeliveryStates[k] = v;

  const recoveryNotifications = (state.recoveryNotifications ?? [])
    .filter(k => activeIds.has(Number(k)))
    .slice(-MAX_DELIVERY_HISTORY_ENTRIES);

  const clientMonthlyStats: NotificationState['clientMonthlyStats'] = {};
  const allMonths = new Set<string>();
  for (const monthsMap of Object.values(state.clientMonthlyStats ?? {})) {
    for (const month of Object.keys(monthsMap ?? {})) allMonths.add(month);
  }
  const keptMonths = new Set([...allMonths].sort((a, b) => b.localeCompare(a)).slice(0, MAX_CLIENT_MONTHLY_MONTHS));
  for (const [client, monthsMap] of Object.entries(state.clientMonthlyStats ?? {})) {
    const nextMonths: Record<string, string[]> = {};
    for (const [month, ids] of Object.entries(monthsMap ?? {})) {
      if (keptMonths.has(month) && Array.isArray(ids) && ids.length > 0) nextMonths[month] = ids;
    }
    if (Object.keys(nextMonths).length > 0) clientMonthlyStats[client] = nextMonths;
  }

  const cutoffDateStr = new Date(cutoff).toISOString().slice(0, 10);
  const clientAlertDates: Record<string, string> = {};
  for (const [client, dateStr] of Object.entries(state.clientAlertDates ?? {})
    .filter(([, d]) => typeof d === 'string' && d >= cutoffDateStr)
    .slice(-MAX_CLIENT_ALERTS)) {
    clientAlertDates[client] = dateStr;
  }

  const sigEntries = Object.entries(state.clientAlertSignatures ?? {}).slice(-MAX_CLIENT_ALERTS);
  const clientAlertSignatures: Record<string, string> = {};
  for (const [client, sig] of sigEntries) clientAlertSignatures[client] = sig;

  return {
    ...state,
    deliveryTimestamps,
    deliveredOrderIds,
    weeklyBaselineOverdue,
    sentAlerts,
    partialDeliveryAlerts,
    stalledAlerts,
    lastDeliveryStates,
    recoveryNotifications,
    clientMonthlyStats,
    clientAlertDates,
    clientAlertSignatures,
  };
}

export function createNotificationStatePatch<K extends keyof NotificationState>(
  state: NotificationState,
  fields: readonly K[],
): Pick<NotificationState, K> {
  const pruned = pruneDeliveryHistory(state);
  return Object.fromEntries(fields.map(field => [field, pruned[field]])) as Pick<NotificationState, K>;
}

export interface NotificationStateDocument {
  set(data: Partial<NotificationState>, options: { mergeFields: string[] }): Promise<unknown>;
}

export async function persistNotificationState(
  document: NotificationStateDocument,
  state: NotificationState,
  fields: readonly (keyof NotificationState)[],
): Promise<void> {
  const patch = createNotificationStatePatch(state, fields);
  // Sustituir cada mapa de esta tarea también persiste claves borradas.
  await document.set(patch, { mergeFields: [...fields] });
}
