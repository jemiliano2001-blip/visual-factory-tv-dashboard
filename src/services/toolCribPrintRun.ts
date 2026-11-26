/** Orquestación de la impresión de planos Tool Crib. Sin Firebase: las dependencias se inyectan. */
import type { PlanoOtStamp, PrintPdfItem } from './planoOt';
import type { ToolCribLine } from './toolCrib';
import type { DrawingView } from './toolCribMatching';

export function validatePrintInput(input: { cantidad: string; copies: number }):
  { ok: true; cantidad: number } | { ok: false; error: string } {
  const text = input.cantidad.trim();
  if (!/^\d+$/.test(text) || Number(text) < 1) return { ok: false, error: 'La cantidad debe ser un entero de 1 o más.' };
  if (!Number.isInteger(input.copies) || input.copies < 1 || input.copies > 5) {
    return { ok: false, error: 'Las copias deben ser de 1 a 5.' };
  }
  return { ok: true, cantidad: Number(text) };
}

export interface PrintJob {
  items: { view: DrawingView; line: ToolCribLine; stamp: PlanoOtStamp }[];
  copies: number;
}

export interface PrintDeps {
  fetchPdf: (url: string) => Promise<Uint8Array>;
  build: (items: PrintPdfItem[]) => Promise<Uint8Array>;
  open: (bytes: Uint8Array) => void;
  log: (input: { drawingId: string; partId: string; copies: number; orderRef: string }) => Promise<void>;
}

/**
 * Orden fijo: descargar todo → generar el PDF → abrirlo → registrar. El log se escribe
 * solo si lo anterior salió bien; si un log falla, el PDF ya se abrió y el error nombra la SO.
 */
export async function runPrint(deps: PrintDeps, job: PrintJob): Promise<void> {
  const pdfs = await Promise.all(job.items.map(i => deps.fetchPdf(i.view.pdfUrl ?? '')));
  const bytes = await deps.build(job.items.map((i, n) => ({ pdfBytes: pdfs[n], stamp: i.stamp, copies: job.copies })));
  deps.open(bytes);
  for (const item of job.items) {
    try {
      await deps.log({ drawingId: item.view.drawingId, partId: item.view.partId, copies: job.copies, orderRef: item.line.order.name });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        `El plano se abrió, pero no se pudo registrar la impresión de ${item.line.order.name}: ${reason}`,
        { cause: err },
      );
    }
  }
}

export async function fetchPdfBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar el plano (HTTP ${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}
