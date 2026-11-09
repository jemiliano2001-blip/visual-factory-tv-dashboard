import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCustomerPo, getCustomerPo, NO_CUSTOMER_PO } from './customerPo';

test('PO presente se muestra tal cual (recortado)', () => {
  assert.equal(formatCustomerPo('PO20264321'), 'PO20264321');
  assert.equal(formatCustomerPo('  4500123456 '), '4500123456');
  assert.equal(getCustomerPo(' ABC-1 '), 'ABC-1');
});

test('sin PO se muestra guión «—»', () => {
  assert.equal(NO_CUSTOMER_PO, '—');
  for (const empty of [null, undefined, '', '   ', '\t\n']) {
    assert.equal(formatCustomerPo(empty), '—', JSON.stringify(empty));
    assert.equal(getCustomerPo(empty), null);
  }
});

test('valores no-string de Odoo (false) caen al guión', () => {
  // Odoo manda `false` cuando el campo está vacío; el cliente ya lo mapea a null,
  // pero el helper no debe romperse si llega crudo.
  assert.equal(formatCustomerPo(false as unknown as string), '—');
});
