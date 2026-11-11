// Genera shared/satCatalogData.ts desde el catálogo SAT del SMV Hub (data/sat/catalogo.json).
// Uso: node scripts/build-sat-catalog.mjs <ruta/catalogo.json>
import { readFileSync, writeFileSync } from 'node:fs';

const DIVISIONES = ['23', '24', '26', '27', '30', '31', '32', '39', '40', '41', '43', '56', '72', '73', '81'];
const src = process.argv[2];
if (!src) { console.error('Falta la ruta del catalogo.json'); process.exit(1); }

const { version, entries } = JSON.parse(readFileSync(src, 'utf8'));
const rows = entries
  .filter(e => /^\d{8}$/.test(e.clave) && DIVISIONES.includes(e.clave.slice(0, 2)))
  .map(e => [e.clave, String(e.descripcion).trim()])
  .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

const out = [
  '// GENERADO por scripts/build-sat-catalog.mjs — no editar a mano.',
  `// Divisiones: ${DIVISIONES.join(', ')}.`,
  `export const SAT_CATALOG_VERSION = ${JSON.stringify(version)};`,
  '',
  'export const SAT_CATALOG: ReadonlyArray<readonly [code: string, name: string]> = [',
  ...rows.map(r => `  [${JSON.stringify(r[0])}, ${JSON.stringify(r[1])}],`),
  '];',
  '',
].join('\n');
writeFileSync(new URL('../shared/satCatalogData.ts', import.meta.url), out);
console.log(`${rows.length} claves, versión ${version}`);
