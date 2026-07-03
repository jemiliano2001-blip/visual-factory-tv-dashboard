import { format } from 'date-fns';
import { FileText, Printer } from 'lucide-react';
import { OdooSaleOrder, parseOdooDate } from '../../services/odoo';
import { abbreviate } from '../../utils/abbreviate';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface OrderReportTabProps {
  orders: OdooSaleOrder[];
}

function formatDate(value: string): string {
  const date = parseOdooDate(value);
  return date ? format(date, 'dd/MM/yyyy') : 'Sin fecha';
}

/** Términos vienen como HTML de Odoo — para la tabla solo queremos el texto plano. */
function stripHtml(html: string | null): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent?.replace(/\s+/g, ' ').trim() || '';
}

/** Corta a `max` caracteres con elipsis solo cuando realmente corta. */
function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

export default function OrderReportTab({ orders }: OrderReportTabProps) {
  const groups = new Map<string, OdooSaleOrder[]>();
  for (const order of orders) {
    const list = groups.get(order.partner_name) ?? [];
    list.push(order);
    groups.set(order.partner_name, list);
  }

  return (
    <div className="space-y-4">
      <Card className="order-report-no-print">
        <CardHeader>
          <CardTitle>Reporte de órdenes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono-data text-3xl font-bold text-foreground">{orders.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Órdenes incluidas en el reporte — respeta los filtros activos en la pestaña Órdenes.
            </p>
          </div>
          <Button type="button" onClick={() => window.print()} disabled={orders.length === 0}>
            <Printer /> Imprimir / PDF
          </Button>
        </CardContent>
      </Card>

      {orders.length === 0 ? (
        <Card className="order-report-no-print min-h-[360px]">
          <CardContent className="flex min-h-[360px] flex-col items-center justify-center text-center text-muted-foreground">
            <FileText className="mb-3 size-10 text-primary" />
            <p className="font-semibold text-foreground">No hay órdenes que coincidan con los filtros actuales.</p>
            <p className="mt-1 max-w-md text-sm">
              Ajusta los filtros en la pestaña Órdenes para incluir órdenes en este reporte.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="order-report-printable">
          <CardContent className="pt-5">
            <div className="mb-4 border-b border-border pb-3 text-center">
              <h2 className="text-lg font-bold uppercase tracking-wide text-foreground">
                Reporte de órdenes al {format(new Date(), 'dd/MM/yyyy')}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {orders.length} órdenes · {groups.size} clientes
              </p>
            </div>
            <table className="order-report-table w-full text-sm">
              <thead>
                <tr className="border-b-2 border-border font-mono-data text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-2 py-1.5 text-left">Referencia</th>
                  <th className="px-2 py-1.5 text-left">Creado el</th>
                  <th className="px-2 py-1.5 text-right">Cant.</th>
                  <th className="px-2 py-1.5 text-left">Descripción</th>
                  <th className="px-2 py-1.5 text-left">Términos y condiciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {Array.from(groups.entries()).map(([client, clientOrders]) => (
                  <ClientGroup key={client} client={client} orders={clientOrders} />
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ClientGroup({ client, orders }: { client: string; orders: OdooSaleOrder[] }) {
  return (
    <>
      <tr className="order-report-group bg-muted/50">
        <td colSpan={5} className="px-2 py-1.5 font-bold uppercase tracking-wide text-foreground">
          {client} ({orders.length})
        </td>
      </tr>
      {orders.map(order => (
        <tr key={order.id} className="align-top">
          <td className="whitespace-nowrap px-2 py-1.5 font-mono-data">
            {order.name}
            {order.customer_reference && (
              <div className="text-[11px] text-muted-foreground">PO: {order.customer_reference}</div>
            )}
          </td>
          <td className="whitespace-nowrap px-2 py-1.5 font-mono-data">{formatDate(order.date_order)}</td>
          <td className="px-2 py-1.5 text-right font-mono-data tabular-nums">{order.qty_total}</td>
          <td className="px-2 py-1.5 text-foreground/90">
            {abbreviate(order.main_product)}
            {order.lines_count > 1 && (
              <span className="text-muted-foreground"> (+{order.lines_count - 1} líneas más)</span>
            )}
          </td>
          <td className="px-2 py-1.5 text-xs text-muted-foreground">
            {truncate(abbreviate(stripHtml(order.note)), 90)}
          </td>
        </tr>
      ))}
    </>
  );
}
