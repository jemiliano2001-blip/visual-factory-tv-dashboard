// Smoke test para notificaciones de Discord.
// Requiere: npm run server corriendo en :3001
// Uso:
//   npx tsx test-notifications.ts             → ping de prueba
//   npx tsx test-notifications.ts weekend     → cierre de semana
//   npx tsx test-notifications.ts monthly     → reporte mensual
//   npx tsx test-notifications.ts morning     → reporte matutino
import { existsSync } from 'node:fs';
import * as dotenv from 'dotenv';

if (existsSync('.env.local')) dotenv.config({ path: '.env.local' });
dotenv.config();

import {
  sendWebhook, reportEmbed,
  sendWeekendReport, sendMonthlyReport, sendMorningReport,
  type NotifOrder,
} from './src/services/notificationService.js';

const url = process.env.DISCORD_WEBHOOK_URL;
if (!url) {
  console.error('❌ DISCORD_WEBHOOK_URL no configurado en .env.local');
  process.exit(1);
}

async function getOrders(): Promise<NotifOrder[]> {
  const res = await fetch('http://localhost:3001/api/odoo/invoiceable-orders');
  if (!res.ok) throw new Error(`Proxy respondió ${res.status} — ¿está corriendo npm run server?`);
  const data = await res.json() as { orders: NotifOrder[] };
  return data.orders ?? [];
}

const cmd = process.argv[2] ?? 'ping';

if (cmd === 'weekend') {
  console.log('[test] Obteniendo órdenes y enviando cierre de semana...');
  await sendWeekendReport(await getOrders(), url);
  console.log('[test] ¡Listo!');
} else if (cmd === 'monthly') {
  console.log('[test] Obteniendo órdenes y enviando reporte mensual...');
  await sendMonthlyReport(await getOrders(), url);
  console.log('[test] ¡Listo!');
} else if (cmd === 'morning') {
  console.log('[test] Obteniendo órdenes y enviando reporte matutino...');
  await sendMorningReport(await getOrders(), url);
  console.log('[test] ¡Listo!');
} else {
  console.log('[test] Enviando ping de prueba...');
  await sendWebhook(url, '@everyone', [
    reportEmbed('🧪 Prueba — Visual Factory', ['Webhook funcionando. ✅'], 0x16A34A),
  ]);
  console.log('[test] ¡Listo!');
}
