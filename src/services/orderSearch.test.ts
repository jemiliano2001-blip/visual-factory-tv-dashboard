import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesOrderSearch } from './orderSearch';

const order = {
  name: '2026/S01794', partner_name: 'Bosch México', main_product: 'Fixture PCB',
  customer_reference: 'PO-765', salesperson: 'Ing. Antonio Vázquez',
  lines: [{ name: 'Pieza principal' }, { name: 'Retrabajo OT-00427 / Ing. José Núñez' }],
  note: '<p>OT&nbsp;00981: asignada a la ingeniera María López</p>',
};

test('busca SO y OT con prefijos, separadores y ceros iniciales', () => {
  for (const query of ['SO1794', 'S01794', '2026/S01794', 'OT427', 'OT 00427', 'OT-981']) {
    assert.equal(matchesOrderSearch(order, query), true, query);
  }
});
test('busca ingenieros en líneas secundarias y notas sin distinguir acentos', () => {
  for (const query of ['jose nunez', 'ingeniero maria lopez', 'ANTONIO VAZQUEZ']) {
    assert.equal(matchesOrderSearch(order, query), true, query);
  }
});
test('combina términos entre campos e incluye la referencia del cliente', () => {
  assert.equal(matchesOrderSearch(order, 'bosch jose OT427'), true);
  assert.equal(matchesOrderSearch(order, 'PO-765'), true);
  assert.equal(matchesOrderSearch(order, 'bosch inexistente'), false);
});
test('acepta notas ausentes, mantiene búsqueda parcial y no busca etiquetas HTML', () => {
  assert.equal(matchesOrderSearch({ ...order, note: null, lines: [] }, '   '), true);
  assert.equal(matchesOrderSearch(order, 'fixt'), true);
  assert.equal(matchesOrderSearch({ ...order, note: '<p class="hidden-tag">Texto visible</p>' }, 'hidden-tag'), false);
});

test('conserva búsqueda numérica con ceros y liga cada prefijo a su propio número', () => {
  const simple = { ...order, main_product: 'Motor', note: null, lines: [] };
  assert.equal(matchesOrderSearch(simple, '01794'), true);
  assert.equal(matchesOrderSearch(simple, 'OT1794'), false);
  assert.equal(matchesOrderSearch({ ...simple, name: '2026/S00001', lines: [{ name: 'OT1794' }] }, 'SO1794'), false);
});

test('busca PO del cliente numérico con y sin prefijo, separado de la SO', () => {
  const poOrder = { ...order, customer_reference: '20264321' };
  for (const query of ['20264321', 'PO20264321', 'PO 20264321', 'PO-20264321']) {
    assert.equal(matchesOrderSearch(poOrder, query), true, query);
  }
  assert.equal(matchesOrderSearch({ ...poOrder, customer_reference: null, name: 'SO20264321' }, 'PO20264321'), false);
  assert.equal(matchesOrderSearch({ ...poOrder, customer_reference: '20269999', note: 'Lote 20264321' }, 'PO20264321'), false);
});
