import assert from 'node:assert/strict';
import test from 'node:test';
import { hasDuplicateCompanyConfig } from './companyConfigGuards';
import { getEffectiveDeliverySchedule, type OdooSaleOrder } from './odoo';

test('rechaza configuraciones duplicadas aunque cambien mayúsculas o espacios', () => {
  const configs = [{ id: 'a', company_name: 'Nissan Mexicana' }];
  assert.equal(hasDuplicateCompanyConfig(configs, '  nissan   mexicana  '), true);
  assert.equal(hasDuplicateCompanyConfig(configs, 'Nissan Mexicana', 'a'), false);
  assert.equal(hasDuplicateCompanyConfig(configs, 'Bosch'), false);
});

test('getEffectiveDeliverySchedule prioriza Odoo sobre Firestore y hace fallback correcto', () => {
  const odooOrders = [
    { partner_name: 'SUPRAJIT MEXICO', delivery_times: 'Lunes a Viernes 9-11 AM' } as OdooSaleOrder,
    { partner_name: 'BOSCH', delivery_times: null } as unknown as OdooSaleOrder,
  ];
  const firestoreConfigs = [
    { company_name: 'SUPRAJIT MEXICO', delivery_schedule: 'Horario viejo Firestore' },
    { company_name: 'BOSCH', delivery_schedule: 'Lunes a Jueves 8-17 hrs' },
    { company_name: 'MECALUX', delivery_schedule: '10:00 a 14:00' },
  ];

  // 1. Prioriza Odoo cuando existe delivery_times
  assert.equal(
    getEffectiveDeliverySchedule('SUPRAJIT MEXICO', odooOrders, firestoreConfigs),
    'Lunes a Viernes 9-11 AM'
  );

  // 2. Hace fallback a Firestore cuando Odoo no tiene delivery_times
  assert.equal(
    getEffectiveDeliverySchedule('BOSCH', odooOrders, firestoreConfigs),
    'Lunes a Jueves 8-17 hrs'
  );

  // 3. Obtiene horario de Firestore para empresas sin órdenes en memoria
  assert.equal(
    getEffectiveDeliverySchedule('MECALUX', odooOrders, firestoreConfigs),
    '10:00 a 14:00'
  );

  // 4. Retorna null cuando ninguna fuente tiene horario
  assert.equal(
    getEffectiveDeliverySchedule('EMPRESA SIN HORARIO', odooOrders, firestoreConfigs),
    null
  );
});

