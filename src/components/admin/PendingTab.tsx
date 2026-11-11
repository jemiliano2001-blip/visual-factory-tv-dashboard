/**
 * Tab Pendientes — vista de trabajo por defecto del equipo de diseño:
 * qué piezas faltan por entregar, agrupadas por cliente, en orden de urgencia.
 */
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronRight, ListChecks } from 'lucide-react';
import { OdooSaleOrder, getOrderStatus, parseOdooDate } from '../../services/odoo';
import { collectPendingLines, compareByUrgency, type PendingLine } from '../../services/pendingItems';
import { abbreviate } from '../../utils/abbreviate';
import { formatPONumber } from '../../utils/formatters';
import { Badge } from '../ui/badge';
import { STATUS_VARIANT } from './orderStatusMeta';
import { OrderPoEngineer } from './OrdersTable';
import { useMobile } from '../../hooks/useMobile';

interface PendingTabProps {
  orders: OdooSaleOrder[];
  getEngineerName: (order: OdooSaleOrder) => string | null;
}

export default function PendingTab({ orders, getEngineerName }: PendingTabProps) {
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
      <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <Stat label="Piezas pendientes" value={totalMissing} />
        <Stat label="Órdenes afectadas" value={affectedOrders} />
        <Stat label="Órdenes atrasadas" value={overdueOrders} tone={overdueOrders > 0 ? 'text-destructive' : undefined} />
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
            getEngineerName={getEngineerName}
          />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="min-w-0 px-3 py-3 md:px-5 md:py-4">
      <p className="text-xs text-muted-foreground md:text-sm">{label}</p>
      <p className={`mt-1 font-mono-data text-2xl font-semibold tabular-nums md:text-3xl ${tone ?? 'text-foreground'}`}>{value.toLocaleString('es-MX')}</p>
    </div>
  );
}

function ClientGroup({
  client, orderCount, missingQty, lines, collapsed, onToggle, getEngineerName,
}: {
  client: string;
  orderCount: number;
  missingQty: number;
  lines: PendingLine[];
  collapsed: boolean;
  onToggle: () => void;
  getEngineerName: (order: OdooSaleOrder) => string | null;
}) {
  const isMobile = useMobile();
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-accent/40"
      >
        {collapsed ? <ChevronRight className="size-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="size-4 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 break-words font-semibold text-foreground">{client}</span>
        <span className="text-xs text-muted-foreground">
          {orderCount} {orderCount === 1 ? 'orden' : 'órdenes'}
        </span>
        <span className="ml-auto text-sm text-muted-foreground">
          <span className="font-mono-data font-semibold tabular-nums text-primary">{missingQty}</span> pza{missingQty === 1 ? '' : 's'} pendientes
        </span>
      </button>
      {!collapsed && isMobile && (
        <ul className="divide-y divide-border">
          {lines.map((pl, i) => {
            const status = getOrderStatus(pl.order);
            const d = parseOdooDate(pl.order.commitment_date);
            return (
              <li key={`${pl.order.id}-${pl.line.name}-${i}`} className="space-y-1.5 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono-data text-base font-bold text-foreground">{formatPONumber(pl.order.name)}</div>
                    <OrderPoEngineer order={pl.order} engineerName={getEngineerName(pl.order)} />
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono-data text-2xl font-bold tabular-nums leading-none text-primary">{pl.missing}</div>
                    <div className="text-xs text-muted-foreground">faltan</div>
                  </div>
                </div>
                <p className="break-words text-sm text-foreground/90">{abbreviate(pl.line.name)}</p>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="font-mono-data text-xs tabular-nums text-muted-foreground">
                    Compromiso {d ? format(d, 'dd/MM/yyyy') : 'sin fecha'}
                  </span>
                  <Badge variant={STATUS_VARIANT[status.level]}>{status.label}</Badge>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!collapsed && !isMobile && (
        <table className="w-full text-sm">
          <thead className="text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">SO</th>
              <th className="px-4 py-2 text-left font-medium">PO / Ingeniero</th>
              <th className="px-4 py-2 text-left font-medium">Producto</th>
              <th className="px-4 py-2 text-right font-medium">Faltan</th>
              <th className="px-4 py-2 text-left font-medium">Compromiso</th>
              <th className="px-4 py-2 text-left font-medium">Estado</th>
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
                  <td className="px-4 py-2">
                    <OrderPoEngineer order={pl.order} engineerName={getEngineerName(pl.order)} />
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
