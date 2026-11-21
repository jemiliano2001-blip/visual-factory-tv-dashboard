/**
 * Pestaña "Solicitudes": lo que los ingenieros pidieron a facturación.
 * Se marcan "Hecha" solas cuando Odoo ya las cumplió (el servidor lo revisa al leer); mientras,
 * cada partida muestra su avance en Odoo. Quien factura también puede marcarla a mano.
 */
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Search, X } from 'lucide-react';
import { useInvoiceRequests, useMarkInvoiceRequestDone } from '../../hooks/useInvoiceRequests';
import { useOdooOrders } from '../../hooks/useOdooOrders';
import { extractOrderNoteMeta, type OrderNoteMeta } from '../../services/orderNoteParser';
import { CopyButton } from '../CopyButton';
import { actorLabel, type InvoiceRequest, type LineProgress } from '../../../shared/invoiceRequests';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { SegmentedControl } from '../ui/segmented-control';
import { EmptyState } from '../ui/empty-state';

const MAX_DONE_SHOWN = 30;
const fmt = (iso: string | undefined) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? format(d, 'dd/MM/yyyy HH:mm') : '—';
};
const qty = (n: number) => String(Math.round(n * 100) / 100);

function matchesRequestSearch(request: InvoiceRequest, q: string, meta?: OrderNoteMeta): boolean {
  if (!q) return true;
  const fields = [
    request.orderName,
    meta?.poNumber ?? '',
    meta?.clientContact ?? '',
    request.partnerName,
    request.customerReference ?? '',
    request.requester ?? '',
    actorLabel(request.requestedBy),
    request.requestedBy.email ?? '',
    request.note ?? '',
    ...(request.lines?.map(l => l.name) ?? []),
    ...(request.satKeys?.map(k => `${k.name} ${k.code ?? ''}`) ?? []),
  ];
  return fields.some(f => f.toLowerCase().includes(q));
}

function RequestsSkeleton() {
  return (
    <div role="status" aria-label="Cargando solicitudes" className="space-y-4">
      <div className="h-10 w-full max-w-md rounded-xl bg-muted/50 animate-pulse" />
      <div className="space-y-3">
        {[0, 1, 2].map(idx => (
          <div key={idx} className="rounded-2xl border border-border bg-card p-4 space-y-3 animate-pulse">
            <div className="flex flex-wrap items-center gap-2">
              <div className="h-5 w-28 rounded-md bg-muted" />
              <div className="h-5 w-24 rounded-full bg-muted" />
              <div className="h-4 w-44 rounded bg-muted/80" />
            </div>
            <div className="h-4 w-3/4 rounded bg-muted/70" />
            <div className="h-3.5 w-1/2 rounded bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  );
}

function RequestCard({ request, meta, action, progress }: { request: InvoiceRequest; meta?: OrderNoteMeta; action?: React.ReactNode; progress?: LineProgress[] }) {
  // PO y requisitor salen de la orden en Odoo (nota, client_order_ref, origin/requisitor) o de lo guardado en la solicitud.
  const poNumber = meta?.poNumber ?? request.customerReference;
  const requester = meta?.clientContact ?? request.requester ?? null;
  const isFactura = request.type === 'factura';
  return (
    <li className="rounded-2xl border border-border bg-card p-4 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono-data text-base font-bold text-foreground">{request.orderName}</span>
        <Badge variant={isFactura ? 'default' : 'info'} size="md">{isFactura ? (request.lines?.length && request.partial !== false ? 'Factura parcial' : 'Factura') : 'Remisión'}</Badge>
        <span className="text-sm text-foreground">{request.partnerName}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <span className="flex items-center gap-1">
          <span className="text-muted-foreground">PO:</span>
          {poNumber ? (
            <>
              <span className="font-mono-data font-bold text-data">{poNumber}</span>
              <CopyButton value={poNumber} label={`Copiar PO ${poNumber}`} />
            </>
          ) : <span className="text-muted-foreground">Sin PO</span>}
        </span>
        <span className="flex items-center gap-1">
          <span className="text-muted-foreground">Requisitor:</span>
          {requester ? (
            <>
              <span className="text-foreground">{requester}</span>
              <CopyButton value={requester} label={`Copiar requisitor ${requester}`} />
            </>
          ) : <span className="text-muted-foreground">Sin requisitor</span>}
        </span>
      </div>
      {request.lines && request.lines.length > 0 && (
        <ul className="space-y-0.5 text-sm text-foreground">
          {request.lines.map(l => {
            const p = progress?.find(x => x.lineId === l.lineId);
            return (
              <li key={l.lineId}>
                <span className="font-mono-data font-semibold">{qty(l.qty)}</span>{l.unit ? ` ${l.unit}` : ''} — {l.name}
                {p && (
                  <span className="text-muted-foreground"> · <span className="font-mono-data">{qty(p.done)}</span> de <span className="font-mono-data">{qty(p.qty)}</span> en Odoo</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {request.satKeys && request.satKeys.length > 0 && (
        <div className="rounded-xl border border-border bg-background/40 px-3 py-2 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Claves SAT (OHD)</p>
          <ul className="space-y-0.5 text-sm text-foreground">
            {request.satKeys.map(k => (
              <li key={k.lineId} className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-secondary-foreground">{k.name}:</span>
                {k.code ? (
                  <>
                    <span className="font-mono-data font-semibold text-data">{k.code}</span>
                    {!k.inList && <span className="text-xs font-medium text-warning">(fuera de la lista de OHD, validar)</span>}
                  </>
                ) : (
                  <span className="text-xs font-medium text-warning">Sin clave SAT — Mary elige/valida</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {request.note && (
        <p className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
          <span className="font-medium text-muted-foreground">Nota:</span> {request.note}
        </p>
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
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'pending' | 'done'>('pending');
  const { orders } = useOdooOrders();
  const metaByOrder = useMemo(() => new Map(orders.map(o => [o.id, extractOrderNoteMeta(o)])), [orders]);

  const trimmedQuery = search.trim().toLowerCase();

  const { pending, done, totalCount } = useMemo(() => {
    const all = query.data?.requests ?? [];
    const filtered = trimmedQuery ? all.filter(r => matchesRequestSearch(r, trimmedQuery, metaByOrder.get(r.orderId))) : all;
    return {
      totalCount: all.length,
      pending: filtered
        .filter(r => r.status === 'pendiente')
        .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)),
      done: filtered
        .filter(r => r.status === 'hecha')
        .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
        .slice(0, MAX_DONE_SHOWN),
    };
  }, [query.data?.requests, trimmedQuery, metaByOrder]);

  if (query.isLoading) return <RequestsSkeleton />;
  if (!query.data) {
    return (
      <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        No se pudieron cargar las solicitudes. {query.error instanceof Error ? query.error.message : ''}
      </div>
    );
  }

  return (
    <div className="space-y-5">
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

      {totalCount > 0 && (
        <search aria-label="Buscar solicitudes" className="block max-w-md">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <label htmlFor="requests-search" className="sr-only">Buscar por SO, cliente, PO, nota o quien pidió</label>
            <Input
              id="requests-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape' && search) {
                  e.preventDefault();
                  setSearch('');
                }
              }}
              placeholder="Filtrar por SO, cliente, PO, nota o solicitante…"
              className={search ? 'pl-10 pr-10' : 'pl-10'}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Limpiar búsqueda de solicitudes"
                title="Limpiar búsqueda"
                className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </search>
      )}

      {trimmedQuery && pending.length === 0 && done.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-10 text-center">
          <p className="text-base font-semibold text-foreground">Ninguna solicitud coincide con "{search.trim()}"</p>
          <Button type="button" variant="secondary" className="min-h-11 rounded-xl px-4 text-sm font-semibold" onClick={() => setSearch('')}>
            Limpiar búsqueda
          </Button>
        </div>
      ) : (
        <>
          <SegmentedControl
            label="Ver solicitudes"
            value={view}
            onChange={setView}
            options={[
              { value: 'pending', label: <>Pendientes (<span className="font-mono-data">{pending.length}</span>)</> },
              { value: 'done', label: <>Hechas (<span className="font-mono-data">{done.length}</span>)</> },
            ]}
          />
          {view === 'pending' ? (
          <section aria-labelledby="req-pend" className="space-y-3">
            <h2 id="req-pend" className="sr-only">Solicitudes pendientes</h2>
            {pending.length === 0 && <EmptyState title="No hay solicitudes pendientes" hint="Se piden desde Órdenes: marca partidas y usa «Pedir factura o remisión»." />}
            <ul className="space-y-3">
              {pending.map(r => (
                <RequestCard
                  key={r.id}
                  request={r}
                  meta={metaByOrder.get(r.orderId)}
                  progress={query.data.progress?.[r.id]}
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
          ) : (
          <section aria-labelledby="req-done" className="space-y-3">
            <h2 id="req-done" className="sr-only">Solicitudes hechas</h2>
            <p className="text-sm text-muted-foreground">Se muestran las {MAX_DONE_SHOWN} más recientes.</p>
            {done.length === 0 && <p className="rounded-2xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">Todavía no hay solicitudes hechas.</p>}
            <ul className="space-y-3">{done.map(r => <RequestCard key={r.id} request={r} meta={metaByOrder.get(r.orderId)} />)}</ul>
          </section>
          )}
        </>
      )}
    </div>
  );
}
