/**
 * Tab Pendientes — vista de trabajo por defecto del equipo de diseño:
 * qué piezas faltan por entregar, agrupadas por cliente, en orden de urgencia.
 */
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronRight, ListChecks, Sparkles, Loader2 } from 'lucide-react';
import { OdooSaleOrder, getOrderStatus, parseOdooDate } from '../../services/odoo';
import { collectPendingLines, compareByUrgency, type PendingLine } from '../../services/pendingItems';
import { abbreviate } from '../../utils/abbreviate';
import { formatPONumber } from '../../utils/formatters';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { STATUS_VARIANT } from './orderStatusMeta';

interface PendingTabProps {
  orders: OdooSaleOrder[];
  onSummarize: () => void;
  isSummarizing: boolean;
}

export default function PendingTab({ orders, onSummarize, isSummarizing }: PendingTabProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => {
    const byClient = new Map<string, OdooSaleOrder[]>();
    for (const o of orders) {
      const list = byClient.get(o.partner_name) ?? [];
      list.push(o);
      byClient.set(o.partner_name, list);
    }
    return Array.from(byClient.entries())
      .map(([client, clientOrders]) => ({
        client,
        orders: [...clientOrders].sort(compareByUrgency),
        lines: collectPendingLines(clientOrders),
      }))
      .filter(g => g.lines.length > 0)
      .sort((a, b) => compareByUrgency(a.orders[0], b.orders[0]));
  }, [orders]);

  const allLines = useMemo(() => collectPendingLines(orders), [orders]);
  const totalMissing = allLines.reduce((sum, pl) => sum + pl.missing, 0);
  const overdueOrders = new Set(
    allLines.filter(pl => getOrderStatus(pl.order).level === 'overdue').map(pl => pl.order.id)
  ).size;
  const affectedOrders = new Set(allLines.map(pl => pl.order.id)).size;

  const toggle = (client: string) =>
    setCollapsed(c => ({ ...c, [client]: !c[client] }));

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card py-24 text-center text-muted-foreground">
        <ListChecks className="size-10 text-success" />
        <p className="font-semibold text-foreground">Sin pendientes con los filtros actuales.</p>
        <p className="max-w-md text-sm">Todo lo que coincide con los filtros ya está entregado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-card">
        <Stat label="Piezas pendientes" value={totalMissing} />
        <Stat label="Órdenes afectadas" value={affectedOrders} />
        <Stat label="Órdenes atrasadas" value={overdueOrders} tone={overdueOrders > 0 ? 'text-destructive' : undefined} />
        <Button type="button" variant="secondary" className="ml-auto" onClick={onSummarize} disabled={isSummarizing || orders.length === 0}>
          {isSummarizing ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Plan del día
        </Button>
      </div>

      <div className="space-y-3">
        {groups.map(g => (
          <ClientGroup
            key={g.client}
            client={g.client}
            orderCount={g.orders.length}
            missingQty={g.lines.reduce((s, pl) => s + pl.missing, 0)}
            lines={g.lines}
            collapsed={!!collapsed[g.client]}
            onToggle={() => toggle(g.client)}
          />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <p className={`font-mono-data text-2xl font-bold tabular-nums ${tone ?? 'text-foreground'}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ClientGroup({
  client, orderCount, missingQty, lines, collapsed, onToggle,
}: {
  client: string;
  orderCount: number;
  missingQty: number;
  lines: PendingLine[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 border-b border-border bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-accent/40"
      >
        {collapsed ? <ChevronRight className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
        <span className="font-bold text-foreground">{client}</span>
        <span className="text-xs text-muted-foreground">
          {orderCount} {orderCount === 1 ? 'orden' : 'órdenes'}
        </span>
        <span className="ml-auto font-mono-data text-sm font-bold tabular-nums text-primary">
          {missingQty} pza{missingQty === 1 ? '' : 's'} pendientes
        </span>
      </button>
      {!collapsed && (
        <table className="w-full text-sm">
          <thead className="font-mono-data text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-bold">SO</th>
              <th className="px-4 py-2 text-left font-bold">Producto</th>
              <th className="px-4 py-2 text-right font-bold">Faltan</th>
              <th className="px-4 py-2 text-left font-bold">Compromiso</th>
              <th className="px-4 py-2 text-left font-bold">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((pl, i) => {
              const status = getOrderStatus(pl.order);
              const d = parseOdooDate(pl.order.commitment_date);
              return (
                <tr key={`${pl.order.id}-${pl.line.name}-${i}`} className="hover:bg-accent/20">
                  <td className="whitespace-nowrap px-4 py-2 font-mono-data font-bold text-foreground">
                    {formatPONumber(pl.order.name)}
                  </td>
                  <td className="px-4 py-2 text-foreground/90">{abbreviate(pl.line.name)}</td>
                  <td className="px-4 py-2 text-right font-mono-data font-bold tabular-nums text-primary">
                    {pl.missing}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 font-mono-data text-xs tabular-nums text-muted-foreground">
                    {d ? format(d, 'dd/MM/yyyy') : 'Sin fecha'}
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
