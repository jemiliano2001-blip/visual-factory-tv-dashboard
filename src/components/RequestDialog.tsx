import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { OdooSaleOrder } from '../services/odoo';
import { auth } from '../firebase';
import { useMobile } from '../hooks/useMobile';
import { useInvoiceRequests, useSubmitInvoiceRequests } from '../hooks/useInvoiceRequests';
import type { CreateInvoiceRequestsResult } from '../services/invoiceRequests';
import { buildDrafts, requestAvailability, type OrderChoice } from '../services/invoiceDrafts';
import { clampQty, linePendingQty, pendingRequestsByOrder, type InvoiceRequest, type RequestType } from '../../shared/invoiceRequests';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from './ui/drawer';

type Choice = Omit<OrderChoice, 'orderId'>;
type Availability = ReturnType<typeof requestAvailability>;
const TYPES: Array<{ type: RequestType; label: string }> = [
  { type: 'factura', label: 'Factura' },
  { type: 'remision', label: 'Remisión' },
];
const NO_CHOICE: Choice = { type: null, lineQty: {} };
const EMPTY_STATE = { requests: [], updatedAt: '' };

const pendingLines = (o: OdooSaleOrder) => o.lines.filter(l => l.id !== undefined && linePendingQty(l) > 0);
const fullQty = (o: OdooSaleOrder): Record<number, number> =>
  Object.fromEntries(pendingLines(o).map(l => [l.id as number, linePendingQty(l)]));

export function RequestBadges({ requests }: { requests: InvoiceRequest[] | undefined }) {
  const pending = requests?.filter(r => r.status === 'pendiente') ?? [];
  if (pending.length === 0) return null;
  return (
    <>
      {pending.map(r => (
        <Badge key={r.id} variant="info" size="lg">
          {r.type === 'factura' ? 'Factura solicitada' : 'Remisión solicitada'}
        </Badge>
      ))}
    </>
  );
}

function OrderRequestCard({ order, avail, choice, onType, onQty }: {
  order: OdooSaleOrder;
  avail: Availability;
  choice: Choice;
  onType: (type: RequestType | null) => void;
  onQty: (lineId: number, qty: number) => void;
}) {
  const reference = order.customer_reference?.trim();
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div>
        <p className="font-mono-data text-base font-bold text-foreground">{order.name}</p>
        <p className="text-sm text-muted-foreground">{order.partner_name}</p>
        {reference && <p className="text-sm text-muted-foreground">Compra {reference}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {TYPES.map(({ type, label }) => (
          <div key={type} className="space-y-1">
            <Button
              size="lg"
              className="w-full"
              variant={choice.type === type ? 'default' : 'outline'}
              aria-pressed={choice.type === type}
              disabled={avail[type] !== null}
              onClick={() => onType(choice.type === type ? null : type)}
            >
              {label}
            </Button>
            {avail[type] && <p className="text-sm text-muted-foreground">{avail[type]}</p>}
          </div>
        ))}
      </div>
      {choice.type === 'remision' && (
        <ul className="space-y-2">
          {pendingLines(order).map(l => {
            const id = l.id as number;
            const pending = linePendingQty(l);
            const qty = choice.lineQty[id] ?? 0;
            return (
              <li key={id} className="flex items-center justify-between gap-3 rounded-lg bg-background/50 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground break-words">{l.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Faltan <span className="font-mono-data">{pending}</span>, vas a pedir <span className="font-mono-data">{qty}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" className="size-11 p-0" aria-label={`Quitar una ${l.name}`}
                    disabled={qty <= 0} onClick={() => onQty(id, clampQty(qty - 1, pending))}>
                    <Minus className="size-5" />
                  </Button>
                  <Button variant="outline" className="size-11 p-0" aria-label={`Agregar una ${l.name}`}
                    disabled={qty >= pending} onClick={() => onQty(id, clampQty(qty + 1, pending))}>
                    <Plus className="size-5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RequestContent({ orders, open, onClose, onSent }: RequestDialogProps) {
  const requests = useInvoiceRequests({ enabled: open });
  const submit = useSubmitInvoiceRequests();
  const orderKey = orders.map(o => o.id).join(',');
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [result, setResult] = useState<CreateInvoiceRequestsResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setChoices({});
    setResult(null);
    submit.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reinicio solo al abrir o cambiar de órdenes
  }, [open, orderKey]);

  const pendingMap = useMemo(() => pendingRequestsByOrder(requests.data ?? EMPTY_STATE), [requests.data]);
  const avails = orders.map(o => requestAvailability(o, pendingMap.get(o.id) ?? []));
  const choiceOf = (o: OdooSaleOrder) => choices[o.id] ?? NO_CHOICE;
  const missing = orders.filter((o, i) => choiceOf(o).type === null && (avails[i].factura === null || avails[i].remision === null)).length;
  const drafts = buildDrafts(orders.map(o => ({ orderId: o.id, ...choiceOf(o) })));
  const canSend = missing === 0 && drafts.length > 0 && !submit.isPending && !requests.isLoading;
  const user = auth.currentUser;
  const sender = user?.email || user?.displayName;

  const setType = (o: OdooSaleOrder, type: RequestType | null) =>
    setChoices(c => ({ ...c, [o.id]: { type, lineQty: type === 'remision' ? fullQty(o) : {} } }));
  const setAll = (type: RequestType) =>
    setChoices(c => {
      const next = { ...c };
      orders.forEach((o, i) => { if (avails[i][type] === null) next[o.id] = { type, lineQty: type === 'remision' ? fullQty(o) : {} }; });
      return next;
    });
  const setQty = (o: OdooSaleOrder, lineId: number, qty: number) =>
    setChoices(c => ({ ...c, [o.id]: { ...choiceOf(o), lineQty: { ...choiceOf(o).lineQty, [lineId]: qty } } }));
  const send = () => { submit.mutateAsync(drafts).then(setResult).catch(() => undefined); };

  if (result) {
    const { created, skipped, notified, emailed } = result;
    return (
      <>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3" aria-live="polite">
          <p className="text-base font-bold text-foreground">
            {created.length === 0
              ? 'No se creó ninguna solicitud'
              : emailed
                ? 'Listo, se mandó el correo a facturación'
                : notified
                  ? 'Listo, se avisó a facturación'
                  : 'Quedó guardada, pero no se pudo avisar. Avísale a facturación.'}
          </p>
          <p className="text-sm text-muted-foreground">
            Se {created.length === 1 ? 'creó' : 'crearon'} <span className="font-mono-data">{created.length}</span> {created.length === 1 ? 'solicitud' : 'solicitudes'}.
          </p>
          {skipped.length > 0 && (
            <ul className="space-y-1 text-sm text-foreground">
              {skipped.map((s, i) => <li key={i}>{s.orderName ?? `Orden ${s.orderId}`}: {s.reason}</li>)}
            </ul>
          )}
        </div>
        <div className="shrink-0 border-t border-border p-4">
          <Button size="lg" className="w-full" onClick={() => { if (created.length > 0) onSent?.(); onClose(); }}>Cerrar</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {requests.isLoading && <p className="text-sm text-muted-foreground">Revisando solicitudes anteriores…</p>}
        {requests.isError && (
          <p className="text-sm text-warning">No se pudieron revisar las solicitudes anteriores. Puedes continuar; el servidor revisa que no se repitan.</p>
        )}
        {orders.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">Para todas:</span>
            {TYPES.map(({ type, label }) => (
              <Button key={type} size="lg" variant="outline" onClick={() => setAll(type)}>{label}</Button>
            ))}
          </div>
        )}
        {orders.map((o, i) => (
          <OrderRequestCard key={o.id} order={o} avail={avails[i]} choice={choiceOf(o)}
            onType={type => setType(o, type)} onQty={(lineId, qty) => setQty(o, lineId, qty)} />
        ))}
      </div>
      <div className="shrink-0 border-t border-border bg-popover p-4 space-y-2">
        {submit.error && <p role="alert" className="text-sm font-medium text-destructive">{submit.error.message}</p>}
        {sender && <p className="text-sm text-muted-foreground">Se enviará a nombre de {sender}</p>}
        {missing > 0 && (
          <p className="text-sm text-foreground">Falta escoger en <span className="font-mono-data">{missing}</span> {missing === 1 ? 'orden' : 'órdenes'}</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button size="lg" disabled={!canSend} onClick={send}>{submit.isPending ? 'Enviando…' : 'Enviar solicitud'}</Button>
        </div>
      </div>
    </>
  );
}

interface RequestDialogProps { orders: OdooSaleOrder[]; open: boolean; onClose: () => void; onSent?: () => void }

export function RequestDialog(props: RequestDialogProps) {
  const isMobile = useMobile();
  const title = props.orders.length === 1 ? `Pedir factura o remisión · ${props.orders[0].name}` : 'Pedir factura o remisión';
  const onOpenChange = (open: boolean) => { if (!open) props.onClose(); };

  if (isMobile) {
    return (
      <Drawer open={props.open} onOpenChange={onOpenChange}>
        <DrawerContent className="z-[70] max-h-[92dvh] flex flex-col bg-popover border-border rounded-t-2xl">
          <DrawerHeader className="text-left"><DrawerTitle className="text-base">{title}</DrawerTitle></DrawerHeader>
          <RequestContent {...props} />
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={props.open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="p-4 pr-16"><DialogTitle>{title}</DialogTitle></DialogHeader>
        <RequestContent {...props} />
      </DialogContent>
    </Dialog>
  );
}
