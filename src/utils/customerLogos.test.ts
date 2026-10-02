import assert from 'node:assert/strict';
import test from 'node:test';
import { getCustomerLogo } from './customerLogos';

test('cada cliente actual tiene su marca, con los nombres tal como llegan de Odoo', () => {
  const casos: Array<[string, string]> = [
    ['SUPRAJIT MEXICO', '/logos/suprajit.svg'],
    ['SENSATA TECHNOLIGIES INC', '/logos/sensata.svg'], // "TECHNOLIGIES" (sic) viene así de Odoo
    ['SILICONE TECHNOLOGIES', '/logos/siltech.svg'],
    ['AFX INDUSTRIES', '/logos/afx.svg'],
    ['OHD OPERATORS DE MEXICO', '/logos/ohd.svg'],
    ['TERMOFORMADOS INDUSTRIALES DE MATAMOROS', '/logos/tim.svg'],
    ['FISHER DYNAMICS MEXICO', '/logos/fisher.svg'],
    ['KOHLER REYNOSA', '/logos/kohler.svg'],
  ];
  for (const [nombre, logo] of casos) assert.equal(getCustomerLogo(nombre), logo, nombre);
});

test('Siltech y Sensata no se confunden aunque Siltech pertenezca a Sensata', () => {
  assert.equal(getCustomerLogo('SENSATA TECHNOLOGIES'), '/logos/sensata.svg');
  assert.equal(getCustomerLogo('Siltech'), '/logos/siltech.svg');
});

test('un cliente desconocido o vacío no recibe marca (se usa el monograma)', () => {
  assert.equal(getCustomerLogo('CLIENTE DESCONOCIDO 123'), null);
  assert.equal(getCustomerLogo(''), null);
});

test('no confunde nombres que solo contienen letras parecidas', () => {
  assert.equal(getCustomerLogo('JOHDSON CONTROLS'), null);
  assert.equal(getCustomerLogo('VICTIM SYSTEMS'), null);
});
