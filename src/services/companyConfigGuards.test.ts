import assert from 'node:assert/strict';
import test from 'node:test';
import { hasDuplicateCompanyConfig } from './companyConfigGuards';

test('rechaza configuraciones duplicadas aunque cambien mayúsculas o espacios', () => {
  const configs = [{ id: 'a', company_name: 'Nissan Mexicana' }];
  assert.equal(hasDuplicateCompanyConfig(configs, '  nissan   mexicana  '), true);
  assert.equal(hasDuplicateCompanyConfig(configs, 'Nissan Mexicana', 'a'), false);
  assert.equal(hasDuplicateCompanyConfig(configs, 'Bosch'), false);
});
