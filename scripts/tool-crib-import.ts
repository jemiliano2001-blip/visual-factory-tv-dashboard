/**
 * Importa a la biblioteca de planos los PDF marcados "si" en un manifiesto revisado.
 * Uso (PowerShell, con tu cuenta real del dashboard; la contraseña no se guarda):
 *   $env:IMPORT_EMAIL='tu@correo'; $env:IMPORT_PASSWORD='...'
 *   npx tsx scripts/tool-crib-import.ts <manifiesto.csv> <carpeta-raiz> [--go]
 * Sin --go solo muestra lo que haría. Es repetible: omite parte+revisión que ya existen.
 * Por parte queda activa la revisión mayor; las demás se suben como historial.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, getDocs, getFirestore, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';
import { MAX_PDF_BYTES } from '../src/services/toolCribUploadRules';

const [csvPath, root, flag] = process.argv.slice(2);
const go = flag === '--go';
const { IMPORT_EMAIL: email, IMPORT_PASSWORD: password } = process.env;
if (!csvPath || !root || !email || !password) {
  console.error('Faltan argumentos o IMPORT_EMAIL / IMPORT_PASSWORD.');
  process.exit(1);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.length > 1);
}

const [header, ...body] = parseCsv(readFileSync(csvPath, 'utf8').replace(/^﻿/, ''));
const col = (name: string) => header.indexOf(name);
const items = body
  .filter(r => r[col('incluir')].trim().toLowerCase() === 'si')
  .map(r => ({ customer: r[col('cliente')], part: r[col('parte')].trim(), rev: r[col('revision')].trim(), rel: r[col('ruta')] }));

const byPart = new Map<string, typeof items>();
for (const it of items) byPart.set(`${it.customer}|${it.part}`, [...(byPart.get(`${it.customer}|${it.part}`) ?? []), it]);
console.log(`${items.length} PDF en ${byPart.size} partes (${go ? 'ESCRIBIENDO' : 'simulación'}).`);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app), db = getFirestore(app), storage = getStorage(app);
const uid = (await signInWithEmailAndPassword(auth, email, password)).user.uid;

let done = 0, skipped = 0, failed = 0;
for (const [key, group] of byPart) {
  const [customer, partNumber] = key.split('|');
  try {
    const parts = await getDocs(query(collection(db, 'toolcribParts'), where('partNumber', '==', partNumber), where('customer', '==', customer)));
    const partRef = parts.empty ? doc(collection(db, 'toolcribParts')) : parts.docs[0].ref;
    const existing = parts.empty ? [] : (await getDocs(query(collection(db, 'toolcribDrawings'), where('partId', '==', partRef.id)))).docs;
    const have = new Set(existing.map(d => String(d.data().revision)));
    const fresh = group.filter(g => !have.has(g.rev));
    skipped += group.length - fresh.length;
    if (fresh.length === 0) continue;

    const topRev = [...fresh.map(f => f.rev), ...existing.filter(d => d.data().isActive).map(d => String(d.data().revision))].sort().pop();
    const batch = writeBatch(db);
    if (parts.empty) {
      batch.set(partRef, { partNumber, customer, description: '', status: 'active', createdAtUTC: serverTimestamp(), updatedAtUTC: serverTimestamp() });
    }
    for (const f of fresh) {
      const bytes = readFileSync(join(root, f.rel));
      if (bytes.length >= MAX_PDF_BYTES) throw new Error(`pesa demasiado: ${f.rel}`);
      const path = `tool-crib/${customer}/${partNumber.replace(/[^A-Za-z0-9._-]/g, '_')}_rev${f.rev.replace(/[^A-Za-z0-9._-]/g, '_')}_${Date.now()}.pdf`;
      let pdfUrl = '';
      if (go) {
        const fileRef = ref(storage, path);
        await uploadBytes(fileRef, bytes, { contentType: 'application/pdf' });
        pdfUrl = await getDownloadURL(fileRef);
      }
      batch.set(doc(collection(db, 'toolcribDrawings')), {
        partId: partRef.id, revision: f.rev, isActive: f.rev === topRev, sourceType: 'storage', sourcePath: path,
        pdfUrl, stlUrl: null, checksumSha256: null, createdAtUTC: serverTimestamp(), createdByUid: uid,
      });
      done++;
    }
    if (topRev && fresh.some(f => f.rev === topRev)) existing.forEach(d => { if (d.data().isActive) batch.update(d.ref, { isActive: false }); });
    if (go) await batch.commit();
  } catch (err) {
    failed += group.length;
    console.error(`FALLÓ ${key}: ${err instanceof Error ? err.message : err}`);
  }
}
console.log(`${go ? 'Subidos' : 'Se subirían'}: ${done} · ya existían: ${skipped} · fallidos: ${failed}`);
process.exit(failed ? 1 : 0);
