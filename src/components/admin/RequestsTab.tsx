/**
 * Pestaña "Solicitudes": lo que los ingenieros pidieron a facturación.
 * Quien factura marca "Hecha" (con confirmación) y la orden puede volver a pedirse.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { useInvoiceRequests, useMarkInvoiceRequestDone } from '../../hooks/useInvoiceRequests';
import { actorLabel, type InvoiceRequest } from '../../../shared/invoiceRequests';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

const MAX_DONE_SHOWN = 30;
const fmt = (iso: string | undefined) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? format(d, 'dd/MM/yyyy HH:mm') : '—';
};
const qty = (n: number) => String(Math.round(n * 100) / 100);

function RequestCard({ request, action }: { request: InvoiceRequest; action?: React.ReactNode }) {
  const isFactura = request.type === 'factura';
  return (
    <li className="rounded-2xl border border-border bg-card p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono-data text-base font-bold text-foreground">{request.orderName}</span>
        <Badge variant={isFactura ? 'default' : 'info'} size="md">{isFactura ? 'Factura' : 'Remisión'}</Badge>
        <span className="text-sm text-foreground">{request.partnerName}</span>
        {request.customerReference && (
          <span className="text-sm text-muted-foreground">Compra <span className="font-mono-data">{request.customerReference}</span></span>
        )}
      </div>
      {request.lines && request.lines.length > 0 && (
        <ul className="space-y-0.5 text-sm text-foreground">
          {request.lines.map(l => (
            <li key={l.lineId}><span className="font-mono-data font-semibold">{qty(l.qty)}</span>{l.unit ? ` ${l.unit}` : ''} — {l.name}</li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted-foreground">
        Pidió {actorLabel(request.requestedBy)} · <span className="font-mono-data">{fmt(request.requestedAt)}</span>
        {request.status === 'hecha' && request.doneBy && (
          <> · Hecha por {actorLabel(request.doneBy)} · <span className="font-mono-data">{fmt(request.doneAt)}</span></>
        )}
      </p>
      {action}
    </li>
  );
}

export default function RequestsTab() {
  const query = useInvoiceRequests();
  const markDone = useMarkInvoiceRequestDone();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Cargando solicitudes…</p>;
  if (!query.data) {
    return (
      <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        No se pudieron cargar las solicitudes. {query.error instanceof Error ? query.error.message : ''}
      </div>
    );
  }

  const pending = query.data.requests.filter(r => r.status === 'pendiente')
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
  const done = query.data.requests.filter(r => r.status === 'hecha')
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '')).slice(0, MAX_DONE_SHOWN);

  return (
    <div className="space-y-6">
      {query.isError && (
        <div role="alert" className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          No se pudo actualizar la lista; se muestran las últimas solicitudes cargadas. {query.error instanceof Error ? query.error.message : ''}
        </div>
      )}
      {markDone.isError && (
        <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {markDone.error instanceof Error ? markDone.error.message : 'No se pudo marcar como hecha.'}
        </div>
      )}
      <section aria-labelledby="req-pend" className="space-y-3">
        <h2 id="req-pend" className="text-base font-bold text-foreground">
          Pendientes (<span className="font-mono-data">{pending.length}</span>)
        </h2>
        {pending.length === 0 && <p className="text-sm text-muted-foreground">No hay solicitudes pendientes.</p>}
        <ul className="space-y-3">
          {pending.map(r => (
            <RequestCard
              key={r.id}
              request={r}
              action={confirmId === r.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-foreground">¿Ya quedó hecha?</span>
                  <Button
                    type="button" size="lg" disabled={markDone.isPending}
                    onClick={() => markDone.mutate(r.id, { onSettled: () => setConfirmId(null) })}
                  >
                    {markDone.isPending ? 'Guardando…' : 'Sí, ya está hecha'}
                  </Button>
                  <Button type="button" size="lg" variant="ghost" disabled={markDone.isPending} onClick={() => setConfirmId(null)}>No todavía</Button>
                </div>
              ) : (
                <Button type="button" size="lg" variant="secondary" onClick={() => setConfirmId(r.id)}>Marcar como hecha</Button>
              )}
            />
          ))}
        </ul>
      </section>
      <section aria-labelledby="req-done" className="space-y-3">
        <h2 id="req-done" className="text-base font-bold text-foreground">Hechas (las {MAX_DONE_SHOWN} más recientes)</h2>
        {done.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay solicitudes hechas.</p>}
        <ul className="space-y-3">{done.map(r => <RequestCard key={r.id} request={r} />)}</ul>
      </section>
    </div>
  );
}
