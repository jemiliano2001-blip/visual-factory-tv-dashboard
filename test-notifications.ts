// Smoke test para notificaciones de Discord.
// Carga variables de .env.local, .env y functions/.env
// Requiere: npm --prefix functions run build
//
// Uso:
//   npx tsx test-notifications.ts                  → ping al webhook principal
//   npx tsx test-notifications.ts channels         → prueba #ordenes, #criticas y #reportes
//   npx tsx test-notifications.ts ordenes            → solo canal eventos (#ordenes)
//   npx tsx test-notifications.ts criticas           → solo canal críticas
//   npx tsx test-notifications.ts reportes           → solo canal reportes
//   npx tsx test-notifications.ts morning            → reporte matutino (requiere npm run server)
//   npx tsx test-notifications.ts chart              → resumen semanal con gráfica
//   npx tsx test-notifications.ts weekend | monthly
import { existsSync } from 'node:fs';
import * as dotenv from 'dotenv';

if (existsSync('.env.local')) dotenv.config({ path: '.env.local' });
dotenv.config();
if (existsSync('functions/.env')) dotenv.config({ path: 'functions/.env' });

const COMPILED_NOTIF = 'functions/lib/functions/src/notifications.js';
if (!existsSync(COMPILED_NOTIF)) {
  console.error('❌ Compila functions primero: npm --prefix functions run build');
  process.exit(1);
}

const notif = await import(`./${COMPILED_NOTIF}`) as typeof import('./functions/lib/functions/src/notifications.js');

const {
  sendWebhook,
  reportEmbed,
  orderAgeEmbed,
  buildWebhookChannels,
  sendWeekendReport,
  sendMonthlyReport,
  sendMorningReport,
  sendWeeklySummary,
} = notif;

interface NotifOrder {
  id: number;
  name: string;
  partner_name: string;
  date_order: string;
  main_product: string;
  commitment_date: string | null;
  lines_count: number;
  deliveries: { state: string; date_done?: string | null }[];
}

type ChannelKey = 'eventos' | 'criticas' | 'reportes';

const mainUrl = process.env.DISCORD_WEBHOOK_URL;
if (!mainUrl) {
  console.error('❌ DISCORD_WEBHOOK_URL no configurado (.env.local, .env o functions/.env)');
  process.exit(1);
}

const channels = buildWebhookChannels(mainUrl);

function maskWebhook(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/');
    const id = parts[parts.length - 2] ?? '?';
    return `discord.com/.../${id}/***`;
  } catch {
    return '(url inválida)';
  }
}

function isFallback(channel: ChannelKey): boolean {
  return channels[channel] === mainUrl;
}

const SAMPLE_ORDER: NotifOrder = {
  id: 99999,
  name: '2026/S09999',
  partner_name: 'CLIENTE DE PRUEBA',
  date_order: '2026-06-01 12:00:00',
  main_product: 'Pieza de prueba — tornillo hexagonal M8x25 acero inox',
  commitment_date: '2026-06-15 00:00:00',
  lines_count: 7,
  deliveries: [
    { state: 'assigned', date_done: null },
    { state: 'done', date_done: '2026-06-10 14:00:00' },
  ],
};

async function getOrders(): Promise<NotifOrder[]> {
  const res = await fetch('http://localhost:3001/api/odoo/invoiceable-orders');
  if (!res.ok) throw new Error(`Proxy respondió ${res.status} — ¿está corriendo npm run server?`);
  const data = await res.json() as { orders: NotifOrder[] };
  return data.orders ?? [];
}

async function testOrdenes(): Promise<boolean> {
  console.log(`[test] #ordenes (eventos) → ${maskWebhook(channels.eventos)}${isFallback('eventos') ? ' (principal)' : ''}`);
  return sendWebhook(channels.eventos, '', [reportEmbed(
    '🧪 Prueba — Canal #ordenes',
    [
      '**Tipo:** evento de ciclo de vida (nueva grande / entregada / parcial)',
      `**Orden ejemplo:** ${SAMPLE_ORDER.name} · ${SAMPLE_ORDER.partner_name}`,
      `**Líneas:** ${SAMPLE_ORDER.lines_count}`,
      '',
      'Si ves este mensaje en #ordenes, el webhook de eventos funciona. ✅',
    ],
    0x2563EB,
  )]);
}

async function testCriticas(): Promise<boolean> {
  console.log(`[test] #criticas → ${maskWebhook(channels.criticas)}${isFallback('criticas') ? ' ⚠️ fallback al principal' : ''}`);
  return sendWebhook(channels.criticas, '', [
    orderAgeEmbed(SAMPLE_ORDER, 14, 0xDC2626, '🧪 Prueba — Canal #criticas', 'Mensaje de prueba — no es una alerta real'),
  ]);
}

async function testReportes(): Promise<boolean> {
  console.log(`[test] #reportes → ${maskWebhook(channels.reportes)}${isFallback('reportes') ? ' ⚠️ fallback al principal' : ''}`);
  return sendWebhook(channels.reportes, '', [reportEmbed(
    '🧪 Prueba — Canal #reportes',
    [
      '**Tipo:** reporte programado (matutino / mediodía / semanal / mensual)',
      '📋 **12** activas · 🟡 **3** >7d · 🔴 **2** >14d · 💀 **0** >30d',
      '',
      'Si ves este mensaje en #reportes, el webhook de reportes funciona. ✅',
    ],
    0x1E40AF,
  )]);
}

async function testAllChannels(): Promise<void> {
  console.log('[test] Verificando los 3 canales de Discord v3...\n');

  const results: { canal: string; ok: boolean }[] = [];

  results.push({ canal: '#ordenes', ok: await testOrdenes() });
  results.push({ canal: '#criticas', ok: await testCriticas() });
  results.push({ canal: '#reportes', ok: await testReportes() });

  console.log('\n── Resumen ──');
  let allOk = true;
  for (const { canal, ok } of results) {
    console.log(`  ${ok ? '✅' : '❌'} ${canal}`);
    if (!ok) allOk = false;
  }

  if (isFallback('criticas')) {
    console.log('\n⚠️  DISCORD_WEBHOOK_URL_CRITICOS no configurado — críticas van al webhook principal.');
  }
  if (isFallback('reportes')) {
    console.log('⚠️  DISCORD_WEBHOOK_URL_REPORTES no configurado — reportes van al webhook principal.');
  }

  if (!allOk) process.exit(1);
  console.log('\n[test] ¡Los 3 canales respondieron correctamente!');
}

const cmd = process.argv[2] ?? 'ping';

if (cmd === 'channels') {
  await testAllChannels();
} else if (cmd === 'ordenes') {
  const ok = await testOrdenes();
  console.log(ok ? '[test] ¡Listo!' : '[test] Falló — revisa el webhook de #ordenes');
  if (!ok) process.exit(1);
} else if (cmd === 'criticas') {
  const ok = await testCriticas();
  console.log(ok ? '[test] ¡Listo!' : '[test] Falló — revisa DISCORD_WEBHOOK_URL_CRITICOS en functions/.env');
  if (!ok) process.exit(1);
} else if (cmd === 'reportes') {
  const ok = await testReportes();
  console.log(ok ? '[test] ¡Listo!' : '[test] Falló — revisa DISCORD_WEBHOOK_URL_REPORTES en functions/.env');
  if (!ok) process.exit(1);
} else if (cmd === 'weekend') {
  console.log('[test] Obteniendo órdenes y enviando cierre de semana...');
  await sendWeekendReport(await getOrders(), channels.reportes);
  console.log('[test] ¡Listo!');
} else if (cmd === 'monthly') {
  console.log('[test] Obteniendo órdenes y enviando reporte mensual...');
  await sendMonthlyReport(await getOrders(), channels.reportes);
  console.log('[test] ¡Listo!');
} else if (cmd === 'morning') {
  console.log('[test] Obteniendo órdenes y enviando reporte matutino...');
  await sendMorningReport(await getOrders(), channels.reportes);
  console.log('[test] ¡Listo!');
} else if (cmd === 'chart') {
  console.log('[test] Obteniendo órdenes y enviando resumen semanal con gráfica...');
  await sendWeeklySummary(await getOrders(), channels.reportes);
  console.log('[test] ¡Listo!');
} else {
  console.log('[test] Enviando ping de prueba al webhook principal...');
  const ok = await sendWebhook(mainUrl, '', [
    reportEmbed('🧪 Prueba — Visual Factory', ['Webhook principal funcionando. ✅', '', 'Prueba los 3 canales con: `npx tsx test-notifications.ts channels`'], 0x16A34A),
  ]);
  console.log(ok ? '[test] ¡Listo!' : '[test] Falló');
  if (!ok) process.exit(1);
}
