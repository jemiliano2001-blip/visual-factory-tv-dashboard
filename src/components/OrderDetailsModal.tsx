import React from 'react';
import { OdooSaleOrder, parseOdooDate, getOrderPriority } from '../services/odoo';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Calendar, User, Package, FileText, CheckCircle2, Clock, X } from 'lucide-react';
import DOMPurify from 'dompurify';
import { useMobile } from '../hooks/useMobile';
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
  normal:   'bg-blue-900/30 text-blue-400 border-blue-500/30',
  high:     'bg-orange-900/30 text-orange-400 border-orange-500/30',
  critical: 'bg-red-900/30 text-red-400 border-red-500/30',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baja', normal: 'Normal', high: 'Alta', critical: 'Vencida',
};

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({ order, isOpen, onClose }) => {
  const isMobile = useMobile();

  if (!order) return null;

  const orderDate = parseOdooDate(order.date_order);
  const commitmentDate = parseOdooDate(order.commitment_date);
  const priority = getOrderPriority(order);
  const customerReference = order.customer_reference?.trim() || null;

  const headerContent = (
    <div className="flex items-center gap-3 sm:gap-4">
      <CompanyBadge company={order.partner_name} size="md" className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="text-xl sm:text-2xl md:text-3xl font-black text-foreground font-mono-data tracking-tight">
            {order.name}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-xs sm:text-xs font-bold uppercase tracking-wider border transition-colors duration-200 ${PRIORITY_COLORS[priority]}`}>
            {PRIORITY_LABELS[priority]}
          </span>
        </div>
        <p className="text-sm sm:text-base md:text-lg font-medium text-secondary-foreground mt-0.5 truncate" title={order.partner_name}>
          {getSmartCompanyName(order.partner_name, 'header')}
        </p>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent className="z-[70] max-h-[92dvh] flex flex-col bg-popover/95 border-border rounded-t-2xl">
          {/* Top glow line */}

          {/* Header fijo: PO + cliente + X siempre visibles (no se ocultan al hacer scroll) */}
          <div className="relative flex-shrink-0 px-4 pt-4 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
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
            <div className="rounded-xl border border-border bg-card/30 divide-y divide-border mb-5">
              <div className="flex justify-between items-center gap-3 px-4 py-3.5 min-h-[48px]">
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Creación</span>
                <div className="flex items-center gap-2 text-blue-400 font-semibold text-sm">
                  <Calendar className="w-4 h-4 text-blue-500/70 flex-shrink-0" />
                  {orderDate ? format(orderDate, 'dd/MM/yyyy HH:mm') : '-'}
                </div>
              </div>
              <div className="flex justify-between items-center gap-3 px-4 py-3.5 min-h-[48px]">
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Entrega</span>
                <div className="flex items-center gap-2 text-blue-400 font-semibold text-sm">
                  <Clock className="w-4 h-4 text-blue-500/70 flex-shrink-0" />
                  {commitmentDate ? format(commitmentDate, 'dd/MM/yyyy') : '-'}
                </div>
              </div>
              {customerReference && (
                <div className="flex justify-between items-center gap-3 px-4 py-3.5 min-h-[48px]">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">OC cliente</span>
                  <div className="flex items-center gap-2 text-blue-400 font-semibold text-sm min-w-0">
                    <FileText className="w-4 h-4 text-blue-500/70 flex-shrink-0" />
                    <span className="truncate max-w-[180px] font-mono-data">{customerReference}</span>
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center gap-3 px-4 py-3.5 min-h-[48px]">
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Responsable</span>
                <div className="flex items-center gap-2 text-blue-400 font-semibold text-sm">
                  <User className="w-4 h-4 text-blue-500/70 flex-shrink-0" />
                  <span className="truncate max-w-[180px]">{order.salesperson || '-'}</span>
                </div>
              </div>
              {order.delivery_times && (
                <div className="flex justify-between items-center gap-3 px-4 py-3.5 min-h-[48px]">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Horario cliente</span>
                  <div className="flex items-center gap-2 text-cyan-300 font-semibold text-sm text-right min-w-0">
                    <Clock className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    <span className="truncate max-w-[220px] font-mono-data">{order.delivery_times}</span>
                  </div>
                </div>
              )}
            </div>

            {/* ── Líneas de la orden — tarjetas verticales (sin scroll horizontal) ── */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <Package className="w-4 h-4 text-blue-400" />
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
                        {isComplete
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                          : <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0 mt-1.5" />
                        }
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
                            isComplete ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : isPartial ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
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
                  <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <FileText className="w-4 h-4 text-amber-400" />
                  </div>
                  <h4 className="text-xs font-bold text-secondary-foreground uppercase tracking-wider">Notas</h4>
                </div>
                <div
                  className="p-4 rounded-2xl bg-card/40 border border-border text-secondary-foreground text-sm whitespace-pre-wrap font-medium leading-relaxed max-h-[150px] overflow-y-auto custom-scrollbar no-scrollbar"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(order.note) }}
                />
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-[95vw] sm:w-full max-h-[90vh] flex flex-col border-border bg-popover/95 backdrop-blur-3xl shadow-2xl p-0 overflow-hidden rounded-2xl">
        {/* Glow effect at the top */}

        {/* ── Header fijo: siempre visible, la X vive aquí ─────────────────── */}
        <div className="flex-shrink-0 px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
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
          <div className="rounded-xl border border-border bg-card/30 divide-y divide-border mb-5 sm:mb-8">
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Creación</span>
              <div className="flex items-center gap-2 text-blue-400 font-medium text-sm">
                <Calendar className="w-4 h-4 text-blue-500/70 flex-shrink-0" />
                {orderDate ? format(orderDate, 'dd/MM/yyyy HH:mm') : '-'}
              </div>
            </div>
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Entrega</span>
              <div className="flex items-center gap-2 text-blue-400 font-medium text-sm">
                <Clock className="w-4 h-4 text-blue-500/70 flex-shrink-0" />
                {commitmentDate ? format(commitmentDate, 'dd/MM/yyyy') : '-'}
              </div>
            </div>
            {customerReference && (
              <div className="flex justify-between items-center gap-3 px-4 py-3 min-h-[48px]">
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">OC cliente</span>
                <div className="flex items-center gap-2 text-blue-400 font-medium text-sm min-w-0">
                  <FileText className="w-4 h-4 text-blue-500/70 flex-shrink-0" />
                  <span className="truncate max-w-[160px] sm:max-w-full font-mono-data">{customerReference}</span>
                </div>
              </div>
            )}
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Responsable</span>
              <div className="flex items-center gap-2 text-blue-400 font-medium text-sm">
                <User className="w-4 h-4 text-blue-500/70 flex-shrink-0" />
                <span className="truncate max-w-[160px] sm:max-w-full">{order.salesperson || '-'}</span>
              </div>
            </div>
            {order.delivery_times && (
              <div className="flex justify-between items-center gap-3 px-4 py-3 min-h-[48px]">
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Horario cliente</span>
                <div className="flex items-center gap-2 text-cyan-300 font-medium text-sm text-right min-w-0">
                  <Clock className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <span className="truncate max-w-[280px] sm:max-w-full font-mono-data">{order.delivery_times}</span>
                </div>
              </div>
            )}
          </div>

          <div className="mb-6 md:mb-8">
            <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
              <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Package className="w-4 h-4 text-blue-400" />
              </div>
              <h4 className="text-xs sm:text-xs font-bold text-secondary-foreground uppercase tracking-wider">Líneas de la Orden</h4>
            </div>

            <div className="rounded-2xl border border-border bg-background/50 overflow-hidden shadow-inner">
              <div className="max-h-[350px] overflow-auto custom-scrollbar no-scrollbar">
                <table className="w-full text-left text-xs sm:text-sm whitespace-nowrap sm:whitespace-normal">
                  <thead className="bg-card/80 backdrop-blur-md sticky top-0 z-10 border-b border-border">
                    <tr>
                      <th className="px-3 py-3 sm:px-5 sm:py-4 font-bold text-muted-foreground uppercase tracking-wider text-xs sm:text-xs">Descripción</th>
                      <th className="px-3 py-3 sm:px-5 sm:py-4 font-bold text-muted-foreground uppercase tracking-wider text-xs sm:text-xs w-20 sm:w-28 text-right">Cant.</th>
                      <th className="px-3 py-3 sm:px-5 sm:py-4 font-bold text-muted-foreground uppercase tracking-wider text-xs sm:text-xs w-20 sm:w-28 text-right">Entregado</th>
                      <th className="px-3 py-3 sm:px-5 sm:py-4 font-bold text-muted-foreground uppercase tracking-wider text-xs sm:text-xs w-14 sm:w-16 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {order.lines.map((line, idx) => {
                      const isComplete = line.qty > 0 && line.delivered >= line.qty;
                      const isPartial = line.delivered > 0 && line.delivered < line.qty;
                      return (
                        <tr key={idx} className="group hover:bg-blue-900/10 transition-colors duration-200">
                          <td className="px-3 py-3 sm:px-5 sm:py-4 whitespace-normal min-w-[200px] sm:min-w-0">
                            <div className={`font-medium transition-colors duration-200 ${isComplete ? 'text-muted-foreground' : 'text-secondary-foreground group-hover:text-blue-100'}`}>
                              {line.name}
                            </div>
                          </td>
                          <td className="px-3 py-3 sm:px-5 sm:py-4 text-right font-mono-data text-muted-foreground">
                            {line.qty.toFixed(2)}
                          </td>
                          <td className="px-3 py-3 sm:px-5 sm:py-4 text-right font-mono-data">
                            <span className={`px-2 py-1 sm:px-2.5 sm:py-1 rounded-md text-xs sm:text-xs font-bold ${
                              isComplete
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : isPartial
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-secondary/50 text-muted-foreground border border-border'
                            }`}>
                              {line.delivered.toFixed(2)}
                            </span>
                          </td>
                          <td className="px-3 py-3 sm:px-5 sm:py-4 text-center">
                            {isComplete ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                            ) : (
                              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mx-auto animate-pulse"></div>
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
                <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <FileText className="w-4 h-4 text-amber-400" />
                </div>
                <h4 className="text-xs font-bold text-secondary-foreground uppercase tracking-wider">Notas</h4>
              </div>
              <div
                className="p-4 sm:p-5 rounded-2xl bg-card/40 border border-border text-secondary-foreground text-xs sm:text-sm whitespace-pre-wrap font-medium leading-relaxed max-h-[150px] overflow-y-auto custom-scrollbar no-scrollbar hover:border-amber-500/20 transition-colors duration-300"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(order.note) }}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OrderDetailsModal;
