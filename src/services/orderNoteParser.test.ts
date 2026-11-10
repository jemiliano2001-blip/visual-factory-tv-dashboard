import assert from 'node:assert/strict';
import test from 'node:test';
import { extractOrderNoteMeta } from './orderNoteParser';

test('requisitor y PO dentro de la nota (SUPRAJIT)', () => {
  assert.deepEqual(extractOrderNoteMeta({ customer_reference: null, note: 'Ing. Edgar Ramirez/PO.00088347' }), {
    poNumber: '00088347', clientContact: 'Ing. Edgar Ramirez', cleanNote: '',
  });
  assert.deepEqual(extractOrderNoteMeta({ note: 'DAMARIZ CRUZ / PO.00388275' }), {
    poNumber: '00388275', clientContact: 'DAMARIZ CRUZ', cleanNote: '',
  });
});

test('requisitor sin PO', () => {
  assert.deepEqual(extractOrderNoteMeta({ note: 'Ing. Juan Barron /' }), {
    poNumber: null, clientContact: 'Ing. Juan Barron', cleanNote: '',
  });
  assert.equal(extractOrderNoteMeta({ note: 'Ing. Mario Méndez /' }).clientContact, 'Ing. Mario Méndez');
});

test('customer_reference directo, con y sin prefijo PO', () => {
  assert.equal(extractOrderNoteMeta({ customer_reference: '20264321', note: null }).poNumber, '20264321');
  assert.equal(extractOrderNoteMeta({ customer_reference: 'PO.00088347' }).poNumber, '00088347');
  assert.equal(extractOrderNoteMeta({ customer_reference: ' P.O. 123 ', note: 'PO.999999' }).poNumber, '123');
});

test('limpia HTML y conserva el resto de la nota', () => {
  const meta = extractOrderNoteMeta({
    note: '<p>Ing. Edgar Ramirez/PO.00088347</p><p>Entregar&nbsp;en planta &amp; avisar</p>',
  });
  assert.equal(meta.poNumber, '00088347');
  assert.equal(meta.clientContact, 'Ing. Edgar Ramirez');
  assert.equal(meta.cleanNote, 'Entregar en planta & avisar');
});

test('entidad numérica fuera de rango no lanza', () => {
  assert.doesNotThrow(() => extractOrderNoteMeta({ note: 'Nota &#x110000; y &#99999999;' }));
  assert.equal(extractOrderNoteMeta({ note: 'Nota &#x110000;' }).cleanNote, 'Nota &#x110000;');
});

test('fechas y fracciones no son requisitor', () => {
  assert.equal(extractOrderNoteMeta({ note: 'Entregar el 10/11/2026' }).clientContact, null);
  assert.equal(extractOrderNoteMeta({ note: 'placa Alum. 3/4 espesor' }).clientContact, null);
  assert.equal(extractOrderNoteMeta({ note: 'placa 3/4 espesor' }).clientContact, null);
});

test('sin PO ni requisitor', () => {
  assert.deepEqual(extractOrderNoteMeta({ customer_reference: null, note: null }), {
    poNumber: null, clientContact: null, cleanNote: '',
  });
  assert.deepEqual(extractOrderNoteMeta({ note: 'Entrega urgente' }), {
    poNumber: null, clientContact: null, cleanNote: 'Entrega urgente',
  });
});
