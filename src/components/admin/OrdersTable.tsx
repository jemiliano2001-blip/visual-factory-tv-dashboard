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
import { ChevronDown, ChevronRight, Clock } from 'lucide-react';
import {
  OdooSaleOrder, parseOdooDate, getOrderStatus, getDeliveryProgress,
} from '../../services/odoo';
import { getOrderMissingQty } from '../../services/pendingItems';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select';
import { DELIVERY_STATE_LABEL, DELIVERY_STATE_VARIANT } from './deliveryMeta';
import { STATUS_VARIANT } from './orderStatusMeta';
import CompanyBadge from '../CompanyBadge';
import { getSmartCompanyName } from '../../utils/customerNames';
import { extractOrderNoteMeta } from '../../services/orderNoteParser';
import type { EngineerRosterItem } from '../../../shared/orderAssignments';
import type { InvoiceRequest } from '../../../shared/invoiceRequests';
import { RequestBadges } from '../RequestDialog';

interface OrdersTableProps {
  orders: OdooSaleOrder[];
  groupByClient: boolean;
  rowSelection: RowSelectionState;
  onRowSelectionChange: (selection: RowSelectionState) => void;
  engineers: EngineerRosterItem[];
  getEngineerId: (order: OdooSaleOrder) => string | null;
  /** Asigna (o desasigna con null) las SO indicadas por nombre. */
  onAssign: (orderKeys: string[], engineerId: string | null) => void;
  /** Solicitudes de factura/remisión pendientes por id de orden. */
  pendingByOrder?: Map<number, InvoiceRequest[]>;
}

const UNASSIGNED = '__unassigned__';

/** PO de la compañía y SMV a cargo, para pintar bajo la SO en Pendientes, Agenda y Entregas. */
export function OrderPoEngineer({ order, engineerName }: { order: OdooSaleOrder; engineerName?: string | null }) {
  const { poNumber } = extractOrderNoteMeta(order);
  return (
    <>
      {poNumber && <div className="font-mono-data text-xs font-bold text-data">PO.{poNumber}</div>}
      <div className="text-xs font-normal text-muted-foreground">Ing: {engineerName ?? 'Sin asignar'}</div>
    </>
  );
}

/** Selector directo de ingeniero SMV; compartido por la tabla y la barra de lote. */
export function EngineerSelect({ engineers, value, onChange, ariaLabel, className }: {
  engineers: EngineerRosterItem[];
  value: string | null;
  onChange: (engineerId: string | null) => void;
  ariaLabel: string;
  className?: string;
}) {
  const label = engineers.find(e => e.id === value)?.name ?? 'Sin asignar';
  return (
    <Select value={value ?? UNASSIGNED} onValueChange={v => onChange(v && v !== UNASSIGNED ? v : null)}>
      <SelectTrigger aria-label={ariaLabel} className={`min-h-11 min-w-[160px] ${className ?? ''}`}>
        <SelectValue>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>Sin asignar</SelectItem>
        {engineers.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

const columnHelper = createColumnHelper<OdooSaleOrder>();

export default function OrdersTable({
  orders, groupByClient, rowSelection, onRowSelectionChange, engineers, getEngineerId, onAssign, pendingByOrder,
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

  const groupStats = useMemo(() => {
    const stats = new Map<string, { orders: number; missing: number }>();
    for (const o of orders) {
      const s = stats.get(o.partner_name) ?? { orders: 0, missing: 0 };
      s.orders += 1;
      s.missing += getOrderMissingQty(o);
      stats.set(o.partner_name, s);
    }
    return stats;
  }, [orders]);

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
          aria-label={`Seleccionar la orden ${row.original.name}`}
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
    columnHelper.accessor('name', {
      id: 'name',
      header: 'SO',
      cell: ({ row }) => {
        const created = parseOdooDate(row.original.date_order);
        return (
          <div>
            <span className="font-mono-data text-sm font-bold text-foreground">{row.original.name}</span>
            <RequestBadges requests={pendingByOrder?.get(row.original.id)} />
            <div className="font-mono-data text-xs tabular-nums text-muted-foreground">{created ? format(created, 'dd/MM/yyyy') : '—'}</div>
          </div>
        );
      },
    }),
    columnHelper.display({
      id: 'po',
      header: 'PO de Compañía',
      cell: ({ row }) => {
        const { poNumber, clientContact } = extractOrderNoteMeta(row.original);
        return (
          <div>
            {poNumber
              ? <span className="font-mono-data text-sm font-bold text-data">PO.{poNumber}</span>
              : <Badge variant="muted">Sin PO</Badge>}
            {clientContact && <div className="text-xs text-muted-foreground">Req: {clientContact}</div>}
          </div>
        );
      },
    }),
    columnHelper.display({
      id: 'engineer',
      header: 'Ingeniero SMV',
      cell: ({ row }) => (
        <EngineerSelect
          engineers={engineers}
          value={getEngineerId(row.original)}
          onChange={engineerId => onAssign([row.original.name], engineerId)}
          ariaLabel={`Ingeniero de ${row.original.name}`}
        />
      ),
    }),
    columnHelper.accessor('partner_name', {
      id: 'partner_name',
      header: 'Compañía',
      meta: { className: groupByClient ? 'hidden' : '' },
      cell: info => (
        <div className="flex items-center gap-2">
          <CompanyBadge company={info.getValue()} size="xs" />
          <span className="text-sm font-medium text-foreground/90">{getSmartCompanyName(info.getValue(), 'card')}</span>
        </div>
      ),
    }),
    columnHelper.accessor('main_product', {
      id: 'main_product',
      header: 'Producto / Descripción',
      cell: ({ row }) => (
        <div className="max-w-[300px]">
          <span className="line-clamp-2 text-sm text-foreground/90">{row.original.main_product}</span>
          <span className="text-xs text-muted-foreground">{row.original.lines_count} {row.original.lines_count === 1 ? 'línea' : 'líneas'}</span>
        </div>
      ),
    }),
    columnHelper.display({
      id: 'progress',
      header: 'Entrega / Falta',
      cell: ({ row }) => {
        const pct = getDeliveryProgress(row.original);
        const missing = getOrderMissingQty(row.original);
        return (
          <div className="min-w-[130px]">
            <div className="mb-1 flex justify-between font-mono-data text-xs tabular-nums text-muted-foreground">
              <span>Entregado</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${pct >= 100 ? 'bg-success' : 'bg-primary'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-1 text-sm">
              <span className={`font-mono-data font-bold tabular-nums ${missing > 0 ? 'text-primary' : 'text-muted-foreground'}`}>{missing}</span>
              <span className="text-xs text-muted-foreground"> por entregar</span>
            </div>
          </div>
        );
      },
    }),
    columnHelper.accessor('commitment_date', {
      id: 'commitment_date',
      header: 'Compromiso / Estado',
      cell: ({ row }) => {
        const d = parseOdooDate(row.original.commitment_date);
        const status = getOrderStatus(row.original);
        return (
          <div className="space-y-1">
            <div className={`font-mono-data text-sm tabular-nums ${status.level === 'overdue' ? 'font-bold text-destructive' : 'text-muted-foreground'}`}>
              {d ? format(d, 'dd/MM/yyyy') : 'Sin fecha'}
            </div>
            <Badge variant={STATUS_VARIANT[status.level]}>{status.label}</Badge>
          </div>
        );
      },
      sortingFn: (a, b) =>
        (parseOdooDate(a.original.commitment_date)?.getTime() ?? Infinity) -
        (parseOdooDate(b.original.commitment_date)?.getTime() ?? Infinity),
    }),
  ], [groupByClient, engineers, getEngineerId, onAssign, pendingByOrder]);

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

  const sortedRows = table.getRowModel().rows;
  const rows = useMemo(() => {
    if (!groupByClient) return sortedRows;
    // El orden por columna aplica dentro de cada compañía; las compañías quedan juntas
    // en el orden de su primera fila ordenada.
    const byClient = new Map<string, typeof sortedRows>();
    for (const row of sortedRows) {
      const list = byClient.get(row.original.partner_name) ?? [];
      list.push(row);
      byClient.set(row.original.partner_name, list);
    }
    return Array.from(byClient.values()).flat();
  }, [sortedRows, groupByClient]);
  let lastClient: string | null = groupByClient ? null : undefined as unknown as string | null;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(header => (
                  <th
                    key={header.id}
                    aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : 'none'}
                    className={`px-3 py-3 font-medium ${(header.column.columnDef.meta as { className?: string } | undefined)?.className ?? ''}`}
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
                        <td colSpan={columns.length} className="px-4 py-3 text-sm font-bold text-foreground">
                          <div className="flex flex-wrap items-center gap-2">
                            <CompanyBadge company={row.original.partner_name} size="xs" />
                            <span>{getSmartCompanyName(row.original.partner_name, 'header')}</span>
                            <span className="text-xs font-normal text-muted-foreground">
                              {groupStats.get(row.original.partner_name)?.orders} órdenes ·{' '}
                              <span className="font-mono-data font-semibold tabular-nums text-primary">{groupStats.get(row.original.partner_name)?.missing}</span> pzas pendientes
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                    <tr className="text-sm transition-colors hover:bg-accent/40">
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
        <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
          Líneas de producto ({order.lines_count})
        </h4>
        {!order.lines || order.lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin detalle de líneas</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs font-medium text-muted-foreground">
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
          <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
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
                  <span className="font-mono-data text-xs tabular-nums text-muted-foreground">{d.date_done.split(' ')[0]}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {order.note && (
        <div>
          <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
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
