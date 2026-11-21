/**
 * Manifiesto (solo lectura) de los PDF de TOOL CRIB de Kohler y Fisher.
 * Uso: npx tsx scripts/tool-crib-manifest.ts <CLIENTE> <carpeta> <salida.csv>
 * No sube nada: genera el CSV que se revisa antes de importar.
 */
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deriveDrawing, type ImportCustomer } from '../shared/toolCribImport';

const [customerArg, root, out] = process.argv.slice(2);
if ((customerArg !== 'KOHLER' && customerArg !== 'FISHER') || !root || !out) {
  console.error('Uso: tool-crib-manifest.ts <KOHLER|FISHER> <carpeta> <salida.csv>');
  process.exit(1);
}
const customer: ImportCustomer = customerArg;

const rows = (readdirSync(root, { recursive: true }) as string[])
  .filter(rel => /\.pdf$/i.test(rel))
  .sort((a, b) => a.localeCompare(b, 'es'))
  .map(rel => ({ rel, kb: Math.round(statSync(join(root, rel)).size / 1024), ...deriveDrawing(customer, rel) }));

const seen = new Set<string>();
const lines = rows.map(r => {
  const key = `${r.partNumber}|${r.revision}`;
  const dup = seen.has(key);
  seen.add(key);
  const include = dup ? 'no (duplicado)' : r.confidence === 'baja' ? 'revisar' : 'si';
  return [include, customer, r.partNumber, r.revision, r.confidence, r.note, r.kb, r.rel];
});

const csv = [['incluir', 'cliente', 'parte', 'revision', 'confianza', 'nota', 'kb', 'ruta'], ...lines]
  .map(cols => cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
  .join('\n');
writeFileSync(out, `﻿${csv}\n`, 'utf8');

const count = (f: (l: (string | number)[]) => boolean) => lines.filter(f).length;
console.log(`${customer}: ${lines.length} PDF · si ${count(l => l[0] === 'si')} · revisar ${count(l => l[0] === 'revisar')} · duplicados ${count(l => String(l[0]).startsWith('no'))}`);
