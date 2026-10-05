import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkThresholds,
  checkEvents,
  orderAgeEmbed,
  reportEmbed,
  type NotifOrder,
  type NotificationRuntime,
} from './notifications';
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

test('al registrar una orden nueva, despacha notificación con SO, ingeniero y smart text estructurado', async () => {
  const state = structuredClone(EMPTY_STATE);
  state.knownOrderIds = [999]; // Para que no sea firstRun
  const f = fixture(true, state);

  const newOrder: NotifOrder = {
    id: 501,
    name: '2026/S00501',
    partner_name: 'Continental Automotriz',
    date_order: new Date().toISOString(),
    main_product: 'Fabricación y maquinado de fixture para ensamble automático de piezas de aluminio',
    commitment_date: null,
    lines_count: 3,
    deliveries: [],
    note: '<p>Asignada a la ingeniera María López para fabricación urgente.</p>',
  };

  await checkEvents([newOrder], channels, f.runtime);

  assert.equal(f.messages.length, 1);
  const embed = f.messages[0].embeds[0];
  assert.ok(embed);
  // Contiene SO
  assert.match(embed.title + (embed.description ?? ''), /2026\/S00501/);
  // Contiene ingeniero asignado
  assert.match(embed.description ?? '', /Ingeniero asignado:\*\* Ing\. María López/);
  // Contiene smart text estructurado con abreviaciones de manufactura
  assert.match(embed.description ?? '', /Smart Text\):\*\*.*Fab\..*Maq\..*Ensam\..*Auto\..*Alum\./i);
  // Flag / indicador de severidad
  assert.match(embed.description ?? '', /NUEVA ORDEN/);
});

test('las órdenes críticas se diferencian claramente por indicador visual y severidad', async () => {
  const state = structuredClone(EMPTY_STATE);
  state.knownOrderIds = [999];
  const f = fixture(true, state);

  const criticalOrder: NotifOrder = {
    id: 502,
    name: '2026/S00502',
    partner_name: 'Bosch Planta Toluca',
    date_order: '2026-01-05 08:00:00', // Muy atrasada (>14 días)
    main_product: 'Mantenimiento de transportador industrial',
    commitment_date: '2026-01-20 00:00:00',
    lines_count: 2,
    deliveries: [{ state: 'assigned' }],
    lines: [{ name: 'Línea de producción / Ing. José Núñez' }],
  };

  await checkEvents([criticalOrder], channels, f.runtime);

  assert.equal(f.messages.length, 1);
  const embed = f.messages[0].embeds[0];
  assert.ok(embed);
  assert.match(embed.description ?? '', /🔴 CRÍTICA/);
  assert.match(embed.description ?? '', /Ingeniero asignado:\*\* Ing\. José Núñez/);
  assert.match(embed.description ?? '', /Smart Text\):\*\*.*Mant\..*Transp\..*Ind\./i);
  // Color rojo crítico
  assert.equal(embed.color, 0xDC2626);
});

test('una ráfaga de órdenes concurrentes se procesa en una sola notificación consolidada anti-spam', async () => {
  const state = structuredClone(EMPTY_STATE);
  state.knownOrderIds = [999];
  const f = fixture(true, state);

  const burstOrders: NotifOrder[] = [
    {
      id: 601,
      name: '2026/S00601',
      partner_name: 'Cliente Alpha',
      date_order: new Date().toISOString(),
      main_product: 'Servicio de soldadura y pintura',
      commitment_date: null,
      lines_count: 1,
      deliveries: [],
      salesperson: 'Ing. David Ramos',
    },
    {
      id: 602,
      name: '2026/S00602',
      partner_name: 'Cliente Beta',
      date_order: new Date().toISOString(),
      main_product: 'Calibración de herramienta hidráulica',
      commitment_date: null,
      lines_count: 1,
      deliveries: [],
      note: 'Responsable: Ing. Sofía Morales',
    },
    {
      id: 603,
      name: '2026/S00603',
      partner_name: 'Cliente Gamma',
      date_order: '2026-01-10 00:00:00', // Crítica
      main_product: 'Ensamble de conectores',
      commitment_date: null,
      lines_count: 2,
      deliveries: [],
      engineer: 'Ing. Roberto Silva',
    },
  ];

  await checkEvents(burstOrders, channels, f.runtime);

  // Evita el spam de 3 mensajes individuales consecutivos; despacha 1 solo mensaje consolidado
  assert.equal(f.messages.length, 1);
  const embed = f.messages[0].embeds[0];
  assert.ok(embed);
  assert.match(embed.title, /Resumen consolidado: 3 órdenes/);

  // Verifica que el detalle individual de cada orden es accesible dentro de la consolidación
  assert.match(embed.description ?? '', /2026\/S00601/);
  assert.match(embed.description ?? '', /Ing\. David Ramos/);
  assert.match(embed.description ?? '', /Serv\..*Sold\..*Pint\./);

  assert.match(embed.description ?? '', /2026\/S00602/);
  assert.match(embed.description ?? '', /Ing\. Sofía Morales/);
  assert.match(embed.description ?? '', /Calib\..*Herr\..*Hidr\./);

  assert.match(embed.description ?? '', /2026\/S00603/);
  assert.match(embed.description ?? '', /🔴 \[CRÍTICA\]/);
  assert.match(embed.description ?? '', /Ing\. Roberto Silva/);

  // Las 3 órdenes quedan registradas en knownOrderIds
  assert.ok(f.state.knownOrderIds.includes(601));
  assert.ok(f.state.knownOrderIds.includes(602));
  assert.ok(f.state.knownOrderIds.includes(603));
});

test('el canal de reportes mantiene intacto su formato, schema y flujo de entrega', () => {
  const report = reportEmbed('📊 Reporte de prueba', ['Línea 1', 'Línea 2'], 0x1E40AF);
  assert.equal(report.title, '📊 Reporte de prueba');
  assert.equal(report.color, 0x1E40AF);
  assert.match(report.description ?? '', /Línea 1\nLínea 2/);
  assert.equal(report.footer.text, 'Visual Factory TV · Odoo');
});

