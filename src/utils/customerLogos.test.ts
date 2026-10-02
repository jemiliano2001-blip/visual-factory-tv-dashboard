import assert from 'node:assert/strict';
import test from 'node:test';
import { getCustomerLogo } from './customerLogos';

test('los clientes con logo oficial en el catálogo reciben su archivo y el tono de fondo correcto', () => {
  assert.deepEqual(getCustomerLogo('SUPRAJIT MEXICO'), { src: '/logos/suprajit.png', tile: 'dark' });
  // "TECHNOLIGIES" (sic) es como llega de Odoo.
  assert.deepEqual(getCustomerLogo('SENSATA TECHNOLIGIES INC'), { src: '/logos/sensata.png', tile: 'dark' });
  assert.deepEqual(getCustomerLogo('KOHLER REYNOSA'), { src: '/logos/kohler.svg', tile: 'dark' });
  assert.deepEqual(getCustomerLogo('AFX INDUSTRIES'), { src: '/logos/afx.png', tile: 'light' });
  assert.deepEqual(getCustomerLogo('FISHER DYNAMICS MEXICO'), { src: '/logos/fisher.png', tile: 'light' });
  assert.deepEqual(getCustomerLogo('OHD OPERATORS DE MEXICO'), { src: '/logos/ohd.png', tile: 'light' });
});

test('sin logo oficial no se inventa uno: Siltech (parte de Sensata) y TIM usan el monograma', () => {
  assert.equal(getCustomerLogo('SILICONE TECHNOLOGIES'), null);
  assert.equal(getCustomerLogo('TERMOFORMADOS INDUSTRIALES DE MATAMOROS'), null);
  assert.equal(getCustomerLogo('CLIENTE DESCONOCIDO 123'), null);
  assert.equal(getCustomerLogo(''), null);
});

test('no confunde nombres que solo contienen letras parecidas', () => {
  assert.equal(getCustomerLogo('JOHDSON CONTROLS'), null);
});
