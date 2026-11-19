import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createNotificationStatePatch,
  persistNotificationState,
  type NotificationState,
} from './notificationState';

const initialState = (): NotificationState => ({
  sentAlerts: {},
  knownOrderIds: [10],
  deliveredOrderIds: [],
  deliveryTimestamps: {},
  clientAlertDates: {},
  lastMonthlyReportMonth: '2026-08',
  partialDeliveryAlerts: {},
  lastDeliveryStates: {},
  stalledAlerts: {},
  clientMonthlyStats: {},
  recoveryNotifications: [],
  weeklyBaselineOverdue: {},
});

test('escrituras concurrentes del lunes conservan el estado de deduplicación', () => {
  const thresholdSnapshot = initialState();
  thresholdSnapshot.sentAlerts['42_14d'] = 1_788_518_400_000;

  const eventSnapshot = initialState();
  eventSnapshot.knownOrderIds = [10, 42];
  eventSnapshot.deliveredOrderIds = [77];
  eventSnapshot.deliveryTimestamps['77'] = {
    detectedAt: 1_788_518_400_000,
    ageAtDelivery: 18,
  };

  const morningSnapshot = initialState();
  morningSnapshot.weeklyBaselineOverdue['2026-36'] = 3;

  const stored = initialState();
  Object.assign(stored, createNotificationStatePatch(thresholdSnapshot, [
    'sentAlerts',
    'clientMonthlyStats',
  ]));
  Object.assign(stored, createNotificationStatePatch(eventSnapshot, [
    'knownOrderIds',
    'deliveredOrderIds',
    'deliveryTimestamps',
  ]));
  Object.assign(stored, createNotificationStatePatch(morningSnapshot, [
    'weeklyBaselineOverdue',
  ]));

  assert.equal(stored.sentAlerts['42_14d'], 1_788_518_400_000);
  assert.deepEqual(stored.knownOrderIds, [10, 42]);
  assert.deepEqual(stored.deliveredOrderIds, [77]);
  assert.deepEqual(stored.weeklyBaselineOverdue, { '2026-36': 3 });
});

test('la persistencia aplica un parche sobre los campos de la tarea', async () => {
  const writes: Array<{ data: Partial<NotificationState>; mergeFields: string[] }> = [];
  const document = {
    async set(data: Partial<NotificationState>, options: { mergeFields: string[] }): Promise<void> {
      writes.push({ data, mergeFields: options.mergeFields });
    },
  };
  const state = initialState();
  state.weeklyBaselineOverdue['2026-36'] = 3;

  await persistNotificationState(document, state, ['weeklyBaselineOverdue']);

  assert.deepEqual(writes, [{
    data: { weeklyBaselineOverdue: { '2026-36': 3 } },
    mergeFields: ['weeklyBaselineOverdue'],
  }]);
});

test('reemplaza mapas de la tarea para conservar borrados sin sobrescribir tareas vecinas', async () => {
  let options: unknown;
  const state = initialState();
  await persistNotificationState({ async set(_data, nextOptions) { options = nextOptions; } }, state, ['stalledAlerts']);
  assert.deepEqual(options, { mergeFields: ['stalledAlerts'] });
});

test('retiene deduplicación de entregadas aún presentes aunque venza el historial de 90 días', () => {
  const state = initialState();
  state.deliveredOrderIds = [10];
  state.deliveryTimestamps['10'] = { detectedAt: Date.now() - 100 * 86_400_000, ageAtDelivery: 12 };
  const patch = createNotificationStatePatch(state, ['deliveredOrderIds', 'deliveryTimestamps']);
  assert.deepEqual(patch.deliveredOrderIds, [10]);
  assert.deepEqual(patch.deliveryTimestamps, {});
});

test('poda clientMonthlyStats a los últimos 6 meses y clientAlertDates antiguos', () => {
  const state = initialState();
  state.clientMonthlyStats = {
    Bosch: {
      '2025-01': ['1'], '2025-02': ['2'], '2025-03': ['3'],
      '2025-04': ['4'], '2025-05': ['5'], '2025-06': ['6'], '2025-07': ['7'],
    },
  };
  const recentDate = new Date().toISOString().slice(0, 10);
  state.clientAlertDates = { Viejo: '2020-01-01', Reciente: recentDate };

  const patch = createNotificationStatePatch(state, ['clientMonthlyStats', 'clientAlertDates']);
  assert.equal(Object.keys(patch.clientMonthlyStats.Bosch).length, 6);
  assert.equal(patch.clientMonthlyStats.Bosch['2025-01'], undefined);
  assert.deepEqual(patch.clientMonthlyStats.Bosch['2025-07'], ['7']);
  assert.deepEqual(patch.clientAlertDates, { Reciente: recentDate });
});

