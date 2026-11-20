import React, { useState } from 'react';
import { OdooSaleOrder, parseOdooDate, getOrderPriority, getOrderStatus } from '../services/odoo';
import { extractOrderNoteMeta } from '../services/orderNoteParser';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Calendar, User, Package, FileText, CheckCircle2, Clock, X } from 'lucide-react';
import { SanitizedHtml } from './SanitizedHtml';
import { useMobile } from '../hooks/useMobile';
import { auth } from '../firebase';
import { useInvoiceRequests } from '../hooks/useInvoiceRequests';
import { pendingRequestsByOrder } from '../../shared/invoiceRequests';
import { RequestDialog, RequestBadges } from './RequestDialog';
import { Button } from './ui/button';
import { CopyButton } from './CopyButton';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from './ui/drawer';
import CompanyBadge from './CompanyBadge';
import { getSmartCompanyName } from '../utils/customerNames';

interface OrderDetailsModalProps {
  order: OdooSaleOrder | null;
  isOpen: boolean;
  onClose: () => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  low:      'bg-card/80 text-muted-foreground border-border',
  normal:   'bg-info/15 text-info border-info/30',
  high:     'bg-warning/15 text-warning border-warning/30',
  critical: 'bg-destructive/15 text-destructive border-destructive/30',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baja', normal: 'Normal', high: 'Alta', critical: 'Vencida',
};

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({ order, isOpen, onClose }) => {
  const isMobile = useMobile();
  const [requestOpen, setRequestOpen] = useState(false);
  // La TV pública entra con sesión anónima: el servidor la rechaza, así que no ofrece pedir.
  const canRequest = !!auth.currentUser && !auth.currentUser.isAnonymous;
  const invoiceRequests = useInvoiceRequests({ enabled: isOpen && canRequest });

  if (!order) return null;

  const pendingRequests = invoiceRequests.data ? pendingRequestsByOrder(invoiceRequests.data).get(order.id) : undefined;
  const requestFooter = canRequest && (
    <div className="shrink-0 border-t border-border p-4">
      <Button type="button" size="lg" className="w-full" onClick={() => setRequestOpen(true)}>
        Pedir factura o remisión
      </Button>
    </div>
  );
  const requestDialog = (
    <RequestDialog orders={[order]} open={requestOpen} onClose={() => setRequestOpen(false)} />
  );

  const orderDate = parseOdooDate(order.date_order);
  const commitmentDate = parseOdooDate(order.commitment_date);
  const priority = getOrderPriority(order);
  const orderStatus = getOrderStatus(order);
  const poNumber = order.customer_reference?.trim() || extractOrderNoteMeta(order).poNumber;

  const deliveryValueClass =
    orderStatus.level === 'overdue'
      ? 'text-destructive font-semibold'
      : orderStatus.level === 'warning'
        ? 'text-warning font-semibold'
        : 'text-foreground font-medium';

  const deliveryIconClass =
    orderStatus.level === 'overdue'
      ? 'text-destructive'
      : orderStatus.level === 'warning'
        ? 'text-warning'
        : 'text-muted-foreground';

  const metadataCard = (
    <div className="rounded-xl border border-border bg-card/30 divide-y divide-border mb-5 sm:mb-8">
      <div className="flex justify-between items-center gap-3 px-4 py-3 min-h-[48px]">
        <span className="text-xs font-medium text-muted-foreground">Creación</span>
        <div className="flex items-center gap-2 text-foreground font-medium font-mono-data tabular-nums text-sm">
          <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
          {orderDate ? format(orderDate, 'dd/MM/yyyy HH:mm') : '-'}
        </div>
      </div>
      <div className="flex justify-between items-center gap-3 px-4 py-3 min-h-[48px]">
        <span className="text-xs font-medium text-muted-foreground">Entrega</span>
        <div className={`flex items-center gap-2 font-mono-data tabular-nums text-sm ${deliveryValueClass}`}>
          <Clock className={`w-4 h-4 flex-shrink-0 ${deliveryIconClass}`} aria-hidden="true" />
          {commitmentDate ? format(commitmentDate, 'dd/MM/yyyy') : '-'}
        </div>
      </div>
      {poNumber && (
        <div className="flex justify-between items-center gap-3 px-4 py-3 min-h-[48px]">
          <span className="text-xs font-medium text-muted-foreground">OC cliente</span>
          <div className="flex items-center gap-1.5 text-foreground font-medium text-sm min-w-0">
            <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
            <span className="truncate max-w-[160px] sm:max-w-full font-mono-data">{poNumber}</span>
            <CopyButton value={poNumber} label={`Copiar PO ${poNumber}`} />
          </div>
        </div>
      )}
      <div className="flex justify-between items-center gap-3 px-4 py-3 min-h-[48px]">
        <span className="text-xs font-medium text-muted-foreground">Responsable</span>
        <div className="flex items-center gap-2 text-foreground font-medium text-sm">
          <User className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
          <span className="truncate max-w-[160px] sm:max-w-full">{order.salesperson || '-'}</span>
        </div>
      </div>
      {order.delivery_times && (
        <div className="flex justify-between items-center gap-3 px-4 py-3 min-h-[48px]">
          <span className="text-xs font-medium text-muted-foreground">Horario cliente</span>
          <div className="flex items-center gap-2 text-data font-medium text-sm text-right min-w-0">
            <Clock className="w-4 h-4 text-data flex-shrink-0" aria-hidden="true" />
            <span className="truncate max-w-[220px] sm:max-w-full font-mono-data">{order.delivery_times}</span>
          </div>
        </div>
      )}
    </div>
  );

  const headerContent = (
    <div className="flex items-center gap-3 sm:gap-4">
      <CompanyBadge company={order.partner_name} size="md" className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="text-xl sm:text-2xl md:text-3xl font-black text-foreground font-mono-data tracking-tight">
            {order.name}
          </span>
          <CopyButton value={order.name} label={`Copiar SO ${order.name}`} />
          <span className={`inline-flex items-center px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-xs sm:text-xs font-bold uppercase tracking-wider border transition-colors duration-200 ${PRIORITY_COLORS[priority]}`}>
            {PRIORITY_LABELS[priority]}
          </span>
        </div>
        <p className="text-sm sm:text-base md:text-lg font-medium text-secondary-foreground mt-0.5 truncate" title={order.partner_name}>
          {getSmartCompanyName(order.partner_name, 'header')}
        </p>
        <RequestBadges requests={pendingRequests} />
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <>
      <Drawer open={isOpen && !requestOpen} onOpenChange={(open) => { if (!open && !requestOpen) onClose(); }}>
        <DrawerContent className="z-[70] max-h-[92dvh] flex flex-col bg-popover/95 border-border rounded-t-2xl">
          {/* Top glow line */}

          {/* Header fijo: PO + cliente + X siempre visibles (no se ocultan al hacer scroll) */}
          <div className="relative flex-shrink-0 border-b border-border px-4 pt-4 pb-4">
            <DrawerHeader className="p-0 text-left">
              <DrawerTitle asChild>
                <div className="pr-14">{headerContent}</div>
              </DrawerTitle>
            </DrawerHeader>
            <DrawerClose
              aria-label="Cerrar"
              className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-card/80 backdrop-blur-md text-secondary-foreground border border-input hover:text-foreground hover:bg-secondary transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 cursor-pointer shadow-xl"
            >
              <X className="w-5 h-5" />
            </DrawerClose>
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto custom-scrollbar no-scrollbar flex-1 min-h-0 p-4">
            {/* ── Campos de cabecera ── */}
            {metadataCard}

            {/* ── Líneas de la orden — tarjetas verticales (sin scroll horizontal) ── */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-info/10 border border-info/20">
                  <Package className="w-4 h-4 text-info" aria-hidden="true" />
                </div>
                <h4 className="text-xs font-bold text-secondary-foreground uppercase tracking-wider">Líneas de la Orden</h4>
              </div>
              <div className="flex flex-col gap-2">
                {order.lines.map((line, idx) => {
                  const isComplete = line.qty > 0 && line.delivered >= line.qty;
                  const isPartial = line.delivered > 0 && line.delivered < line.qty;
                  return (
                    <div
                      key={idx}
                      className="rounded-xl border border-border bg-background/50 p-3.5 shadow-inner"
                    >
                      <div className="flex items-start gap-2 mb-2.5">
                        {isComplete ? (
                          <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" aria-label="Completada" />
                        ) : (
                          <>
                            <span className="w-2 h-2 rounded-full bg-warning flex-shrink-0 mt-1.5" aria-hidden="true" />
                            <span className="sr-only">Pendiente</span>
                          </>
                        )}
                        <p className={`text-sm font-semibold leading-snug ${isComplete ? 'text-muted-foreground' : 'text-foreground'}`}>
                          {line.name}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-2 pl-6">
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Cantidad</span>
                          <span className="text-base font-bold text-secondary-foreground font-mono-data leading-tight">
                            {line.qty.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Entregado</span>
                          <span className={`px-2.5 py-0.5 rounded-md text-sm font-bold font-mono-data ${
                            isComplete ? 'bg-success/10 text-success border border-success/20'
                            : isPartial ? 'bg-warning/10 text-warning border border-warning/20'
                            : 'bg-secondary/50 text-muted-foreground border border-border'
                          }`}>
                            {line.delivered.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {order.note && (
              <div className="mt-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-1.5 rounded-lg bg-warning/10 border border-warning/20">
                    <FileText className="w-4 h-4 text-warning" aria-hidden="true" />
                  </div>
                  <h4 className="text-xs font-bold text-secondary-foreground uppercase tracking-wider">Notas</h4>
                </div>
                <SanitizedHtml
                  html={order.note}
                  className="p-4 rounded-2xl bg-card/40 border border-border text-secondary-foreground text-sm whitespace-pre-wrap font-medium leading-relaxed max-h-[150px] overflow-y-auto custom-scrollbar no-scrollbar"
                />
              </div>
            )}
          </div>
          {requestFooter}
        </DrawerContent>
      </Drawer>
      {requestDialog}
      </>
    );
  }

  return (
    <>
    <Dialog open={isOpen && !requestOpen} onOpenChange={(open) => { if (!open && !requestOpen) onClose(); }}>
      <DialogContent className="max-w-4xl w-[95vw] sm:w-full max-h-[90vh] flex flex-col border-border bg-popover/95 backdrop-blur-3xl shadow-2xl p-0 overflow-hidden rounded-2xl">
        {/* Glow effect at the top */}

        {/* ── Header fijo: siempre visible, la X vive aquí ─────────────────── */}
        <div className="flex-shrink-0 border-b border-border px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-4">
          <DialogHeader className="pr-12">
            <DialogTitle asChild>
              <div>{headerContent}</div>
            </DialogTitle>
            <DialogDescription className="sr-only">{order.partner_name}</DialogDescription>
          </DialogHeader>
        </div>

        {/* ── Body scrollable ──────────────────────────────────────────────── */}
        <div className="overflow-y-auto custom-scrollbar no-scrollbar flex-1 min-h-0 p-4 sm:p-6 lg:p-8">
          {/* ── Campos de cabecera ─────────────────────────────────────────── */}
          {metadataCard}

          <div className="mb-6 md:mb-8">
            <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
              <div className="p-1.5 rounded-lg bg-info/10 border border-info/20">
                <Package className="w-4 h-4 text-info" aria-hidden="true" />
              </div>
              <h4 className="text-xs sm:text-xs font-bold text-secondary-foreground uppercase tracking-wider">Líneas de la Orden</h4>
            </div>

            <div className="rounded-2xl border border-border bg-background/50 overflow-hidden shadow-inner">
              <div tabIndex={0} role="region" aria-label="Partidas de la orden" className="max-h-[350px] overflow-auto custom-scrollbar no-scrollbar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                <table className="w-full text-left text-xs sm:text-sm whitespace-nowrap sm:whitespace-normal">
                  <thead className="bg-card/80 backdrop-blur-md sticky top-0 z-10 border-b border-border">
                    <tr>
                      <th scope="col" className="px-3 py-3 sm:px-5 sm:py-4 font-bold text-muted-foreground uppercase tracking-wider text-xs sm:text-xs">Descripción</th>
                      <th scope="col" className="px-3 py-3 sm:px-5 sm:py-4 font-bold text-muted-foreground uppercase tracking-wider text-xs sm:text-xs w-20 sm:w-28 text-right">Cant.</th>
                      <th scope="col" className="px-3 py-3 sm:px-5 sm:py-4 font-bold text-muted-foreground uppercase tracking-wider text-xs sm:text-xs w-20 sm:w-28 text-right">Entregado</th>
                      <th scope="col" className="px-3 py-3 sm:px-5 sm:py-4 font-bold text-muted-foreground uppercase tracking-wider text-xs sm:text-xs w-14 sm:w-16 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {order.lines.map((line, idx) => {
                      const isComplete = line.qty > 0 && line.delivered >= line.qty;
                      const isPartial = line.delivered > 0 && line.delivered < line.qty;
                      return (
                        <tr key={idx} className="group hover:bg-info/10 transition-colors duration-200">
                          <td className="px-3 py-3 sm:px-5 sm:py-4 whitespace-normal min-w-[200px] sm:min-w-0">
                            <div className={`font-medium transition-colors duration-200 ${isComplete ? 'text-muted-foreground' : 'text-secondary-foreground group-hover:text-foreground'}`}>
                              {line.name}
                            </div>
                          </td>
                          <td className="px-3 py-3 sm:px-5 sm:py-4 text-right font-mono-data text-muted-foreground">
                            {line.qty.toFixed(2)}
                          </td>
                          <td className="px-3 py-3 sm:px-5 sm:py-4 text-right font-mono-data">
                            <span className={`px-2 py-1 sm:px-2.5 sm:py-1 rounded-md text-xs sm:text-xs font-bold ${
                              isComplete
                                ? 'bg-success/10 text-success border border-success/20'
                                : isPartial
                                ? 'bg-warning/10 text-warning border border-warning/20'
                                : 'bg-secondary/50 text-muted-foreground border border-border'
                            }`}>
                              {line.delivered.toFixed(2)}
                            </span>
                          </td>
                          <td className="px-3 py-3 sm:px-5 sm:py-4 text-center">
                            {isComplete ? (
                              <CheckCircle2 className="w-4 h-4 text-success mx-auto" aria-label="Completada" />
                            ) : (
                              <>
                                <span className="block w-1.5 h-1.5 rounded-full bg-warning mx-auto animate-pulse" aria-hidden="true" />
                                <span className="sr-only">Pendiente</span>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {order.note && (
            <div className="mt-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-1.5 rounded-lg bg-warning/10 border border-warning/20">
                  <FileText className="w-4 h-4 text-warning" aria-hidden="true" />
                </div>
                <h4 className="text-xs font-bold text-secondary-foreground uppercase tracking-wider">Notas</h4>
              </div>
              <SanitizedHtml
                html={order.note}
                className="p-4 sm:p-5 rounded-2xl bg-card/40 border border-border text-secondary-foreground text-xs sm:text-sm whitespace-pre-wrap font-medium leading-relaxed max-h-[150px] overflow-y-auto custom-scrollbar no-scrollbar hover:border-warning/20 transition-colors duration-300"
              />
            </div>
          )}
        </div>
        {requestFooter}
      </DialogContent>
    </Dialog>
    {requestDialog}
    </>
  );
};

export default OrderDetailsModal;
