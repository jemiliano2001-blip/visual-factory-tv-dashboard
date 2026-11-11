import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { OdooSaleOrder } from '../services/odoo';
import { auth } from '../firebase';
import { useMobile } from '../hooks/useMobile';
import { useInvoiceRequests, useSubmitInvoiceRequests } from '../hooks/useInvoiceRequests';
import type { CreateInvoiceRequestsResult } from '../services/invoiceRequests';
import { buildDrafts, missingSatCount, requestAvailability, suggestedSat, type OrderChoice } from '../services/invoiceDrafts';
import { SAT_OHD_CATALOG, isOhdPartner, isSatOhdCode, suggestSatOhdCode } from '../../shared/satOhd';
import { satChoicesFor, type SatCatalog } from '../../shared/satSearch';
import { useSatCatalog } from '../hooks/useSatCatalog';
import { allowsPartialInvoice, clampQty, lineInvoiceRemaining, lineRemainingQty, linePendingQty, pendingRequestsByOrder, type InvoiceRequest, type RequestType } from '../../shared/invoiceRequests';
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

// Se pide por partida y cantidad en remisión y, solo para Fisher y Kohler, también en factura.
const byPieces = (o: OdooSaleOrder, type: RequestType | null) =>
  type === 'remision' || (type === 'factura' && allowsPartialInvoice(o.partner_name));
// Lo que aún se puede pedir: remisión = falta entregar menos lo ya pedido; factura = falta facturar menos lo ya pedido.
const remainingOf = (l: OdooSaleOrder['lines'][number], type: RequestType, pending: InvoiceRequest[]) =>
  type === 'remision' ? lineRemainingQty(l, pending) : lineInvoiceRemaining(l, pending);
const pendingLines = (o: OdooSaleOrder, type: RequestType, pending: InvoiceRequest[]) =>
  o.lines.filter(l => l.id !== undefined && remainingOf(l, type, pending) > 0);
const fullQty = (o: OdooSaleOrder, type: RequestType, pending: InvoiceRequest[]): Record<number, number> =>
  Object.fromEntries(pendingLines(o, type, pending).map(l => [l.id as number, remainingOf(l, type, pending)]));

// Partidas que lleva una factura de OHD (todas las que tienen cantidad).
const satLines = (o: OdooSaleOrder) => o.lines.filter(l => l.id !== undefined && l.qty > 0);

function SatSelect({ lineName, value, onChange, catalog }: { lineName: string; value: string; onChange: (code: string) => void; catalog: SatCatalog | null }) {
  const suggested = value !== '' && value === suggestSatOhdCode(lineName);
  const candidates = useMemo(() => satChoicesFor(lineName, catalog).candidates, [lineName, catalog]);
  return (
    <label className="block space-y-1">
      <span className="text-sm text-muted-foreground">Clave SAT{suggested ? ' (sugerida, revísala)' : ''}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-11 w-full rounded-xl border border-input bg-popover px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
      >
        <option value="">Escoge la clave…</option>
        {candidates.length > 0 && (
          <optgroup label="Sugeridas del catálogo SAT (fuera de la lista de OHD)">
            {candidates.map(c => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
          </optgroup>
        )}
        <optgroup label="Lista de OHD">
          {SAT_OHD_CATALOG.map(k => <option key={k.code} value={k.code}>{k.code} · {k.name}</option>)}
        </optgroup>
      </select>
      {value === '' && <span className="block text-sm text-warning">Falta escoger la clave SAT.</span>}
      {value !== '' && !isSatOhdCode(value) && <span className="block text-sm text-warning">Fuera de la lista de OHD: Mary la validará.</span>}
    </label>
  );
}

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

function OrderRequestCard({ order, pendingForOrder, avail, choice, onType, onQty, onSat, onAll, catalog }: {
  order: OdooSaleOrder;
  pendingForOrder: InvoiceRequest[];
  avail: Availability;
  choice: Choice;
  onType: (type: RequestType | null) => void;
  onQty: (lineId: number, qty: number) => void;
  onSat: (lineId: number, code: string) => void;
  onAll: () => void;
  catalog: SatCatalog | null;
}) {
  const reference = order.customer_reference?.trim();
  const ohd = isOhdPartner(order.partner_name);
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
      {choice.type === 'factura' && ohd && (
        <ul className="space-y-2">
          {satLines(order).map(l => (
            <li key={l.id} className="space-y-2 rounded-lg bg-background/50 p-3">
              <p className="text-sm font-medium text-foreground break-words">{l.name}</p>
              <SatSelect lineName={l.name} value={choice.sat?.[l.id as number] ?? ''} onChange={code => onSat(l.id as number, code)} catalog={catalog} />
            </li>
          ))}
        </ul>
      )}
      {choice.type !== null && byPieces(order, choice.type) && (
        <ul className="space-y-2">
          {choice.type === 'factura' && (
            <li><Button variant="outline" size="lg" onClick={onAll}>Toda la orden</Button></li>
          )}
          {pendingLines(order, choice.type, pendingForOrder).map(l => {
            const id = l.id as number;
            const type = choice.type as RequestType;
            const pending = remainingOf(l, type, pendingForOrder);
            const total = type === 'remision' ? linePendingQty(l) : Math.max(0, l.qty - (l.invoiced ?? 0));
            const alreadyAsked = total - pending;
            const qty = clampQty(choice.lineQty[id] ?? 0, pending);
            return (
              <li key={id} className="space-y-2 rounded-lg bg-background/50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground break-words">{l.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Faltan{type === 'factura' ? ' por facturar' : ''} <span className="font-mono-data">{pending}</span>, vas a pedir <span className="font-mono-data">{qty}</span>
                    </p>
                    {alreadyAsked > 0 && (
                      <p className="text-sm text-muted-foreground">Ya hay <span className="font-mono-data">{alreadyAsked}</span> pedidas en otra {type === 'factura' ? 'factura' : 'remisión'}.</p>
                    )}
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
                </div>
                {ohd && qty > 0 && <SatSelect lineName={l.name} value={choice.sat?.[id] ?? ''} onChange={code => onSat(id, code)} catalog={catalog} />}
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
  const satCatalog = useSatCatalog(open && orders.some(o => isOhdPartner(o.partner_name)));
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [result, setResult] = useState<CreateInvoiceRequestsResult | null>(null);

  // Se limpia al cerrar (no al abrir, para no parpadear con el resultado anterior) y no cuando
  // el sondeo de Odoo cambia la lista: las elecciones de órdenes que siguen ahí se conservan.
  useEffect(() => {
    if (open) return;
    setChoices({});
    setResult(null);
    submit.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reinicio solo al cerrar
  }, [open]);

  const pendingMap = useMemo(() => pendingRequestsByOrder(requests.data ?? EMPTY_STATE), [requests.data]);
  const avails = orders.map(o => requestAvailability(o, pendingMap.get(o.id) ?? []));
  const choiceOf = (o: OdooSaleOrder) => choices[o.id] ?? NO_CHOICE;
  const missing = orders.filter((o, i) => choiceOf(o).type === null && (avails[i].factura === null || avails[i].remision === null)).length;
  // Lo marcado se acota a lo que se puede pedir *ahora* (otra persona pudo pedir o Odoo entregar con el diálogo abierto).
  const effective = orders.map((o): OrderChoice => {
    const c = choiceOf(o);
    if (c.type === null || !byPieces(o, c.type)) return { orderId: o.id, ...c };
    const pend = pendingMap.get(o.id) ?? [];
    const lineQty = Object.fromEntries(Object.entries(c.lineQty).map(([id, qty]) => {
      const line = o.lines.find(l => l.id === Number(id));
      return [id, line ? clampQty(qty, remainingOf(line, c.type as RequestType, pend)) : 0];
    }));
    return { orderId: o.id, type: c.type, lineQty, sat: c.sat, partial: c.type === 'factura' };
  });
  const drafts = buildDrafts(effective);
  // OHD: cada partida que se pide necesita su clave SAT (el servidor también lo exige).
  const satMissing = orders.reduce((sum, o, i) => sum + missingSatCount(o, effective[i]), 0);
  // Remisiones marcadas con todas las cantidades en 0: buildDrafts las omite, así que se avisa antes de enviar.
  const emptyRemisiones = orders.filter(o => byPieces(o, choiceOf(o).type)).length - drafts.filter(d => d.lines).length;
  const canSend = missing === 0 && satMissing === 0 && drafts.length > 0 && !submit.isPending && !requests.isLoading;
  const user = auth.currentUser;
  const sender = user?.email || user?.displayName;

  // Al cambiar de tipo se conservan las claves SAT ya escogidas.
  const typed = (o: OdooSaleOrder, type: RequestType | null, prev: Choice | undefined): Choice => ({
    type,
    lineQty: type !== null && byPieces(o, type) ? fullQty(o, type, pendingMap.get(o.id) ?? []) : {},
    sat: prev?.sat ?? suggestedSat(o),
  });
  const setType = (o: OdooSaleOrder, type: RequestType | null) =>
    setChoices(c => ({ ...c, [o.id]: typed(o, type, c[o.id]) }));
  const setAll = (type: RequestType) =>
    setChoices(c => {
      const next = { ...c };
      orders.forEach((o, i) => { if (avails[i][type] === null) next[o.id] = typed(o, type, c[o.id]); });
      return next;
    });
  const setSat = (o: OdooSaleOrder, lineId: number, code: string) =>
    setChoices(c => ({ ...c, [o.id]: { ...(c[o.id] ?? NO_CHOICE), sat: { ...c[o.id]?.sat, [lineId]: code } } }));
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
          <OrderRequestCard key={o.id} order={o} pendingForOrder={pendingMap.get(o.id) ?? []} avail={avails[i]} choice={choiceOf(o)}
            onType={type => setType(o, type)} onQty={(lineId, qty) => setQty(o, lineId, qty)} onSat={(lineId, code) => setSat(o, lineId, code)} onAll={() => setType(o, 'factura')} catalog={satCatalog} />
        ))}
      </div>
      <div className="shrink-0 border-t border-border bg-popover p-4 space-y-2">
        {submit.error && <p role="alert" className="text-sm font-medium text-destructive">{submit.error.message}</p>}
        {sender && <p className="text-sm text-muted-foreground">Se enviará a nombre de {sender}</p>}
        {missing > 0 && (
          <p className="text-sm text-foreground">Falta escoger en <span className="font-mono-data">{missing}</span> {missing === 1 ? 'orden' : 'órdenes'}</p>
        )}
        {satMissing > 0 && (
          <p className="text-sm text-foreground">Falta la clave SAT en <span className="font-mono-data">{satMissing}</span> {satMissing === 1 ? 'partida' : 'partidas'} de OHD</p>
        )}
        {emptyRemisiones > 0 && (
          <p className="text-sm text-warning">
            <span className="font-mono-data">{emptyRemisiones}</span> {emptyRemisiones === 1 ? 'solicitud tiene' : 'solicitudes tienen'} todas las piezas en 0 y no se {emptyRemisiones === 1 ? 'enviará' : 'enviarán'}. Sube la cantidad para pedirla.
          </p>
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
