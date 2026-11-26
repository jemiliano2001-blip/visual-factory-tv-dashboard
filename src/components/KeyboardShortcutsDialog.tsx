import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

export interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ADMIN_SHORTCUTS = [
  { keys: 'Ctrl / Cmd + K', label: 'Abrir paleta de comandos (órdenes, vistas y acciones)' },
  { keys: '/', label: 'Enfocar el buscador de órdenes' },
  { keys: '?', label: 'Mostrar u ocultar estos atajos' },
  { keys: 'Shift + Clic', label: 'Seleccionar rango continuo de órdenes en la tabla' },
  { keys: 'Esc', label: 'Limpiar selección activa o cerrar diálogo' },
] as const;

const TV_SHORTCUTS = [
  { keys: '← / →', label: 'Cambiar entre páginas en modo TV' },
  { keys: 'Espacio', label: 'Pausar o reanudar rotación automática' },
  { keys: 'Esc', label: 'Limpiar filtros activos en TV' },
] as const;

function ShortcutList({ title, items }: { title: string; items: ReadonlyArray<{ keys: string; label: string }> }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {items.map(item => (
          <li key={item.keys} className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-sm">
            <span className="text-foreground">{item.label}</span>
            <kbd className="shrink-0 rounded-md border border-border bg-secondary px-2 py-0.5 font-mono-data text-xs font-semibold text-secondary-foreground">
              {item.keys}
            </kbd>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="print:hidden max-w-lg">
        <DialogHeader>
          <DialogTitle>Atajos de teclado</DialogTitle>
          <DialogDescription>
            Navega y opera órdenes más rápido sin usar el ratón.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <ShortcutList title="Consola Admin" items={ADMIN_SHORTCUTS} />
          <ShortcutList title="TV Dashboard" items={TV_SHORTCUTS} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
