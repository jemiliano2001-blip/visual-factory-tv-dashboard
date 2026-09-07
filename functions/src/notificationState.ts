export interface NotificationState {
  sentAlerts: Record<string, number>;
  knownOrderIds: number[];
  deliveredOrderIds: number[];
  deliveryTimestamps: Record<string, { detectedAt: number; ageAtDelivery: number }>;
  clientAlertDates: Record<string, string>;
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
  deliveredOrderIds: [],
  deliveryTimestamps: {},
  clientAlertDates: {},
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

function pruneDeliveryHistory(state: NotificationState): NotificationState {
  const cutoff = Date.now() - DELIVERY_HISTORY_RETENTION_MS;
  const prunedEntries = Object.entries(state.deliveryTimestamps ?? {})
    .filter(([, value]) => value.detectedAt >= cutoff)
    .sort((a, b) => b[1].detectedAt - a[1].detectedAt)
    .slice(0, MAX_DELIVERY_HISTORY_ENTRIES);

  const deliveryTimestamps: NotificationState['deliveryTimestamps'] = {};
  for (const [key, value] of prunedEntries) deliveryTimestamps[key] = value;

  const validIds = new Set(Object.keys(deliveryTimestamps).map(id => Number(id)));
  const deliveredOrderIds = (state.deliveredOrderIds ?? []).filter(id => validIds.has(id));
  const baselineEntries = Object.entries(state.weeklyBaselineOverdue ?? {})
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, MAX_WEEKLY_BASELINE_WEEKS);
  const weeklyBaselineOverdue: NotificationState['weeklyBaselineOverdue'] = {};
  for (const [key, value] of baselineEntries) weeklyBaselineOverdue[key] = value;

  return { ...state, deliveryTimestamps, deliveredOrderIds, weeklyBaselineOverdue };
}

export function createNotificationStatePatch<K extends keyof NotificationState>(
  state: NotificationState,
  fields: readonly K[],
): Pick<NotificationState, K> {
  const pruned = pruneDeliveryHistory(state);
  return Object.fromEntries(fields.map(field => [field, pruned[field]])) as Pick<NotificationState, K>;
}

export interface NotificationStateDocument {
  set(data: Partial<NotificationState>, options: { merge: boolean }): Promise<unknown>;
}

export async function persistNotificationState(
  document: NotificationStateDocument,
  state: NotificationState,
  fields: readonly (keyof NotificationState)[],
): Promise<void> {
  const patch = createNotificationStatePatch(state, fields);
  await document.set(patch, { merge: true });
}
