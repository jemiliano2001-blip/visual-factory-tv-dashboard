/**
 * Barra fija inferior con las acciones sobre las órdenes marcadas.
 * Solo existe mientras hay selección; la acción primaria es pedir factura o remisión.
 */
import { Download, FileText } from 'lucide-react';
import { Button } from '../ui/button';

export interface SelectionBarProps {
  count: number;
  onRequest: () => void;
  onClaim: () => void;
  claimDisabled: boolean;
  onExport: () => void;
  onClear: () => void;
}

const CONTROL = 'min-h-11 px-4 text-sm font-semibold rounded-xl';

export default function SelectionBar({ count, onRequest, onClaim, claimDisabled, onExport, onClear }: SelectionBarProps) {
  if (count <= 0) return null;
  return (
    <div
      role="region"
      aria-label="Órdenes seleccionadas"
      className="order-report-no-print fixed inset-x-0 bottom-[calc(58px+env(safe-area-inset-bottom))] z-40 border-t border-border bg-card shadow-overlay md:bottom-0 md:left-64"
    >
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 px-5 py-3 lg:px-8">
        <span className="mr-auto text-sm font-semibold text-foreground">
          {count} {count === 1 ? 'orden seleccionada' : 'órdenes seleccionadas'}
        </span>
        <Button type="button" variant="ghost" className={CONTROL} onClick={onClear}>Quitar selección</Button>
        <Button type="button" variant="secondary" className={CONTROL} onClick={onExport}><Download /> Excel</Button>
        <Button type="button" variant="secondary" className={CONTROL} onClick={onClaim} disabled={claimDisabled}>Asignármelas</Button>
        <Button type="button" className={CONTROL} onClick={onRequest}><FileText /> Pedir factura o remisión</Button>
      </div>
    </div>
  );
}
