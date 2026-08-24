/**
 * Tabla read-only de órdenes Odoo para la consola admin (herramienta de
 * trabajo del equipo de diseño). Sorting por columna, selección de filas para
 * exportar, agrupación opcional por cliente y filas expandibles con líneas
 * de producto, remisiones y la nota de la orden.
 */
import React, { useMemo, useState } from 'react';
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getExpandedRowModel,
  flexRender, createColumnHelper, SortingState, ExpandedState, RowSelectionState,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import DOMPurify from 'dompurify';
import { ChevronDown, ChevronRight, Sparkles, Loader2, Clock } from 'lucide-react';
import {
  OdooSaleOrder, parseOdooDate, getOrderStatus, getDeliveryProgress,
} from '../../services/odoo';
import { getOrderMissingQty } from '../../services/pendingItems';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { DELIVERY_STATE_LABEL, DELIVERY_STATE_VARIANT } from './deliveryMeta';
import { STATUS_VARIANT } from './orderStatusMeta';
import CompanyBadge from '../CompanyBadge';
import { getSmartCompanyName } from '../../utils/customerNames';

interface OrdersTableProps {
  orders: OdooSaleOrder[];
  groupByClient: boolean;
  rowSelection: RowSelectionState;
  onRowSelectionChange: (selection: RowSelectionState) => void;
  explainingId: number | null;
  onExplainRequirements: (order: OdooSaleOrder) => void;
}

const columnHelper = createColumnHelper<OdooSaleOrder>();

export default function OrdersTable({
  orders, groupByClient, rowSelection, onRowSelectionChange, explainingId, onExplainRequirements,
}: OrdersTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'commitment_date', desc: false }]);
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const data = useMemo(() => {
    if (!groupByClient) return orders;
    // Agrupa preservando el orden relativo dentro de cada cliente.
    const byClient = new Map<string, OdooSaleOrder[]>();
    for (const o of orders) {
      const list = byClient.get(o.partner_name) ?? [];
      list.push(o);
      byClient.set(o.partner_name, list);
    }
    return Array.from(byClient.values()).flat();
  }, [orders, groupByClient]);

  const columns = useMemo(() => [
    columnHelper.display({
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? 'indeterminate' : false}
          onCheckedChange={v => table.toggleAllRowsSelected(!!v)}
          aria-label="Seleccionar todas"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={v => row.toggleSelected(!!v)}
          aria-label="Seleccionar fila"
        />
      ),
    }),
    columnHelper.display({
      id: 'expander',
      header: () => null,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={row.getToggleExpandedHandler()}
          aria-label={`${row.getIsExpanded() ? 'Contraer' : 'Expandir'} detalles de ${row.original.name}`}
          aria-expanded={row.getIsExpanded()}
          className="min-h-11 min-w-11 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {row.getIsExpanded() ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
      ),
    }),
    columnHelper.accessor('date_order', {
      id: 'date_order',
      header: 'Fecha Orden',
      meta: { className: 'hidden 2xl:table-cell' },
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
        const status = getOrderStatus(row.original);
        return (
          <span className={`font-mono-data text-xs tabular-nums ${status.level === 'overdue' ? 'font-bold text-destructive' : 'text-muted-foreground'}`}>
            {d ? format(d, 'dd/MM/yyyy') : 'Sin fecha'}
          </span>
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
      cell: info => (
        <div className="flex items-center gap-2">
          <CompanyBadge company={info.getValue()} size="xs" showGlow={false} />
          <span className="text-sm font-medium text-foreground/90">{getSmartCompanyName(info.getValue(), 'card')}</span>
        </div>
      ),
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
    columnHelper.display({
      id: 'missing',
      header: 'Falta',
      cell: ({ row }) => {
        const missing = getOrderMissingQty(row.original);
        return (
          <span className={`font-mono-data text-sm font-bold tabular-nums ${missing > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
            {missing}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: 'status',
      header: 'Estado',
      cell: ({ row }) => {
        const status = getOrderStatus(row.original);
        return <Badge variant={STATUS_VARIANT[status.level]}>{status.label}</Badge>;
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: 'IA',
      cell: ({ row }) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onExplainRequirements(row.original)}
              disabled={explainingId === row.original.id}
              aria-label="Explicar requisitos de la orden"
              className="hover:text-primary"
            >
              {explainingId === row.original.id ? <Loader2 className="animate-spin" /> : <Sparkles />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Explicar requisitos</TooltipContent>
        </Tooltip>
      ),
    }),
  ], [explainingId, onExplainRequirements]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, expanded, rowSelection },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    onRowSelectionChange: updater =>
      onRowSelectionChange(typeof updater === 'function' ? updater(rowSelection) : updater),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
    getRowId: row => String(row.id),
    enableSortingRemoval: false,
  });

  const rows = table.getRowModel().rows;
  let lastClient: string | null = groupByClient ? null : undefined as unknown as string | null;

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
                    aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : 'none'}
                    className={`px-3 py-3 font-bold ${(header.column.columnDef.meta as { className?: string } | undefined)?.className ?? ''}`}
                  >
                    {header.column.getCanSort() ? (
                      <button type="button" onClick={header.column.getToggleSortingHandler()} className="inline-flex min-h-11 items-center gap-1 rounded px-1 text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span className="text-primary" aria-hidden="true">{{ asc: '↑', desc: '↓' }[header.column.getIsSorted() as string] ?? ''}</span>
                      </button>
                    ) : (
                      <span className="inline-flex min-h-11 items-center">{flexRender(header.column.columnDef.header, header.getContext())}</span>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No hay órdenes que coincidan con los filtros
                </td>
              </tr>
            ) : (
              rows.map(row => {
                const showGroupHeader = groupByClient && row.original.partner_name !== lastClient;
                if (showGroupHeader) lastClient = row.original.partner_name;
                return (
                  <React.Fragment key={row.id}>
                    {showGroupHeader && (
                      <tr className="bg-muted/50">
                        <td colSpan={columns.length} className="px-4 py-2 text-xs font-bold uppercase tracking-wide text-foreground">
                          <div className="flex items-center gap-2">
                            <CompanyBadge company={row.original.partner_name} size="xs" showGlow={false} />
                            <span>{getSmartCompanyName(row.original.partner_name, 'header')}</span>
                          </div>
                        </td>
                      </tr>
                    )}
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
                          <ExpandedRow order={row.original} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpandedRow({ order }: { order: OdooSaleOrder }) {
  return (
    <div className="space-y-4">
      {order.delivery_times && (
        <div className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-cyan-300 font-mono-data text-xs">
          <Clock className="size-4 text-cyan-400 shrink-0" aria-hidden="true" />
          <span><strong>Horario de entrega del cliente:</strong> {order.delivery_times}</span>
        </div>
      )}
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

      {order.note && (
        <div>
          <h4 className="mb-2 font-mono-data text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Nota / términos
          </h4>
          <div
            className="prose prose-sm max-w-none text-sm text-foreground/90 [&_a]:text-primary"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(order.note) }}
          />
        </div>
      )}
    </div>
  );
}
