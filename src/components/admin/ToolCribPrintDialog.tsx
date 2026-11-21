/** Diálogo para imprimir el plano estampado de una partida Tool Crib. */
import { useState } from 'react';
import { useUserSettings } from '../../hooks/useUserSettings';
import { format } from 'date-fns';
import type { ToolCribLine } from '../../services/toolCrib';
import type { DrawingView } from '../../services/toolCribMatching';
import { formatPrintedLabel, type PrintState } from '../../services/toolCribPrint';
import { fetchPdfBytes, runPrint, validatePrintInput } from '../../services/toolCribPrintRun';
import { buildPrintPdf, openPdfForPrint } from '../../services/planoOt';
import { recordPrintLog } from '../../services/toolCribLibrary';
import { auth } from '../../firebase';
import { useMobile } from '../../hooks/useMobile';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '../ui/drawer';

interface Props {
  line: ToolCribLine;
  view: DrawingView;
  state: PrintState;
  open: boolean;
  onClose: () => void;
  /** Se llama tras imprimir y registrar, para refrescar la columna Impreso. */
  onPrinted: () => void;
}

function PrintContent({ line, view, state, onClose, onPrinted }: Omit<Props, 'open'>) {
  const account = useUserSettings();
  const [cantidad, setCantidad] = useState(String(line.missing > 0 ? line.missing : line.line.qty));
  const [copies, setCopies] = useState(account.settings.print.copies);
  const [withTicket, setWithTicket] = useState(account.settings.print.boardTicket);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reprint = state.kind === 'printed';
  const check = validatePrintInput({ cantidad, copies });

  async function submit() {
    if (!check.ok) { setError(check.error); return; }
    setBusy(true);
    setError(null);
    try {
      await runPrint(
        { fetchPdf: fetchPdfBytes, build: buildPrintPdf, open: bytes => openPdfForPrint(bytes, `plano-${view.partNumber}.pdf`), log: recordPrintLog },
        {
          copies,
          items: [{
            view,
            line,
            stamp: {
              soNumber: line.order.name,
              cantidad: String(check.cantidad),
              fecha: format(new Date(), 'dd/MM/yyyy'),
              poNumber: line.order.customer_reference ?? '',
              partNumber: view.partNumber,
              customer: line.order.partner_name,
              piezaDescripcion: line.line.name,
              mode: withTicket ? 'both' : 'blueprint',
            },
          }],
        },
      );
      onPrinted();
      onClose();
    } catch (err) {
      // Si el PDF ya se abrió pero falló el registro, refrescar igual para no perder el estado.
      onPrinted();
      setError(err instanceof Error ? err.message : 'No se pudo imprimir el plano.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 overflow-y-auto p-4 pt-0">
      {reprint && (
        <p className="rounded-xl border border-border bg-accent/30 px-3 py-2 text-sm text-foreground">
          {formatPrintedLabel(state, auth.currentUser?.uid ?? null)}. ¿Reimprimir? Se registrará otra impresión.
        </p>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">SO</dt><dd className="font-mono-data font-semibold">{line.order.name}</dd>
        <dt className="text-muted-foreground">PO</dt><dd className="font-mono-data">{line.order.customer_reference || 'Sin PO'}</dd>
        <dt className="text-muted-foreground">Plano</dt><dd className="font-mono-data">{view.partNumber} · rev. {view.revision || '—'}</dd>
      </dl>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-sm text-muted-foreground">Cantidad</span>
          <Input inputMode="numeric" value={cantidad} onChange={e => setCantidad(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-sm text-muted-foreground">Copias (1 a 5)</span>
          <Input type="number" min={1} max={5} value={copies} onChange={e => setCopies(Number(e.target.value))} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={withTicket} onChange={e => setWithTicket(e.target.checked)} className="size-4" />
        Incluir ficha de pizarrón
      </label>
      {(error || !check.ok) && <p role="alert" className="text-sm text-destructive">{error ?? (check.ok ? '' : check.error)}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button onClick={submit} disabled={busy || !check.ok}>{busy ? 'Preparando…' : reprint ? 'Reimprimir' : 'Imprimir'}</Button>
      </div>
    </div>
  );
}

export default function ToolCribPrintDialog(props: Props) {
  const isMobile = useMobile();
  const title = `Imprimir plano · ${props.line.order.name}`;
  const onOpenChange = (open: boolean) => { if (!open) props.onClose(); };
  if (isMobile) {
    return (
      <Drawer open={props.open} onOpenChange={onOpenChange}>
        <DrawerContent className="z-[70] max-h-[92dvh] flex flex-col bg-popover border-border rounded-t-2xl">
          <DrawerHeader className="text-left"><DrawerTitle className="text-base">{title}</DrawerTitle></DrawerHeader>
          <PrintContent {...props} />
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={props.open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="p-4 pr-16"><DialogTitle>{title}</DialogTitle></DialogHeader>
        <PrintContent {...props} />
      </DialogContent>
    </Dialog>
  );
}
