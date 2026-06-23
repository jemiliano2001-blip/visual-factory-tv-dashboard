/**
 * Tabla read-only de órdenes Odoo para la consola admin.
 * Sorting por columna y filas expandibles con líneas de producto.
 */
import React, { useMemo, useState } from 'react';
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getExpandedRowModel,
  flexRender, createColumnHelper, SortingState, ExpandedState,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { ChevronDown, ChevronRight, Mail, Activity, Loader2, AlertTriangle } from 'lucide-react';
import {
  OdooSaleOrder, parseOdooDate, getOrderPriority, isOrderOverdue,
  getDeliveryProgress,
} from '../../services/odoo';
import { RiskPrediction } from './riskTypes';
import { Badge, type BadgeProps } from '../ui/badge';
import { Button } from '../ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';

type BadgeVariant = BadgeProps['variant'];

const DELIVERY_STATE_VARIANT: Record<string, BadgeVariant> = {
  done: 'success',
  assigned: 'info',
  waiting: 'warning',
  confirmed: 'warning',
  draft: 'muted',
  cancel: 'muted',
};

const DELIVERY_STATE_LABEL: Record<string, string> = {
  done: 'Hecho',
  assigned: 'Listo',
  waiting: 'En espera',
  confirmed: 'Confirmado',
  draft: 'Borrador',
  cancel: 'Cancelado',
};

const PRIORITY_VARIANT: Record<string, BadgeVariant> = {
  low: 'success', normal: 'info', high: 'warning', critical: 'danger',
};
const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baja', normal: 'Normal', high: 'Alta', critical: 'Crítica',
};
const RISK_TEXT: Record<string, string> = {
  low: 'text-success', medium: 'text-warning', high: 'text-destructive',
};
const RISK_LABELS: Record<string, string> = {
  low: 'Bajo', medium: 'Medio', high: 'Alto',
};

interface OrdersTableProps {
  orders: OdooSaleOrder[];
  /** Predicciones por id de orden; 'loading' mientras la IA trabaja */
  predictions: Record<number, RiskPrediction | 'loading'>;
  onClientReport: (order: OdooSaleOrder) => void;
  onPredictRisk: (order: OdooSaleOrder) => void;
}

const columnHelper = createColumnHelper<OdooSaleOrder>();

export default function OrdersTable({ orders, predictions, onClientReport, onPredictRisk }: OrdersTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'commitment_date', desc: false }]);
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const columns = useMemo(() => [
    columnHelper.display({
      id: 'expander',
      header: () => null,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={row.getToggleExpandedHandler()}
          className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {row.getIsExpanded() ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
      ),
    }),
    columnHelper.accessor('date_order', {
      id: 'date_order',
      header: 'Fecha Orden',
      meta: { className: 'hidden 2xl:table-cell' } as any,
      cell: info => {
        const d = parseOdooDate(info.getValue());
        return <span className="font-mono-data text-xs tabular-nums text-muted-foreground">{d ? format(d, 'dd/MM/yyyy') : '—'}</span>;
      },
    }),
    columnHelper.accessor('commitment_date', {
      id: 'commitment_date',
      header: 'Compromiso',
      cell: ({ row }) => {
        const d = parseOdooDate(row.original.commitment_date);
        const overdue = isOrderOverdue(row.original);
        return (
          <div className="flex items-center gap-2">
            <span className={`font-mono-data text-xs tabular-nums ${overdue ? 'font-bold text-destructive' : 'text-muted-foreground'}`}>
              {d ? format(d, 'dd/MM/yyyy') : 'Sin fecha'}
            </span>
            {overdue && <Badge variant="danger">Vencida</Badge>}
          </div>
        );
      },
      sortingFn: (a, b) =>
        (parseOdooDate(a.original.commitment_date)?.getTime() ?? Infinity) -
        (parseOdooDate(b.original.commitment_date)?.getTime() ?? Infinity),
    }),
    columnHelper.accessor('name', {
      id: 'name',
      header: 'SO',
      cell: info => <span className="font-mono-data text-sm font-bold text-foreground">{info.getValue()}</span>,
    }),
    columnHelper.accessor('partner_name', {
      id: 'partner_name',
      header: 'Cliente',
      cell: info => <span className="text-sm text-foreground/90">{info.getValue()}</span>,
    }),
    columnHelper.accessor('main_product', {
      id: 'main_product',
      header: 'Producto',
      cell: info => <span className="line-clamp-1 max-w-[260px] text-sm text-muted-foreground">{info.getValue()}</span>,
    }),
    columnHelper.display({
      id: 'progress',
      header: 'Entrega',
      cell: ({ row }) => {
        const pct = getDeliveryProgress(row.original);
        return (
          <div className="min-w-[110px]">
            <div className="mb-1 flex justify-between font-mono-data text-[11px] tabular-nums text-muted-foreground">
              <span>{row.original.qty_delivered}/{row.original.qty_total}</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${pct >= 100 ? 'bg-success' : 'bg-primary'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      },
    }),
    columnHelper.accessor('salesperson', {
      id: 'salesperson',
      header: 'Vendedor',
      meta: { className: 'hidden 2xl:table-cell' } as any,
      cell: info => <span className="text-xs text-muted-foreground">{info.getValue() || '—'}</span>,
    }),
    columnHelper.display({
      id: 'priority',
      header: 'Prioridad',
      cell: ({ row }) => {
        const p = getOrderPriority(row.original);
        return <Badge variant={PRIORITY_VARIANT[p]}>{PRIORITY_LABELS[p]}</Badge>;
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: 'IA',
      cell: ({ row }) => {
        const pred = predictions[row.original.id];
        return (
          <div className="flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onClientReport(row.original)}
                  aria-label="Generar reporte para el cliente"
                  className="hover:text-primary"
                >
                  <Mail />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reporte para el cliente</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onPredictRisk(row.original)}
                  disabled={pred === 'loading'}
                  aria-label="Predecir riesgo de retraso"
                  className="hover:text-warning"
                >
                  {pred === 'loading' ? <Loader2 className="animate-spin" /> : <Activity />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Predecir riesgo</TooltipContent>
            </Tooltip>
          </div>
        );
      },
    }),
  ], [predictions, onClientReport, onPredictRisk]);

  const table = useReactTable({
    data: orders,
    columns,
    state: { sorting, expanded },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
    getRowId: row => String(row.id),
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-border bg-muted/40 font-mono-data text-[11px] uppercase tracking-wider text-muted-foreground">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(header => (
                  <th
                    key={header.id}
                    className={`px-3 py-3 font-bold ${(header.column.columnDef.meta as { className?: string } | undefined)?.className ?? ''} ${header.column.getCanSort() ? 'cursor-pointer select-none transition-colors hover:text-foreground' : ''}`}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <span className="inline-flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <span className="text-primary">
                        {{ asc: '↑', desc: '↓' }[header.column.getIsSorted() as string] ?? ''}
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No hay órdenes que coincidan con los filtros
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <React.Fragment key={row.id}>
                  <tr className="transition-colors hover:bg-accent/40">
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className={`px-3 py-3 ${(cell.column.columnDef.meta as { className?: string } | undefined)?.className ?? ''}`}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                  {row.getIsExpanded() && (
                    <tr className="bg-background/50">
                      <td colSpan={columns.length} className="px-6 py-4">
                        <ExpandedRow order={row.original} prediction={predictions[row.original.id]} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpandedRow({ order, prediction }: { order: OdooSaleOrder; prediction?: RiskPrediction | 'loading' }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="mb-2 font-mono-data text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Líneas de producto ({order.lines_count})
        </h4>
        {!order.lines || order.lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin detalle de líneas</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="font-mono-data text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-1 pr-4 text-left font-bold">Producto</th>
                <th className="px-4 py-1 text-right font-bold">Cant.</th>
                <th className="py-1 pl-4 text-right font-bold">Entregado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {order.lines.map((line, i) => (
                <tr key={`${line.name}-${i}`} className="text-foreground/90">
                  <td className="py-1.5 pr-4">{line.name}</td>
                  <td className="px-4 py-1.5 text-right font-mono-data tabular-nums">{line.qty}</td>
                  <td className="py-1.5 pl-4 text-right font-mono-data tabular-nums">{line.delivered}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {order.deliveries && order.deliveries.length > 0 && (
        <div>
          <h4 className="mb-2 font-mono-data text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Remisiones ({order.deliveries.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {order.deliveries.map((d, i) => (
              <div key={`${d.name}-${i}`} className="flex items-center gap-1.5 rounded-lg border border-border bg-background/50 px-2 py-1">
                <span className="font-mono-data text-xs text-foreground/90">{d.name}</span>
                <Badge variant={DELIVERY_STATE_VARIANT[d.state] ?? 'muted'}>
                  {DELIVERY_STATE_LABEL[d.state] ?? d.state}
                </Badge>
                {d.date_done && (
                  <span className="font-mono-data text-[9px] tabular-nums text-muted-foreground">{d.date_done.split(' ')[0]}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {prediction && prediction !== 'loading' && (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-background/50 p-3">
          <AlertTriangle className={`mt-0.5 size-5 shrink-0 ${RISK_TEXT[prediction.risk_level]}`} />
          <div className="text-sm">
            <span className={`font-bold ${RISK_TEXT[prediction.risk_level]}`}>
              Riesgo {RISK_LABELS[prediction.risk_level]}:
            </span>{' '}
            <span className="text-foreground/90">{prediction.issue}</span>
            <p className="mt-1 text-muted-foreground">{prediction.suggestion}</p>
          </div>
        </div>
      )}
    </div>
  );
}
