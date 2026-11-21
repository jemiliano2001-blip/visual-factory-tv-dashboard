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

test('purchase_order (origin) respalda la PO si falta en referencia y nota', () => {
  assert.equal(extractOrderNoteMeta({ purchase_order: '00089905', note: '<p>Ing. Fernando Trujillo</p>' }).poNumber, '00089905');
  assert.equal(extractOrderNoteMeta({ purchase_order: 'PO. A21734 .', note: null }).poNumber, 'A21734');
  assert.equal(extractOrderNoteMeta({ purchase_order: '  .  ' }).poNumber, null);
});

test('precedencia PO: customer_reference > nota > purchase_order', () => {
  assert.equal(
    extractOrderNoteMeta({ customer_reference: 'REF-1', note: 'Ing. Ana / PO.NOTE-2', purchase_order: 'ORIG-3' }).poNumber,
    'REF-1',
  );
  assert.equal(
    extractOrderNoteMeta({ customer_reference: null, note: 'Ing. Ana / PO.NOTE-2', purchase_order: 'ORIG-3' }).poNumber,
    'NOTE-2',
  );
});

test('requisitor respalda clientContact si no viene encabezado con diagonal y conserva cleanNote', () => {
  assert.deepEqual(
    extractOrderNoteMeta({ note: '<p>Ing. Marco García PO. 20264380</p>', requisitor: 'Ing. Marco García' }),
    { poNumber: '20264380', clientContact: 'Ing. Marco García', cleanNote: 'Ing. Marco García PO. 20264380' },
  );
  assert.deepEqual(
    extractOrderNoteMeta({ note: 'Entregar el 10/11/2026', requisitor: '  OZIEL   MUÑOZ  ' }),
    { poNumber: null, clientContact: 'OZIEL MUÑOZ', cleanNote: 'Entregar el 10/11/2026' },
  );
  assert.deepEqual(
    extractOrderNoteMeta({ note: null, requisitor: '   ' }),
    { poNumber: null, clientContact: null, cleanNote: '' },
  );
});

test('precedencia requisitor: encabezado de nota > campo requisitor de Odoo', () => {
  assert.equal(
    extractOrderNoteMeta({ note: 'VICTOR C./RUBEN C./PO.A21734', requisitor: 'VICTOR CRUZ' }).clientContact,
    'VICTOR C.',
  );
});
