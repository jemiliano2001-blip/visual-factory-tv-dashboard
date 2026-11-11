import assert from 'node:assert/strict';
import test from 'node:test';
import { commitmentFromNote, parseDeliveryDaysFromNote } from './deliveryTerm';

test('plazo de la nota: rango en semanas, con HTML', () => {
  assert.deepEqual(parseDeliveryDaysFromNote('<p>TIEMPO DE ENTREGA 2 A 3 SEMANAS.</p>'), { min: 10, max: 15 });
  assert.deepEqual(parseDeliveryDaysFromNote('Entrega 8 a 12 días hábiles'), { min: 8, max: 12 });
  assert.equal(parseDeliveryDaysFromNote('Sin plazo, 5 piezas'), null);
  assert.equal(parseDeliveryDaysFromNote(null), null);
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
