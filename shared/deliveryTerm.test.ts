import assert from 'node:assert/strict';
import test from 'node:test';
import { addBusinessDays, commitmentFromNote, parseDeliveryDaysFromNote } from './deliveryTerm';

test('plazo de la nota: rango en semanas, con HTML', () => {
  assert.deepEqual(parseDeliveryDaysFromNote('<p>TIEMPO DE ENTREGA 2 A 3 SEMANAS.</p>'), { min: 10, max: 15 });
  assert.deepEqual(parseDeliveryDaysFromNote('<p>Tiempo de entrega <b>2</b> a <b>3</b> semanas</p>'), { min: 10, max: 15 });
  assert.deepEqual(parseDeliveryDaysFromNote('Entrega 10&nbsp;días hábiles'), { min: 10, max: 10 });
  assert.deepEqual(parseDeliveryDaysFromNote('Entrega 8 a 12 días hábiles'), { min: 8, max: 12 });
  assert.equal(parseDeliveryDaysFromNote('Tiempo de entrega 999999999 días'), null);
  assert.equal(parseDeliveryDaysFromNote('Tiempo de entrega 1 a 999999999 días'), null);
  assert.equal(parseDeliveryDaysFromNote('Sin plazo, 5 piezas'), null);
  assert.equal(parseDeliveryDaysFromNote(null), null);
});

test('addBusinessDays calcula plazos largos de forma exacta y O(1)', () => {
  // 500 días hábiles = 100 semanas exactas = 700 días calendario desde lunes
  const start = new Date('2026-01-05T10:00:00Z'); // lunes
  const result = addBusinessDays(start, 500);
  assert.equal(result.toISOString(), new Date(start.getTime() + 700 * 86_400_000).toISOString());

  // Inicio en sábado con 6 días hábiles → lunes (1) + 5 días hábiles = siguiente lunes
  const sat = new Date('2026-01-03T00:00:00Z');
  assert.equal(addBusinessDays(sat, 6).toISOString(), '2026-01-12T00:00:00.000Z');
  assert.equal(addBusinessDays(sat, 0).toISOString(), sat.toISOString());
});

test('compromiso desde la nota: fecha de la orden + el plazo más largo en días hábiles', () => {
  // S01600: orden 11/08/2026 (martes), 3 semanas = 15 días hábiles → 01/09/2026
  assert.equal(
    commitmentFromNote('<p>TIEMPO DE ENTREGA 2 A 3 SEMANAS.</p>', '2026-08-11 14:56:49'),
    '2026-09-01 14:56:49',
  );
});

test('compromiso desde la nota: null si no hay plazo o la fecha no sirve', () => {
  assert.equal(commitmentFromNote('Material aprobado', '2026-08-11 14:56:49'), null);
  assert.equal(commitmentFromNote('Entrega 3 dias', 'no es fecha'), null);
  assert.equal(commitmentFromNote('Entrega 1 dia', '2026-09-28'), '2026-09-29 00:00:00');
  assert.equal(commitmentFromNote('Entrega 3 dias', null), null);
});
