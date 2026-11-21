/** Índice puro de "impreso" a partir de la bitácora toolcribPrintLogs (sin Firebase, probado). */
export interface PrintLog {
  id: string;
  drawingId: string;
  partId: string;
  copies: number;
  orderRef: string | null;
  printedByUid: string | null;
  printedAtUTC: string | null;
}

export interface PrintedInfo {
  printedAtUTC: string | null;
  printedByUid: string | null;
  count: number;
}

export const printedKey = (orderRef: string, partId: string) => `${orderRef}|${partId}`;

export function buildPrintedIndex(logs: PrintLog[]): Map<string, PrintedInfo> {
  const index = new Map<string, PrintedInfo>();
  for (const l of logs) {
    if (!l.orderRef) continue;
    const key = printedKey(l.orderRef, l.partId);
    const prev = index.get(key);
    if (!prev) {
      index.set(key, { printedAtUTC: l.printedAtUTC, printedByUid: l.printedByUid, count: 1 });
    } else if ((l.printedAtUTC ?? '') > (prev.printedAtUTC ?? '')) {
      index.set(key, { printedAtUTC: l.printedAtUTC, printedByUid: l.printedByUid, count: prev.count + 1 });
    } else {
      prev.count += 1;
    }
  }
  return index;
}
