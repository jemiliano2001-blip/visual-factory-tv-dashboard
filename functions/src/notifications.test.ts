import assert from 'node:assert/strict';
import test from 'node:test';
import { checkThresholds, checkEvents, orderAgeEmbed, type NotifOrder, type NotificationRuntime } from './notifications';
import { EMPTY_STATE, type NotificationState } from './notificationState';

const channels = { eventos: 'eventos', criticas: 'criticas', reportes: 'reportes' };
const oldOrder = (id = 42): NotifOrder => ({
  id, name: `2026/S${id}`, partner_name: 'Cliente de prueba', date_order: '2026-01-05 00:00:00',
  main_product: 'Fixture', commitment_date: null, lines_count: 6,
  deliveries: [{ state: 'assigned' }],
});

function fixture(success = true, initial?: NotificationState) {
  const state: NotificationState = structuredClone(initial ?? EMPTY_STATE);
  const messages: Array<{ url: string; content: string; embeds: Parameters<NotificationRuntime['sendWebhook']>[2] }> = [];
  const runtime: NotificationRuntime = {
    async loadState() { return structuredClone(state); },
    async saveState(next, fields) { for (const field of fields) Object.assign(state, { [field]: structuredClone(next[field]) }); },
    async sendWebhook(url, content, embeds) { messages.push({ url, content, embeds }); return success; },
  };
  return { state, messages, runtime };
}

test('una SO antigua avisa solo el nivel mayor y no vuelve a enviar los inferiores', async () => {
  const f = fixture();
  await checkThresholds([oldOrder()], channels, f.runtime);
  assert.equal(f.messages.length, 1);
  assert.equal(f.messages[0].embeds.length, 1);
  assert.ok(f.state.sentAlerts['42_30d']);
  assert.ok(f.state.sentAlerts['42_14d']);
  await checkThresholds([oldOrder()], channels, f.runtime);
  assert.equal(f.messages.length, 1);
});

test('agrupa varias SO del mismo canal en un mensaje', async () => {
  const f = fixture();
  await checkThresholds([oldOrder(1), oldOrder(2), oldOrder(3)], channels, f.runtime);
  assert.equal(f.messages.length, 1);
  assert.equal(f.messages[0].embeds.length, 3);
});

test('divide lotes respetando 10 embeds y 6000 caracteres sin repetir la mención', async () => {
  const f = fixture();
  const roleBefore = process.env.DISCORD_ROLE_GENERAL;
  process.env.DISCORD_ROLE_GENERAL = '123456789';
  try {
    const orders = Array.from({ length: 25 }, (_, index) => ({ ...oldOrder(index + 1), partner_name: 'Cliente '.repeat(50) }));
    await checkThresholds(orders, channels, f.runtime);
    assert.ok(f.messages.length > 1);
    for (const message of f.messages) {
      assert.ok(message.embeds.length <= 10);
      const length = message.embeds.reduce((sum, embed) => sum + embed.title.length + (embed.description?.length ?? 0) + embed.footer.text.length, 0);
      assert.ok(length <= 6000, String(length));
    }
    assert.equal(f.messages.flatMap(message => message.embeds).length, 25);
    assert.equal(f.messages.filter(message => message.content.includes('<@&123456789>')).length, 1);
  } finally {
    if (roleBefore === undefined) delete process.env.DISCORD_ROLE_GENERAL;
    else process.env.DISCORD_ROLE_GENERAL = roleBefore;
  }
});

test('guarda lotes exitosos y reintenta solo las SO del lote fallido', async () => {
  const f = fixture();
  let sends = 0;
  f.runtime.sendWebhook = async () => ++sends !== 2;
  const orders = Array.from({ length: 11 }, (_, index) => oldOrder(index + 1));
  await checkThresholds(orders, channels, f.runtime);
  assert.ok(f.state.sentAlerts['1_30d']);
  assert.equal(f.state.sentAlerts['11_30d'], undefined);
  await checkThresholds(orders, channels, f.runtime);
  assert.ok(f.state.sentAlerts['11_30d']);
  assert.equal(sends, 3);
});

test('si Discord rechaza el lote, los umbrales quedan pendientes para reintento', async () => {
  const f = fixture(false);
  await checkThresholds([oldOrder()], channels, f.runtime);
  assert.deepEqual(f.state.sentAlerts, {});
  assert.deepEqual(f.state.clientMonthlyStats, {});
});

test('las entregas parciales y completas fallidas no se marcan como notificadas', async () => {
  const f = fixture(false);
  const partial = { ...oldOrder(1), deliveries: [{ state: 'done' }, { state: 'assigned' }] };
  const delivered = { ...oldOrder(2), deliveries: [{ state: 'done' }] };
  await checkEvents([partial, delivered], channels, f.runtime);
  assert.deepEqual(f.state.partialDeliveryAlerts, {});
  assert.deepEqual(f.state.deliveredOrderIds, []);
  assert.deepEqual(f.state.deliveryTimestamps, {});
});

test('reintenta una nueva SO aunque el lote fallido deje vacía la línea base', async () => {
  const state = structuredClone(EMPTY_STATE);
  state.knownOrderIds = [10];
  const f = fixture(false, state);
  const recent = { ...oldOrder(42), date_order: new Date().toISOString() };
  await checkEvents([recent], channels, f.runtime);
  await checkEvents([recent], channels, f.runtime);
  assert.equal(f.messages.length, 2);
  assert.deepEqual(f.state.knownOrderIds, []);
});

test('un grupo de cliente sin cambios no repite la alerta al día siguiente', async () => {
  const f = fixture();
  const orders = [oldOrder(1), oldOrder(2), oldOrder(3)];
  await checkEvents(orders, channels, f.runtime);
  const sent = f.messages.length;
  f.state.clientAlertDates['Cliente de prueba'] = '2000-01-01';
  await checkEvents(orders, channels, f.runtime);
  assert.equal(f.messages.length, sent);
});

test('la antigüedad no se presenta como días de atraso y la alerta indica una acción', () => {
  const embed = orderAgeEmbed({ ...oldOrder(), customer_reference: '20264321' }, 35, 0xDC2626, 'Antigüedad');
  assert.match(embed.description ?? '', /35 días hábiles de antigüedad/);
  assert.match(embed.description ?? '', /Acción/);
  assert.match(embed.description ?? '', /PO del cliente:\*\* 20264321/);
});
