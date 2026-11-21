import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

/**
 * Desde la Fase 4 este repo es el dueño de las reglas de Firestore `(default)` (antes vivían en SMV Vision).
 * La base `(default)` es compartida y un deploy de reglas REEMPLAZA las anteriores, así que:
 *  - `firebase.json` declara `firestore` con estas reglas e índices;
 *  - las reglas incluyen todas las colecciones que usan las apps vivas (si falta una, queda denegada);
 *  - Storage NO se declara aquí: sus reglas desplegadas son las de SMV Hub;
 *  - `npm run deploy` nunca arrastra `firestore`: el deploy de reglas es un comando aparte y explícito.
 */
const root = resolve(import.meta.dirname, '..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');
const config = JSON.parse(read('firebase.json')) as Record<string, { rules?: string; indexes?: string; database?: string } | unknown>;

test('firebase.json declara firestore (default) con las reglas e índices de este repo', () => {
  const firestore = config.firestore as { rules?: string; indexes?: string; database?: string };
  assert.equal(firestore?.rules, 'firestore.rules');
  assert.equal(firestore?.indexes, 'firestore.indexes.json');
  assert.equal(firestore?.database, '(default)');
});

test('firebase.json no declara storage: sus reglas son las de SMV Hub', () => {
  assert.equal('storage' in config, false);
});

test('el script deploy no incluye firestore', () => {
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  assert.ok(!/firestore/.test(pkg.scripts.deploy), 'npm run deploy no debe desplegar reglas compartidas');
});

test('las reglas cubren las colecciones de las apps vivas y cierran lo demás', () => {
  const rules = read('firestore.rules');
  const collections = [
    'company_configs', 'user_settings', 'toolcribParts', 'toolcribDrawings', 'toolcribPrintLogs', 'partAliases',
    'odooSaleOrders', 'syncMeta', 'workOrders', 'analysisRuns', 'purchases', 'toolingPurchases', 'toolcribSets', 'toolcribPartNotes',
    'work_orders', 'work_orders_history',
  ];
  for (const name of collections) assert.ok(rules.includes(`match /${name}/`), `falta la colección ${name}`);
  assert.ok(/match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/.test(rules), 'falta el catch-all cerrado');
});

test('ninguna regla abre acceso a sesiones anónimas', () => {
  const rules = read('firestore.rules');
  assert.ok(!/allow [^;]*:\s*if\s+request\.auth\s*!=\s*null\s*;/.test(rules), 'hay una regla que acepta cualquier auth (incluye anónimos)');
});

test('los módulos apagados de Vision son solo lectura (sin create, update ni delete abiertos)', () => {
  const rules = read('firestore.rules');
  for (const name of ['analysisRuns', 'purchases', 'toolingPurchases', 'toolcribSets', 'toolcribPartNotes']) {
    const start = rules.indexOf(`match /${name}/`);
    assert.ok(start >= 0, `falta ${name}`);
    const rest = rules.slice(start);
    const block = rest.slice(0, rest.indexOf('\n    }') + 6);
    assert.ok(/allow write: if false;/.test(block), `${name} debe cerrar write`);
    assert.ok(!/allow (create|update|delete)\b/.test(block), `${name} no debe abrir create/update/delete`);
    assert.ok(/allow read: if isSignedIn\(\);/.test(block), `${name} conserva lectura para cuentas reales`);
  }
});
