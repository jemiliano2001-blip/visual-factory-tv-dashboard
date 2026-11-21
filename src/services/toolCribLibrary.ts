/**
 * Acceso a la biblioteca de planos Tool Crib en Firestore `(default)`: colecciones
 * y campos de SMV Vision (`toolcribParts`, `toolcribDrawings`, `toolcribPrintLogs`,
 * `partAliases`). Las reglas ya existen en Vision: cualquier cuenta real lee/escribe.
 */
import {
  addDoc, collection, doc, getDocs, limit, query, serverTimestamp, setDoc, where, type Timestamp,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { normalizeAliasKey, type DrawingView, type PartAlias } from './toolCribMatching';
import type { PrintLog } from './toolCribPrintIndex';
import { TOOL_CRIB_PARTNER_KEY } from './toolCrib';

export { buildPrintedIndex, printedKey, type PrintLog } from './toolCribPrintIndex';

const PARTS = 'toolcribParts';
const DRAWINGS = 'toolcribDrawings';
const LOGS = 'toolcribPrintLogs';
const ALIASES = 'partAliases';
const LIMIT = 2000;
const IN_BATCH = 30;
const PRINT_ORIGIN = 'toolcrib-v1-ui';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const iso = (v: unknown): string | null =>
  v && typeof (v as Timestamp).toDate === 'function' ? (v as Timestamp).toDate().toISOString() : null;

/** Partes activas de Suprajit con su plano activo más reciente (2 consultas, join en memoria). */
export async function loadLibrary(): Promise<DrawingView[]> {
  const [parts, drawings] = await Promise.all([
    getDocs(query(collection(db, PARTS), where('status', '==', 'active'), where('customer', '==', TOOL_CRIB_PARTNER_KEY), limit(LIMIT))),
    getDocs(query(collection(db, DRAWINGS), where('isActive', '==', true), limit(LIMIT))),
  ]);

  const latest = new Map<string, { id: string; created: string; data: Record<string, unknown> }>();
  drawings.forEach(d => {
    const data = d.data();
    const partId = str(data.partId);
    if (!partId) return;
    const created = iso(data.createdAtUTC) ?? '';
    const prev = latest.get(partId);
    if (!prev || created > prev.created) latest.set(partId, { id: d.id, created, data });
  });

  const views: DrawingView[] = [];
  parts.forEach(p => {
    const d = latest.get(p.id);
    if (!d) return;
    const pdf = str(d.data.pdfUrl);
    views.push({
      partId: p.id,
      partNumber: str(p.data().partNumber),
      customer: str(p.data().customer),
      description: str(p.data().description),
      drawingId: d.id,
      revision: str(d.data.revision),
      sourcePath: str(d.data.sourcePath),
      pdfUrl: pdf || null,
    });
  });
  return views;
}

export async function loadAliases(): Promise<PartAlias[]> {
  const snap = await getDocs(query(collection(db, ALIASES), limit(LIMIT)));
  const out: PartAlias[] = [];
  snap.forEach(d => {
    const data = d.data();
    if (typeof data.pattern === 'string' && typeof data.partNumber === 'string' && typeof data.drawingId === 'string') {
      out.push({ id: d.id, pattern: data.pattern, partNumber: data.partNumber, drawingId: data.drawingId });
    }
  });
  return out;
}

/** Guarda "esta partida usa este plano". Los campos son exactamente los que exige la regla de Vision. */
export async function savePartAlias(input: { pattern: string; partNumber: string; drawingId: string }): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Inicia sesión para guardar el plano.');
  const pattern = normalizeAliasKey(input.pattern);
  const partNumber = input.partNumber.trim().toUpperCase();
  if (!pattern || !partNumber || !input.drawingId.trim()) throw new Error('Faltan datos para guardar el plano.');
  const id = pattern.replace(/[^A-Z0-9]/g, '_').slice(0, 100);
  await setDoc(doc(db, ALIASES, id), {
    pattern,
    partNumber,
    drawingId: input.drawingId.trim(),
    createdByUid: uid,
    createdAtUTC: serverTimestamp(),
    updatedAtUTC: serverTimestamp(),
  }, { merge: true });
}

/** Bitácora de las SO dadas, en lotes de 30 (límite de `in`); sin orderBy para no pedir índice. */
export async function loadPrintLogs(orderRefs: string[]): Promise<PrintLog[]> {
  const refs = [...new Set(orderRefs.filter(Boolean))];
  const batches: string[][] = [];
  for (let i = 0; i < refs.length; i += IN_BATCH) batches.push(refs.slice(i, i + IN_BATCH));
  const snaps = await Promise.all(batches.map(b => getDocs(query(collection(db, LOGS), where('orderRef', 'in', b)))));
  const logs: PrintLog[] = [];
  for (const snap of snaps) {
    snap.forEach(d => {
      const data = d.data();
      logs.push({
        id: d.id,
        drawingId: str(data.drawingId),
        partId: str(data.partId),
        copies: typeof data.copies === 'number' ? data.copies : 1,
        orderRef: typeof data.orderRef === 'string' ? data.orderRef : null,
        printedByUid: typeof data.printedByUid === 'string' ? data.printedByUid : null,
        printedAtUTC: iso(data.printedAtUTC),
      });
    });
  }
  return logs;
}

/** Escribe un log de impresión. Lanza si falla; el uid sale siempre de la sesión. */
export async function recordPrintLog(input: { drawingId: string; partId: string; copies: number; orderRef: string }): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Inicia sesión para registrar la impresión.');
  if (!Number.isInteger(input.copies) || input.copies < 1 || input.copies > 50) throw new Error('Copias inválidas.');
  if (!input.orderRef || input.orderRef.length > 128) throw new Error('Orden inválida.');
  await addDoc(collection(db, LOGS), {
    drawingId: input.drawingId,
    partId: input.partId,
    copies: input.copies,
    orderRef: input.orderRef,
    origin: PRINT_ORIGIN,
    printedByUid: uid,
    printedAtUTC: serverTimestamp(),
  });
}
