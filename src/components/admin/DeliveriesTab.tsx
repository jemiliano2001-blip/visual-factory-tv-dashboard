/**
 * Tab Entregas — remisiones (stock.picking) de las órdenes filtradas,
 * agrupadas por estado en el orden útil para el taller: primero lo listo
 * para enviar, al final lo ya entregado (colapsado).
 */
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronRight, Truck, Clock } from 'lucide-react';
import { OdooSaleOrder, OdooDelivery, parseOdooDate } from '../../services/odoo';
import { formatPONumber } from '../../utils/formatters';
import { Badge } from '../ui/badge';
import { DELIVERY_STATE_LABEL, DELIVERY_STATE_VARIANT } from './deliveryMeta';
import CompanyBadge from '../CompanyBadge';
import { getSmartCompanyName } from '../../utils/customerNames';

interface DeliveriesTabProps {
  orders: OdooSaleOrder[];
}

interface DeliveryRow {
  order: OdooSaleOrder;
  delivery: OdooDelivery;
}

const SECTIONS: { states: string[]; title: string; defaultCollapsed: boolean }[] = [
  { states: ['assigned'], title: 'Listo para enviar', defaultCollapsed: false },
  { states: ['confirmed', 'waiting'], title: 'En espera', defaultCollapsed: false },
  { states: ['draft'], title: 'Borrador', defaultCollapsed: false },
  { states: ['done'], title: 'Entregado', defaultCollapsed: true },
];

export default function DeliveriesTab({ orders }: DeliveriesTabProps) {
  const rows = useMemo(() => {
    const list: DeliveryRow[] = [];
    for (const order of orders) {
      for (const delivery of order.deliveries ?? []) {
        if (delivery.state === 'cancel') continue;
        list.push({ order, delivery });
      }
    }
    return list;
  }, [orders]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(
    Object.fromEntries(SECTIONS.map(s => [s.title, s.defaultCollapsed]))
  );

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card py-24 text-center text-muted-foreground">
        <Truck className="size-10 text-muted-foreground" />
        <p className="font-semibold text-foreground">Sin remisiones para los filtros actuales.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {SECTIONS.map(section => {
        const sectionRows = rows.filter(r => section.states.includes(r.delivery.state));
        if (sectionRows.length === 0) return null;
        const isCollapsed = collapsed[section.title];
        return (
          <div key={section.title} className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
            <button
              type="button"
              onClick={() => setCollapsed(c => ({ ...c, [section.title]: !c[section.title] }))}
              className="flex w-full items-center gap-2 border-b border-border bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-accent/40"
            >
              {isCollapsed ? <ChevronRight className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
              <span className="font-bold text-foreground">{section.title}</span>
              <span className="text-xs text-muted-foreground">{sectionRows.length}</span>
            </button>
            {!isCollapsed && (
              <table className="w-full text-sm">
                <thead className="font-mono-data text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-bold">Remisión</th>
                    <th className="px-4 py-2 text-left font-bold">SO</th>
                    <th className="px-4 py-2 text-left font-bold">Cliente</th>
                    <th className="px-4 py-2 text-left font-bold">Estado</th>
                    <th className="px-4 py-2 text-left font-bold">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sectionRows.map((r, i) => {
                    const d = parseOdooDate(r.delivery.date_done);
                    return (
                      <tr key={`${r.delivery.name}-${i}`} className="hover:bg-accent/20">
                        <td className="whitespace-nowrap px-4 py-2 font-mono-data text-foreground/90">{r.delivery.name}</td>
                        <td className="whitespace-nowrap px-4 py-2 font-mono-data font-bold text-foreground">
                          {formatPONumber(r.order.name)}
                        </td>
                        <td className="px-4 py-2 text-foreground/90">
                          <div className="flex items-center gap-2">
                            <CompanyBadge company={r.order.partner_name} size="xs" showGlow={false} />
                            <span className="font-medium">{getSmartCompanyName(r.order.partner_name, 'header')}</span>
                          </div>
                          {r.order.delivery_times && (
                            <div className="flex items-center gap-1 text-[11px] font-mono-data text-cyan-400 mt-0.5" title={`Horario de entrega: ${r.order.delivery_times}`}>
                              <Clock className="size-3 shrink-0" aria-hidden="true" />
                              <span className="truncate max-w-[220px]">{r.order.delivery_times}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant={DELIVERY_STATE_VARIANT[r.delivery.state] ?? 'muted'}>
                            {DELIVERY_STATE_LABEL[r.delivery.state] ?? r.delivery.state}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 font-mono-data text-xs tabular-nums text-muted-foreground">
                          {d ? format(d, 'dd/MM/yyyy') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
