/** Elegir un plano de la biblioteca (guarda alias) o subir uno nuevo para una partida Tool Crib. */
import { useMemo, useState } from 'react';
import type { ToolCribLine } from '../../services/toolCrib';
import type { DrawingResolution, DrawingView } from '../../services/toolCribMatching';
import { savePartAlias } from '../../services/toolCribLibrary';
import { uploadDrawing } from '../../services/toolCribUpload';
import { validateUpload } from '../../services/toolCribUploadRules';
import { useMobile } from '../../hooks/useMobile';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '../ui/drawer';

interface Props {
  line: ToolCribLine;
  resolution: DrawingResolution;
  library: DrawingView[];
  open: boolean;
  onClose: () => void;
  /** Tras guardar el alias o subir el plano, para refrescar biblioteca y alias. */
  onSaved: () => void;
}

function PickerContent({ line, resolution, library, onClose, onSaved }: Omit<Props, 'open'>) {
  const [mode, setMode] = useState<'pick' | 'upload'>('pick');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [partNumber, setPartNumber] = useState(line.partNumber ?? '');
  const [revision, setRevision] = useState('A');
  const pattern = line.partNumber ?? line.line.name;

  const candidates = resolution.kind === 'ambiguous' ? resolution.candidates : [];
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rest = library.filter(v => !candidates.some(c => c.drawingId === v.drawingId));
    const filtered = q ? rest.filter(v => `${v.partNumber} ${v.description}`.toLowerCase().includes(q)) : rest;
    return [...candidates, ...filtered].slice(0, 50);
  }, [library, candidates, search]);

  async function run(job: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await job();
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el plano.');
    } finally {
      setBusy(false);
    }
  }

  const pick = (v: DrawingView) => run(() => savePartAlias({ pattern, partNumber: v.partNumber, drawingId: v.drawingId }));
  const check = file ? validateUpload({ file, partNumber, revision }) : null;

  return (
    <div className="space-y-3 overflow-y-auto p-4 pt-0">
      <p className="text-sm text-muted-foreground">
        {resolution.kind === 'ambiguous'
          ? 'Hay más de un plano posible para esta partida. Elige el correcto.'
          : 'No se encontró un plano para esta partida. Elige uno de la biblioteca o sube el PDF.'}
      </p>
      <p className="break-words text-sm font-medium text-foreground">{line.line.name}</p>
      <div className="flex gap-2">
        <Button size="sm" variant={mode === 'pick' ? 'default' : 'secondary'} onClick={() => setMode('pick')}>Elegir plano</Button>
        <Button size="sm" variant={mode === 'upload' ? 'default' : 'secondary'} onClick={() => setMode('upload')}>Subir plano</Button>
      </div>

      {mode === 'pick' ? (
        <>
          <Input placeholder="Buscar por número de parte o descripción" value={search} onChange={e => setSearch(e.target.value)} />
          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {results.length === 0 && <li className="p-3 text-sm text-muted-foreground">Sin resultados.</li>}
            {results.map(v => (
              <li key={v.drawingId}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => pick(v)}
                  className="block w-full cursor-pointer px-3 py-2 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-50"
                >
                  <span className="font-mono-data font-semibold text-foreground">{v.partNumber}</span>
                  <span className="ml-2 text-xs text-muted-foreground">rev. {v.revision || '—'}</span>
                  {v.description && <span className="block truncate text-xs text-muted-foreground">{v.description}</span>}
                  {!v.pdfUrl && <span className="block text-xs text-destructive">Sin PDF</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Archivo PDF</span>
            <Input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-sm text-muted-foreground">Número de parte</span>
              <Input value={partNumber} onChange={e => setPartNumber(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-sm text-muted-foreground">Revisión</span>
              <Input value={revision} onChange={e => setRevision(e.target.value)} />
            </label>
          </div>
          {check && !check.ok && <p className="text-sm text-destructive">{check.error}</p>}
          <div className="flex justify-end">
            <Button
              disabled={busy || !file || !check?.ok}
              onClick={() => file && run(() => uploadDrawing({ file, partNumber, revision, description: line.line.name, aliasPattern: pattern }))}
            >
              {busy ? 'Subiendo…' : 'Subir y ligar'}
            </Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end"><Button variant="ghost" onClick={onClose} disabled={busy}>Cerrar</Button></div>
    </div>
  );
}

export default function ToolCribDrawingPicker(props: Props) {
  const isMobile = useMobile();
  const title = `Plano de la partida · ${props.line.order.name}`;
  const onOpenChange = (open: boolean) => { if (!open) props.onClose(); };
  if (isMobile) {
    return (
      <Drawer open={props.open} onOpenChange={onOpenChange}>
        <DrawerContent className="z-[70] max-h-[92dvh] flex flex-col bg-popover border-border rounded-t-2xl">
          <DrawerHeader className="text-left"><DrawerTitle className="text-base">{title}</DrawerTitle></DrawerHeader>
          <PickerContent {...props} />
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={props.open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="p-4 pr-16"><DialogTitle>{title}</DialogTitle></DialogHeader>
        <PickerContent {...props} />
      </DialogContent>
    </Dialog>
  );
}
