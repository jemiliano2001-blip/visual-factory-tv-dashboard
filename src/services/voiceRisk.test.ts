import assert from 'node:assert/strict';
import test from 'node:test';
import type { OdooSaleOrder } from './odoo';
import {
  getVoiceRiskFocusedOrders,
  isVoiceRiskQuestion,
  validateVoiceRiskFocus,
} from './voiceRisk';

const order = (id: number, overrides: Partial<OdooSaleOrder> = {}): OdooSaleOrder => ({
  id,
  name: `2026/S${String(id).padStart(5, '0')}`,
  customer_reference: null,
  partner_name: `Cliente ${id}`,
  main_product: `Producto ${id}`,
  date_order: '2026-08-01 00:00:00',
  commitment_date: '2026-08-10 00:00:00',
  invoice_status: 'to invoice',
  currency: 'MXN',
  qty_total: 100,
  qty_delivered: 50,
  state: 'sale',
  salesperson: null,
  lines_count: 1,
  lines: [{ name: `Producto ${id}`, qty: 100, delivered: 50 }],
  deliveries: [],
  note: null,
  ...overrides,
});

test('valida y enriquece hasta tres PO reales elegidas por Gemini', () => {
  const orders = [order(1), order(2), order(3)];

  const result = validateVoiceRiskFocus({
    action: 'focus',
    risk_orders: [
      { po_number: '2026/S00002', reason: 'Fecha próxima con avance parcial.' },
      { po_number: '2026/S00001', reason: 'Retraso acumulado.' },
    ],
  }, orders);

  assert.deepEqual(result?.map(item => [item.rank, item.po_number, item.client, item.delivery_progress]), [
    [1, '2026/S00002', 'Cliente 2', '50/100 (50%)'],
    [2, '2026/S00001', 'Cliente 1', '50/100 (50%)'],
  ]);
});

test('rechaza selección de riesgo con PO duplicada, desconocida o más de tres elementos', () => {
  const orders = [order(1), order(2), order(3), order(4)];

  assert.equal(validateVoiceRiskFocus({
    action: 'focus',
    risk_orders: [
      { po_number: '2026/S00001', reason: 'Retraso.' },
      { po_number: '2026/S00001', reason: 'Repetida.' },
    ],
  }, orders), null);

  assert.equal(validateVoiceRiskFocus({
    action: 'focus',
    risk_orders: [{ po_number: '2026/S99999', reason: 'No existe.' }],
  }, orders), null);

  assert.equal(validateVoiceRiskFocus({
    action: 'focus',
    risk_orders: [
      { po_number: '2026/S00001', reason: 'Uno.' },
      { po_number: '2026/S00002', reason: 'Dos.' },
      { po_number: '2026/S00003', reason: 'Tres.' },
      { po_number: '2026/S00004', reason: 'Cuatro.' },
    ],
  }, orders), null);
});

test('mantiene el foco en orden de prioridad y vuelve al catálogo completo al limpiarlo', () => {
  const orders = [order(1), order(2), order(3)];

  assert.deepEqual(
    getVoiceRiskFocusedOrders(orders, ['2026/S00003', '2026/S00001']).map(item => item.name),
    ['2026/S00003', '2026/S00001'],
  );
  assert.deepEqual(getVoiceRiskFocusedOrders(orders, []).map(item => item.name), orders.map(item => item.name));
});

test('envía preguntas de riesgos a Gemini y conserva los comandos simples en la vía rápida', () => {
  assert.equal(isVoiceRiskQuestion('¿Qué requiere atención hoy?'), true);
  assert.equal(isVoiceRiskQuestion('¿Qué es lo más urgente?'), true);
  assert.equal(isVoiceRiskQuestion('Muestra las órdenes vencidas'), false);
  assert.equal(isVoiceRiskQuestion('Busca la orden 142'), false);
});
