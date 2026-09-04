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

test('la persistencia aplica un parche con merge', async () => {
  const writes: Array<{ data: Partial<NotificationState>; merge: boolean }> = [];
  const document = {
    async set(data: Partial<NotificationState>, options: { merge: boolean }): Promise<void> {
      writes.push({ data, merge: options.merge });
    },
  };
  const state = initialState();
  state.weeklyBaselineOverdue['2026-36'] = 3;

  await persistNotificationState(document, state, ['weeklyBaselineOverdue']);

  assert.deepEqual(writes, [{
    data: { weeklyBaselineOverdue: { '2026-36': 3 } },
    merge: true,
  }]);
});

