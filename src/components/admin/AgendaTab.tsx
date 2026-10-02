/**
 * Tab Agenda — qué vence cada día, para planear la semana: atrasadas,
 * hoy, mañana, cada día próximo, más adelante y sin fecha.
 */
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CalendarDays, ChevronDown, ChevronRight } from 'lucide-react';
import { OdooSaleOrder, getOrderStatus, parseOdooDate } from '../../services/odoo';
import { buildAgenda, type AgendaGroup } from '../../services/agenda';
import { getOrderMissingQty } from '../../services/pendingItems';
import { abbreviate } from '../../utils/abbreviate';
import { formatPONumber } from '../../utils/formatters';
import { Badge } from '../ui/badge';
import { STATUS_VARIANT } from './orderStatusMeta';

interface AgendaTabProps {
  orders: OdooSaleOrder[];
}

export default function AgendaTab({ orders }: AgendaTabProps) {
  // Las atrasadas suelen ser muchas: arrancan cerradas para ver primero lo que viene.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ overdue: true });
  const groups = useMemo(() => buildAgenda(orders), [orders]);

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card py-24 text-center text-muted-foreground">
        <CalendarDays className="size-10 text-success" />
        <p className="font-semibold text-foreground">Nada por entregar con los filtros actuales.</p>
        <p className="max-w-md text-sm">No hay órdenes con piezas pendientes que coincidan.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map(group => (
        <DayGroup
          key={group.key}
          group={group}
          collapsed={!!collapsed[group.key]}
          onToggle={() => setCollapsed(c => ({ ...c, [group.key]: !c[group.key] }))}
        />
      ))}
    </div>
  );
}

function DayGroup({ group, collapsed, onToggle }: { group: AgendaGroup; collapsed: boolean; onToggle: () => void }) {
  const pieces = group.orders.reduce((sum, o) => sum + getOrderMissingQty(o), 0);
  const tone = group.kind === 'overdue' ? 'text-destructive' : 'text-foreground';

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-2 border-b border-border bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-accent/40"
      >
        {collapsed ? <ChevronRight className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
        <span className={`font-semibold capitalize ${tone}`}>{group.label}</span>
        <span className="text-xs text-muted-foreground">
          {group.orders.length} {group.orders.length === 1 ? 'orden' : 'órdenes'}
        </span>
        <span className="ml-auto text-sm text-muted-foreground">
          <span className="font-mono-data font-semibold tabular-nums text-primary">{pieces}</span> pza{pieces === 1 ? '' : 's'} pendientes
        </span>
      </button>
      {!collapsed && (
        <table className="w-full text-sm">
          <thead className="text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">SO</th>
              <th className="px-4 py-2 text-left font-medium">Cliente</th>
              <th className="px-4 py-2 text-left font-medium">Producto</th>
              <th className="px-4 py-2 text-right font-medium">Faltan</th>
              <th className="px-4 py-2 text-left font-medium">Compromiso</th>
              <th className="px-4 py-2 text-left font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {group.orders.map(order => {
              const status = getOrderStatus(order);
              const due = parseOdooDate(order.commitment_date);
              return (
                <tr key={order.id} className="hover:bg-accent/20">
                  <td className="whitespace-nowrap px-4 py-2 font-mono-data font-bold text-foreground">
                    {formatPONumber(order.name)}
                    {order.customer_reference && <div className="text-xs font-normal text-muted-foreground">PO: {order.customer_reference}</div>}
                  </td>
                  <td className="px-4 py-2 text-foreground/90">{order.partner_name}</td>
                  <td className="px-4 py-2 text-foreground/90">{abbreviate(order.main_product)}</td>
                  <td className="px-4 py-2 text-right font-mono-data font-bold tabular-nums text-primary">{getOrderMissingQty(order)}</td>
                  <td className="whitespace-nowrap px-4 py-2 font-mono-data text-xs tabular-nums text-muted-foreground">
                    {due ? format(due, 'dd/MM/yyyy') : 'Sin fecha'}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={STATUS_VARIANT[status.level]}>{status.label}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
