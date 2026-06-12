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
  getDeliveryProgress, formatCurrency,
} from '../../services/odoo';
import { RiskPrediction } from './riskTypes';

const PRIORITY_STYLES: Record<string, string> = {
  low: 'bg-emerald-500/10 text-emerald-400',
  normal: 'bg-blue-500/10 text-blue-400',
  high: 'bg-amber-500/10 text-amber-400',
  critical: 'bg-red-500/10 text-red-400',
};
const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baja', normal: 'Normal', high: 'Alta', critical: 'Crítica',
};
const RISK_STYLES: Record<string, string> = {
  low: 'text-emerald-400', medium: 'text-amber-400', high: 'text-red-400',
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
        <button type="button" onClick={row.getToggleExpandedHandler()} className="p-1 text-zinc-400 hover:text-white">
          {row.getIsExpanded() ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      ),
    }),
    columnHelper.accessor('date_order', {
      id: 'date_order',
      header: 'Fecha Orden',
      cell: info => {
        const d = parseOdooDate(info.getValue());
        return <span className="text-zinc-400 text-xs">{d ? format(d, 'dd/MM/yyyy') : '—'}</span>;
      },
    }),
    columnHelper.accessor('commitment_date', {
      id: 'commitment_date',
      header: 'Compromiso',
      cell: ({ row }) => {
        const d = parseOdooDate(row.original.commitment_date);
        const overdue = isOrderOverdue(row.original);
        return (
          <span className={`text-xs ${overdue ? 'text-red-400 font-bold' : 'text-zinc-400'}`}>
            {d ? format(d, 'dd/MM/yyyy') : 'Sin fecha'}
            {overdue && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-red-500/10 text-[10px] uppercase">Vencida</span>}
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
      cell: info => <span className="font-mono font-bold text-white text-sm">{info.getValue()}</span>,
    }),
    columnHelper.accessor('partner_name', {
      id: 'partner_name',
      header: 'Cliente',
      cell: info => <span className="text-sm text-zinc-300">{info.getValue()}</span>,
    }),
    columnHelper.accessor('main_product', {
      id: 'main_product',
      header: 'Producto',
      cell: info => <span className="text-sm text-zinc-400 line-clamp-1 max-w-[260px]">{info.getValue()}</span>,
    }),
    columnHelper.display({
      id: 'progress',
      header: 'Entrega',
      cell: ({ row }) => {
        const pct = getDeliveryProgress(row.original);
        return (
          <div className="min-w-[100px]">
            <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
              <span>{row.original.qty_delivered}/{row.original.qty_total}</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      },
    }),
    columnHelper.accessor('amount_total', {
      id: 'amount_total',
      header: 'Monto',
      cell: ({ row }) => (
        <span className="text-sm font-bold text-white">
          {formatCurrency(row.original.amount_total, row.original.currency)}
        </span>
      ),
    }),
    columnHelper.accessor('salesperson', {
      id: 'salesperson',
      header: 'Vendedor',
      cell: info => <span className="text-xs text-zinc-500">{info.getValue() || '—'}</span>,
    }),
    columnHelper.display({
      id: 'priority',
      header: 'Prioridad',
      cell: ({ row }) => {
        const p = getOrderPriority(row.original);
        return (
          <span className={`px-2 py-1 rounded-lg text-[11px] font-bold uppercase ${PRIORITY_STYLES[p]}`}>
            {PRIORITY_LABELS[p]}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: 'IA',
      cell: ({ row }) => {
        const pred = predictions[row.original.id];
        return (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onClientReport(row.original)}
              title="Generar reporte para el cliente"
              className="p-1.5 hover:bg-purple-500/20 rounded-lg text-zinc-400 hover:text-purple-400 transition-colors"
            >
              <Mail className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onPredictRisk(row.original)}
              disabled={pred === 'loading'}
              title="Predecir riesgo de retraso"
              className="p-1.5 hover:bg-amber-500/20 rounded-lg text-zinc-400 hover:text-amber-400 transition-colors disabled:opacity-50"
            >
              {pred === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
            </button>
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
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-white/5 text-zinc-400 text-xs uppercase tracking-wide">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(header => (
                  <th
                    key={header.id}
                    className={`px-4 py-3 font-bold ${header.column.getCanSort() ? 'cursor-pointer select-none hover:text-white' : ''}`}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-white/5">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-zinc-500">
                  No hay órdenes que coincidan con los filtros
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <React.Fragment key={row.id}>
                  <tr className="hover:bg-white/[0.03] transition-colors">
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                  {row.getIsExpanded() && (
                    <tr className="bg-black/20">
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
        <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wide mb-2">
          Líneas de producto ({order.lines_count})
        </h4>
        {!order.lines || order.lines.length === 0 ? (
          <p className="text-sm text-zinc-500">Sin detalle de líneas</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-zinc-500 text-xs">
              <tr>
                <th className="text-left py-1 pr-4 font-bold">Producto</th>
                <th className="text-right py-1 px-4 font-bold">Cant.</th>
                <th className="text-right py-1 px-4 font-bold">Entregado</th>
                <th className="text-right py-1 px-4 font-bold">P. unitario</th>
                <th className="text-right py-1 pl-4 font-bold">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {order.lines.map((line, i) => (
                <tr key={i} className="text-zinc-300">
                  <td className="py-1.5 pr-4">{line.name}</td>
                  <td className="py-1.5 px-4 text-right">{line.qty}</td>
                  <td className="py-1.5 px-4 text-right">{line.delivered}</td>
                  <td className="py-1.5 px-4 text-right">{formatCurrency(line.price_unit, order.currency)}</td>
                  <td className="py-1.5 pl-4 text-right font-bold">{formatCurrency(line.subtotal, order.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {prediction && prediction !== 'loading' && (
        <div className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl p-3">
          <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${RISK_STYLES[prediction.risk_level]}`} />
          <div className="text-sm">
            <span className={`font-bold ${RISK_STYLES[prediction.risk_level]}`}>
              Riesgo {RISK_LABELS[prediction.risk_level]}:
            </span>{' '}
            <span className="text-zinc-300">{prediction.issue}</span>
            <p className="text-zinc-400 mt-1">💡 {prediction.suggestion}</p>
          </div>
        </div>
      )}
    </div>
  );
}
