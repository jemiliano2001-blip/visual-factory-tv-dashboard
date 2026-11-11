import { AlertTriangle } from 'lucide-react';

/** Aviso de que Odoo devolvió la lista recortada (`truncated`): lo comparten Admin y Estadísticas. */
export default function TruncatedNotice() {
  return (
    <div role="status" className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
      <AlertTriangle className="size-5 shrink-0" />
      <span>Odoo tiene más órdenes por facturar de las que se muestran; faltan las de fecha compromiso más lejana.</span>
    </div>
  );
}
