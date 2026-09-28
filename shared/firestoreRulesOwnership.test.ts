import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

/**
 * La base `(default)` de smv-brain la comparten el Dashboard y SMV Vision, y un deploy de reglas REEMPLAZA
 * las anteriores. Las reglas vigentes viven en el repo de SMV Vision (incluyen el bloque `company_configs`
 * de este Dashboard). Si este repo vuelve a desplegar `firestore`, un `firebase deploy` completo dejaría a
 * Vision sin acceso a sus datos.
 */
test('el Dashboard no despliega reglas de Firestore (las dueñas son las de SMV Vision)', () => {
  const config = JSON.parse(readFileSync(resolve(import.meta.dirname, '..', 'firebase.json'), 'utf8')) as Record<string, unknown>;
  assert.equal(
    'firestore' in config,
    false,
    'firebase.json no debe declarar "firestore": las reglas de (default) se despliegan desde SMV Vision',
  );
});
