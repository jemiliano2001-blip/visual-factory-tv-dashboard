/**
 * Tab Tool Crib — seguimiento de las partidas de Suprajit: qué falta entregar,
 * cuáles ya están listas para pedir factura o remisión y cuáles ya se pidieron.
 */
import type React from 'react';
import { useMemo } from 'react';
import { format } from 'date-fns';
import { Wrench } from 'lucide-react';
import type { InvoiceRequest } from '../../../shared/invoiceRequests';
import { OdooSaleOrder, getOrderStatus, parseOdooDate } from '../../services/odoo';
import { collectToolCribLines, type ToolCribLine, type ToolCribLineStatus } from '../../services/toolCrib';
import { abbreviate } from '../../utils/abbreviate';
import { formatPONumber } from '../../utils/formatters';
import { EmptyState } from '../ui/empty-state';
import { Badge, type BadgeProps } from '../ui/badge';
import { STATUS_VARIANT } from './orderStatusMeta';
import { OrderPoEngineer } from './OrdersTable';
import { useMobile } from '../../hooks/useMobile';
import type { TableDensity } from './AdminToolbar';

interface ToolCribTabProps {
  orders: OdooSaleOrder[];
  pendingByOrder?: Map<number, InvoiceRequest[]>;
  getEngineerName: (order: OdooSaleOrder) => string | null;
  onOrderClick?: (order: OdooSaleOrder) => void;
  onOrderContextMenu?: (e: React.MouseEvent, order: OdooSaleOrder) => void;
  density?: TableDensity;
}

const LINE_STATUS: Record<ToolCribLineStatus, { label: string; variant: NonNullable<BadgeProps['variant']> }> = {
  pendiente: { label: 'Pendiente', variant: 'muted' },
  solicitada: { label: 'Solicitada', variant: 'info' },
  entregada: { label: 'Entregada', variant: 'success' },
};

export default function ToolCribTab({
  orders,
  pendingByOrder,
  getEngineerName,
  onOrderClick,
  onOrderContextMenu,
  density = 'comfortable',
}: ToolCribTabProps) {
  const isMobile = useMobile();
  const lines = useMemo(() => collectToolCribLines(orders, pendingByOrder), [orders, pendingByOrder]);

  if (lines.length === 0) {
    return (
      <EmptyState
        icon={<Wrench className="size-10 text-muted-foreground" />}
        title="Sin órdenes de Tool Crib con los filtros actuales"
        hint="Aquí aparecen las partidas de las órdenes de Suprajit por facturar."
      />
    );
  }

  const totalMissing = lines.reduce((sum, l) => sum + l.missing, 0);
  const readyToInvoice = lines.filter(l => l.status === 'entregada').length;
  const requestedOrders = new Set(lines.filter(l => l.status === 'solicitada').map(l => l.order.id)).size;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <Stat label="Piezas pendientes" value={totalMissing} />
        <Stat label="Listas para factura o remisión" value={readyToInvoice} />
        <Stat label="Órdenes con solicitud" value={requestedOrders} />
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        {isMobile
          ? <MobileList lines={lines} getEngineerName={getEngineerName} onOrderClick={onOrderClick} />
          : <DesktopTable lines={lines} getEngineerName={getEngineerName} onOrderClick={onOrderClick} onOrderContextMenu={onOrderContextMenu} density={density} />}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 px-3 py-3 md:px-5 md:py-4">
      <p className="text-xs text-muted-foreground md:text-sm">{label}</p>
      <p className="mt-1 font-mono-data text-2xl font-semibold tabular-nums text-foreground md:text-3xl">{value.toLocaleString('es-MX')}</p>
    </div>
  );
}

const lineKey = (l: ToolCribLine, i: number) => `${l.order.id}-${l.line.id ?? l.line.name}-${i}`;

function PartNumber({ value }: { value: string | null }) {
  return value
    ? <span className="font-mono-data font-semibold text-foreground">{value}</span>
    : <span className="text-xs text-muted-foreground">Sin no. de parte</span>;
}

function MobileList({ lines, getEngineerName, onOrderClick }: Pick<ToolCribTabProps, 'getEngineerName' | 'onOrderClick'> & { lines: ToolCribLine[] }) {
  return (
    <ul className="divide-y divide-border">
      {lines.map((l, i) => {
        const urgency = getOrderStatus(l.order);
        const d = parseOdooDate(l.order.commitment_date);
        const st = LINE_STATUS[l.status];
        return (
          <li key={lineKey(l, i)}>
            <button
              type="button"
              onClick={() => onOrderClick?.(l.order)}
              className="block w-full cursor-pointer space-y-1.5 px-4 py-3 text-left transition-colors hover:bg-accent/30 active:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono-data text-base font-bold text-foreground">{formatPONumber(l.order.name)}</div>
                  <OrderPoEngineer order={l.order} engineerName={getEngineerName(l.order)} />
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono-data text-2xl font-bold tabular-nums leading-none text-primary">{l.missing}</div>
                  <div className="text-xs text-muted-foreground">faltan</div>
                </div>
              </div>
              <div><PartNumber value={l.partNumber} /></div>
              <p className="break-words text-sm text-foreground/90">{abbreviate(l.line.name)}</p>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="font-mono-data text-xs tabular-nums text-muted-foreground">
                  Compromiso {d ? format(d, 'dd/MM/yyyy') : 'sin fecha'}
                </span>
                <span className="flex gap-1.5">
                  <Badge variant={st.variant}>{st.label}</Badge>
                  <Badge variant={STATUS_VARIANT[urgency.level]}>{urgency.label}</Badge>
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function DesktopTable({
  lines, getEngineerName, onOrderClick, onOrderContextMenu, density,
}: Pick<ToolCribTabProps, 'getEngineerName' | 'onOrderClick' | 'onOrderContextMenu'> & { lines: ToolCribLine[]; density: TableDensity }) {
  const isComfortable = density === 'comfortable';
  const cellPad = isComfortable ? 'px-4 py-3' : 'px-4 py-2';
  const headPad = isComfortable ? 'px-4 py-2.5' : 'px-4 py-2';
  return (
    <table className={`w-full ${isComfortable ? 'text-[15px]' : 'text-sm'}`}>
      <thead className="text-xs font-medium text-muted-foreground">
        <tr>
          <th scope="col" className={`${headPad} text-left font-medium`}>SO</th>
          <th scope="col" className={`${headPad} text-left font-medium`}>PO / Ingeniero</th>
          <th scope="col" className={`${headPad} text-left font-medium`}>No. de parte</th>
          <th scope="col" className={`${headPad} text-left font-medium`}>Producto</th>
          <th scope="col" className={`${headPad} text-right font-medium`}>Faltan</th>
          <th scope="col" className={`${headPad} text-left font-medium`}>Compromiso</th>
          <th scope="col" className={`${headPad} text-left font-medium`}>Urgencia</th>
          <th scope="col" className={`${headPad} text-left font-medium`}>Partida</th>
          <th scope="col" className={`${headPad} text-left font-medium`}>Impreso</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {lines.map((l, i) => {
          const urgency = getOrderStatus(l.order);
          const d = parseOdooDate(l.order.commitment_date);
          const st = LINE_STATUS[l.status];
          return (
            <tr
              key={lineKey(l, i)}
              onClick={onOrderClick ? (e) => {
                if ((e.target as HTMLElement).closest('button, a, input')) return;
                onOrderClick(l.order);
              } : undefined}
              onContextMenu={onOrderContextMenu ? (e) => onOrderContextMenu(e, l.order) : undefined}
              className={onOrderClick ? 'cursor-pointer transition-colors hover:bg-accent/30' : 'hover:bg-accent/20'}
            >
              <td className={`whitespace-nowrap ${cellPad} font-mono-data font-bold text-foreground`}>
                {onOrderClick ? (
                  <button
                    type="button"
                    onClick={() => onOrderClick(l.order)}
                    className="cursor-pointer rounded text-left font-mono-data font-bold text-foreground underline-offset-2 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {formatPONumber(l.order.name)}
                  </button>
                ) : formatPONumber(l.order.name)}
              </td>
              <td className={cellPad}><OrderPoEngineer order={l.order} engineerName={getEngineerName(l.order)} /></td>
              <td className={cellPad}><PartNumber value={l.partNumber} /></td>
              <td className={`${cellPad} text-foreground/90`}>{abbreviate(l.line.name)}</td>
              <td className={`${cellPad} text-right font-mono-data font-bold tabular-nums text-primary`}>{l.missing}</td>
              <td className={`whitespace-nowrap ${cellPad} font-mono-data text-xs tabular-nums text-muted-foreground`}>
                {d ? format(d, 'dd/MM/yyyy') : 'Sin fecha'}
              </td>
              <td className={cellPad}><Badge variant={STATUS_VARIANT[urgency.level]}>{urgency.label}</Badge></td>
              <td className={cellPad}><Badge variant={st.variant}>{st.label}</Badge></td>
              <td className={`${cellPad} text-muted-foreground`}>—</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
